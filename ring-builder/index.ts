import {
  ViewerApp,
  AssetManagerPlugin,
  mobileAndTabletCheck,
  GBufferPlugin,
  ProgressivePlugin,
  TonemapPlugin,
  DiamondPlugin,
  RandomizedDirectionalLightPlugin,
  AssetImporter,
  Color,
} from "webgi";
import { Box3, Vector3 } from "three";
// Ensure global styles are imported
import "./style.css";

// Helper to fix Firebase Storage URLs that might have been decoded by URLSearchParams
function fixFirebaseUrl(url: string): string {
  if (url.includes("firebasestorage.googleapis.com") && url.includes("/o/")) {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split("/o/");
      if (parts.length === 2) {
        const objectPath = parts[1];
        // Re-encode the object path to handle slashes and special characters
        // We decode first to ensure we don't double encode (e.g. %20 becoming %2520)
        return `${urlObj.origin}${parts[0]}/o/${encodeURIComponent(
          decodeURIComponent(objectPath),
        )}${urlObj.search}`;
      }
    } catch (e) {
      console.warn("Error fixing Firebase URL:", e);
    }
  }
  return url;
}

function getBottomSeatCenter(object: any): Vector3 {
  const points: Vector3[] = [];

  object.traverse((o: any) => {
    if (o.isMesh && o.material && !o.name.toLowerCase().includes("diamond")) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const v = new Vector3().fromBufferAttribute(pos, i);
        v.applyMatrix4(o.matrixWorld);
        points.push(v);
      }
    }
  });

  if (points.length === 0) return new Vector3();

  // Find bottom Y
  let minY = Infinity;
  points.forEach((p) => (minY = Math.min(minY, p.y)));

  // Take only bottom 25% for more accurate seat detection
  const threshold = minY + Math.abs(minY) * 0.25;

  const bottomPoints = points.filter((p) => p.y <= threshold);

  // Calculate weighted center for more stability
  const center = new Vector3();
  bottomPoints.forEach((p) => center.add(p));
  center.divideScalar(bottomPoints.length || 1);

  return center;
}

function getMetalBounds(object: any) {
  const box = new Box3();
  box.makeEmpty();
  let hasMetal = false;
  object.traverse((o: any) => {
    if (o.isMesh && o.material && !o.name.toLowerCase().includes("diamond")) {
      const meshBox = new Box3().setFromObject(o);
      box.union(meshBox);
      hasMetal = true;
    }
  });
  return hasMetal ? box : new Box3().setFromObject(object);
}

function attachHeadToShankSmart(
  shankRoot: any,
  headRoot: any,
  headScale = 0.5,
) {
  const shank = shankRoot.modelObject || shankRoot;
  const head = headRoot.modelObject || headRoot;

  if (!shank || !head) return;

  // 1. Detach head if it is already a child of shank
  // This is critical effectively to get the "Pure" shank bounds
  if (head.parent === shank) {
    shank.remove(head);
  }

  // Update shank matrix world after potential child removal
  shank.updateMatrixWorld(true);

  // 2. RESET HEAD TRANSFORM
  head.position.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  head.scale.setScalar(headScale);
  head.updateMatrixWorld(true);

  // 3. Calculate Shank Bounds (Pure)
  const shankBox = new Box3().setFromObject(shank);
  if (shankBox.isEmpty()) {
    console.warn("Shank bounds empty, skipping attachment");
    // Re-attach anyway to ensure it's visible?
    shank.add(head);
    return;
  }

  // 4. Calculate Seat Positions
  // Shank Seat: Top-center of the shank
  const shankSeat = new Vector3(0, shankBox.max.y, 0);

  // Head Seat: Bottom-center of the head geometry
  const headSeat = getBottomSeatCenter(head);

  // 5. Calculate Alignment Delta
  // World position needed to align Head Bottom to Shank Top
  const desiredWorld = shankSeat.clone().sub(headSeat);

  // 6. Adaptive Penetration/Weld
  // Sink it slightly (2% of shank height) into the shank for a secure look
  const shankHeight = shankBox.max.y - shankBox.min.y;
  desiredWorld.y -= shankHeight * 0.02;

  // 7. Apply Transform
  // Convert world delta to local space of the shank
  // (Since head will be a child of shank)
  const local = shank.worldToLocal(desiredWorld.clone());

  shank.add(head);
  head.position.copy(local);
  head.updateMatrixWorld(true);

  console.log("✅ Head attached (smart centered) Y:", head.position.y);
}

async function setupViewer() {
  // Initialize the canvas
  let canvas = document.getElementById("webgi-canvas") as HTMLCanvasElement;
  if (!canvas) {
    // Create canvas if it doesn't exist
    const container = document.getElementById("canvas-container");
    if (container) {
      canvas = document.createElement("canvas");
      canvas.id = "webgi-canvas";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      container.appendChild(canvas);
    } else {
      document.body.style.overflow = "hidden";
      canvas = document.createElement("canvas");
      canvas.id = "webgi-canvas";
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      document.body.appendChild(canvas);
    }
  }

  const viewer = new ViewerApp({
    canvas,
    useGBufferDepth: true,
    isAntialiased: false,
  });

  const isMobile = mobileAndTabletCheck();

  viewer.renderer.displayCanvasScaling = Math.min(window.devicePixelRatio, 1);

  const manager = await viewer.addPlugin(AssetManagerPlugin);

  // Optimize asset loading - disable automatic materials pre-processing for faster loading
  // This will be computed on demand instead
  if ((manager as any).importer) {
    (manager as any).importer.processRawAssets = false;
  }
  const camera = viewer.scene.activeCamera;
  const position = camera.position;
  const target = camera.target;

  // Add WEBGi plugins
  await viewer.addPlugin(GBufferPlugin);
  await viewer.addPlugin(new ProgressivePlugin(32));
  await viewer.addPlugin(
    new TonemapPlugin(true, false, [`// Tonemap pass without vignette`, ``]),
  );
  await viewer.addPlugin(DiamondPlugin);
  await viewer.addPlugin(new RandomizedDirectionalLightPlugin(false));

  // Set background to white
  viewer.setBackground(new Color("#ffffff").convertSRGBToLinear());

  // WEBGi loader events
  const importer = manager.importer as AssetImporter;

  importer.addEventListener("onProgress", (ev) => {
    const progress = ev.loaded / ev.total;
    console.log(`Loading: ${Math.round(progress * 100)}%`);
  });

  viewer.renderer.refreshPipeline();

  // Get URL parameters for models
  const urlParams = new URLSearchParams(window.location.search);
  const shankUrl = urlParams.get("shank");
  const headUrl = urlParams.get("head");
  const matchingBandParam = urlParams.get("matchingBand");
  const caratParam = urlParams.get("carat");

  // Fix Firebase URLs if present (handles decoded slashes)
  const fixedShankUrl = shankUrl ? fixFirebaseUrl(shankUrl) : "";
  const fixedHeadUrl = headUrl ? fixFirebaseUrl(headUrl) : "";

  // State tracking for updates
  let currentShankUrl = fixedShankUrl;
  let currentHeadUrl = fixedHeadUrl;
  let currentMatchingBand = matchingBandParam;
  let currentCarat = caratParam;

  // Update counter to ensure atomic application of configurations
  let updateCounter = 0;

  // Hoisted state variables for access across initial load and updates
  let shankModels: any = [];
  let headModels: any = [];
  let bandModels: any = [];

  let shankRoot: any = null;
  let headRoot: any = null;
  let bandRoot: any = null;
  let bandClone: any = null;

  let metalObjects: any[] = [];
  let diamondObjects: any[] = [];

  // Metal Color Configuration
  const metalColors: Record<string, string> = {
    white: "#c2c2c3",
    yellow: "#e5b377",
    rose: "#f2af83",
  };

  // Helper to safely remove models and their content (handling reparented meshes)
  function removeModels(models: any[], root: any) {
    if (models && models.length > 0) {
      models.forEach((model: any) => {
        if (model.parent) model.parent.remove(model);
        else viewer.scene.remove(model);

        // Check for content that might have been reparented (e.g. head attached to shank)
        const content = model.modelObject;
        if (content && content.parent) {
          content.parent.remove(content);
        }
      });
    } else if (root) {
      if (root.parent) root.parent.remove(root);
      else viewer.scene.remove(root);

      const content = root.modelObject;
      if (content && content.parent) {
        content.parent.remove(content);
      }
    }
  }

  // Helper to change metal color
  function changeMetalColor(colorHex: string, headColorHex?: string) {
    const color = new Color(colorHex).convertSRGBToLinear();
    const headColor = headColorHex
      ? new Color(headColorHex).convertSRGBToLinear()
      : color;

    // Get head object to identify which metal parts belong to it
    const headObj = headRoot?.modelObject || headRoot;

    for (const obj of metalObjects) {
      if (obj.material) {
        // Check if this object is part of the head
        let isPartOfHead = false;
        if (headObj) {
          headObj.traverse((child: any) => {
            if (child === obj) {
              isPartOfHead = true;
            }
          });
        }

        // Apply appropriate color
        obj.material.color = isPartOfHead ? headColor : color;
      }
    }
    viewer.renderer.refreshPipeline();
  }

  // Register event listener EARLY to catch updates during initial load
  window.addEventListener("message", async (event) => {
    if (event.data?.type === "UPDATE_CONFIGURATION") {
      const payload = event.data.payload;
      const thisUpdateId = ++updateCounter;
      console.log("Received update:", payload, "ID:", thisUpdateId);

      const {
        shank: newShankUrl,
        head: newHeadUrl,
        metalColor: newMetalColor,
        carat: newCarat,
        matchingBand: newMatchingBand,
        twoTone: newTwoTone,
        autoRotate: newAutoRotate,
      } = payload;

      let shankChanged = false;
      let headChanged = false;

      // 1. Update Auto Rotate
      if (camera.controls) {
        camera.controls.autoRotate = !!newAutoRotate;
      }

      // 2. Handle Shank Change
      if (newShankUrl) {
        const fixedUrl = fixFirebaseUrl(newShankUrl);
        // targetShankUrl was removed, simply check vs current
        if (fixedUrl !== currentShankUrl) {
          console.log("Shank changing to:", fixedUrl);

          try {
            const models = await manager.addFromPath(fixedUrl);

            // ATOMIC CHECK
            if (updateCounter !== thisUpdateId) {
              console.log("Aborting stale shank update");
              models.forEach((m: any) => {
                if (m.parent) m.parent.remove(m);
                else viewer.scene.remove(m);
              });
              return;
            }

            // Remove OLD models
            removeModels(shankModels, shankRoot);

            shankRoot = models[0];
            shankModels = models;
            shankChanged = true;
            currentShankUrl = fixedUrl;
          } catch (e) {
            console.error("Failed to load new shank", e);
          }
        }
      }

      // 3. Handle Head Change
      if (newHeadUrl) {
        const fixedUrl = fixFirebaseUrl(newHeadUrl);
        if (fixedUrl !== currentHeadUrl) {
          console.log("Head changing to:", fixedUrl);

          try {
            const models = await manager.addFromPath(fixedUrl);

            // ATOMIC CHECK
            if (updateCounter !== thisUpdateId) {
              console.log("Aborting stale head update");
              models.forEach((m: any) => {
                if (m.parent) m.parent.remove(m);
                else viewer.scene.remove(m);
              });
              return;
            }

            // Remove OLD head
            removeModels(headModels, headRoot);

            headRoot = models[0];
            headModels = models;
            headChanged = true;
            currentHeadUrl = fixedUrl;
          } catch (e) {
            console.error("Failed to load new head", e);
          }
        }
      }

      if (updateCounter !== thisUpdateId) return;

      // 4. Handle Carat Change
      let targetScale = 0.5;
      let caratChanged = false;
      if (newCarat) {
        const c = parseFloat(newCarat);
        const oldC = parseFloat(currentCarat || "0");
        if (!isNaN(c) && c > 0) {
          targetScale = 0.5 * Math.pow(c, 1 / 3);
          if (c !== oldC) {
            caratChanged = true;
            currentCarat = newCarat.toString();
          }
        }
      }

      if (shankChanged || headChanged || caratChanged) {
        if (shankRoot && headRoot) {
          try {
            attachHeadToShankSmart(shankRoot, headRoot, targetScale);
          } catch (e) {
            console.error("Error re-attaching head:", e);
          }
        }
      }

      // 5. Handle Matching Band Change
      if (
        (newMatchingBand !== undefined &&
          newMatchingBand !== currentMatchingBand) ||
        shankChanged
      ) {
        // Remove old bands
        removeModels(bandModels, bandRoot);

        if (bandClone) {
          if (bandClone.parent) bandClone.parent.remove(bandClone);
          else viewer.scene.remove(bandClone);
        }

        bandRoot = null;
        bandClone = null;

        let newBandMode = 0;
        let newBandPath = "";
        if (newMatchingBand) {
          if (newMatchingBand.toString().startsWith("http")) {
            newBandPath = fixFirebaseUrl(newMatchingBand);
            newBandMode = 1;
          } else {
            const val = parseInt(newMatchingBand);
            if (!isNaN(val) && val > 0) {
              newBandMode = val;
              newBandPath = "maching-band.glb";
            }
          }
        }

        // Load and position
        if (newBandPath && newBandMode > 0) {
          try {
            const models = await manager.addFromPath(newBandPath);
            // ATOMIC CHECK
            if (updateCounter !== thisUpdateId) {
              models.forEach((m: any) => {
                if (m.parent) m.parent.remove(m);
                else viewer.scene.remove(m);
              });
              return;
            }

            bandRoot = models[0];
            bandModels = models;

            if (bandRoot && shankRoot) {
              // Logic to position band...
              // For brevity in this replacement block, we need to ensure we don't break logic.
              // We can copy the logic or encapsulate it.
              // Since I can't easily encapsulate without massive refactor, I will copy the positioning logic here.
              const shankObj = shankRoot.modelObject || shankRoot;
              const bandObj = bandRoot.modelObject || bandRoot;
              const headObj = headRoot
                ? headRoot.modelObject || headRoot
                : null;

              shankObj.updateMatrixWorld(true);
              bandObj.updateMatrixWorld(true);

              const headParent = headObj?.parent;
              if (headParent) {
                headParent.remove(headObj);
                shankObj.updateMatrixWorld(true);
              }
              const shankBox = getMetalBounds(shankObj);
              if (headParent) {
                headParent.add(headObj);
                headObj.updateMatrixWorld(true);
              }
              const bandBox = getMetalBounds(bandObj);
              const bandWidthZ = bandBox.max.z - bandBox.min.z;
              const gap = -0.05;
              const bandCenterZ = (bandBox.max.z + bandBox.min.z) / 2;
              const targetZ_Left = shankBox.min.z - bandWidthZ / 2 - gap;

              bandObj.position.z += targetZ_Left - bandCenterZ;
              bandObj.updateMatrixWorld(true);

              if (newBandMode === 2) {
                bandClone = bandObj.clone();
                const targetZ_Right = shankBox.max.z + bandWidthZ / 2 + gap;
                bandClone.position.z =
                  bandObj.position.z + (targetZ_Right - targetZ_Left);
                viewer.scene.add(bandClone);
              }
            }
            currentMatchingBand = newMatchingBand;
          } catch (e) {
            console.error("Error updating bands", e);
          }
        } else {
          currentMatchingBand = newMatchingBand;
        }
      }

      if (updateCounter !== thisUpdateId) return;

      // 6. Update Materials
      metalObjects = [];
      diamondObjects = [];
      const collectParts = (root: any) => {
        const obj = root?.modelObject || root;
        if (obj && typeof obj.traverse === "function") {
          obj.traverse((o: any) => {
            if (o.type === "Mesh") {
              if (o.name.toLowerCase().startsWith("diamond"))
                diamondObjects.push(o);
              else metalObjects.push(o);
            }
          });
        }
      };
      if (shankRoot) collectParts(shankRoot);
      if (headRoot) collectParts(headRoot);
      if (bandRoot) collectParts(bandRoot);
      if (bandClone) collectParts(bandClone);

      const mColor = newMetalColor || metalParam || "white";
      const isTT =
        newTwoTone !== undefined ? newTwoTone : twoToneParam === "true";
      let colorHex = metalColors.white;
      if (mColor.includes("yellow")) colorHex = metalColors.yellow;
      else if (mColor.includes("rose")) colorHex = metalColors.rose;

      if (isTT) changeMetalColor(colorHex, metalColors.white);
      else changeMetalColor(colorHex);

      viewer.renderer.refreshPipeline();
    }
  });

  // Determine matching band path and mode
  // Mode: 0 = None, 1 = Left Only, 2 = Left & Right
  let bandMode = 0;
  let bandPath = "";

  if (matchingBandParam) {
    if (matchingBandParam.startsWith("http")) {
      bandPath = fixFirebaseUrl(matchingBandParam);
      bandMode = 1; // Default to single if URL is passed directly
    } else {
      const val = parseInt(matchingBandParam);
      if (!isNaN(val) && val > 0) {
        bandMode = val;
        bandPath = "maching-band.glb";
      }
    }
  }

  // Start all loads in parallel
  const loadPromises = [];

  if (fixedShankUrl) {
    loadPromises.push(
      manager
        .addFromPath(fixedShankUrl)
        .then((models) => {
          // ABORT if update happened during load
          if (updateCounter > 0) {
            console.log("Initial shank load discarded due to pending update");
            models.forEach((m: any) => {
              if (m.parent) m.parent.remove(m);
              else viewer.scene.remove(m);
            });
            return;
          }
          shankModels = models;
          console.log("Shank model loaded");
        })
        .catch((error) => {
          console.error("Error loading shank model:", error);
        }),
    );
  }

  if (fixedHeadUrl) {
    loadPromises.push(
      manager
        .addFromPath(fixedHeadUrl)
        .then((models) => {
          if (updateCounter > 0) {
            console.log("Initial head load discarded due to pending update");
            models.forEach((m: any) => {
              if (m.parent) m.parent.remove(m);
              else viewer.scene.remove(m);
            });
            return;
          }
          headModels = models;
          console.log("Head model loaded");
        })
        .catch((error) => {
          console.error("Error loading head model:", error);
        }),
    );
  }

  if (bandPath && bandMode > 0) {
    loadPromises.push(
      manager
        .addFromPath(bandPath)
        .then((models) => {
          if (updateCounter > 0) {
            console.log("Initial band load discarded due to pending update");
            models.forEach((m: any) => {
              if (m.parent) m.parent.remove(m);
              else viewer.scene.remove(m);
            });
            return;
          }
          bandModels = models;
          console.log("Band model loaded");
        })
        .catch((error) => {
          console.error("Error loading matching band model:", error);
        }),
    );
  }

  // Wait for all loads to complete
  // Join initial load
  await Promise.all(loadPromises);

  // IF AN UPDATE HAPPENED DURING SETUP, STOP HERE.
  if (updateCounter > 0) {
    console.log("Initial setup aborted because configuration was updated.");
    window.parent.postMessage("VIEWER_READY", "*");
    return;
  }

  // Get the root objects - WebGI returns ISceneObject[]
  // Cast to any to access internal properties
  shankRoot = shankModels && shankModels.length > 0 ? shankModels[0] : null;
  headRoot = headModels && headModels.length > 0 ? headModels[0] : null;
  bandRoot = bandModels && bandModels.length > 0 ? bandModels[0] : null;

  if (!shankRoot || !headRoot) {
    console.error("Missing models - Shank:", !!shankRoot, "Head:", !!headRoot);
    const errorEl = document.getElementById("error-message");
    const loader = document.getElementById("loading-screen");

    // Hide loader immediately
    if (loader) loader.style.display = "none";

    // Show error
    if (errorEl) {
      errorEl.style.display = "flex";
      const p = errorEl.querySelector("p");
      if (p) {
        if (!shankRoot && !headRoot) {
          p.textContent = "Both Head and Shank models could not be loaded.";
        } else if (!shankRoot) {
          p.textContent = "Shank model could not be loaded.";
        } else if (!headRoot) {
          p.textContent = "Head model could not be loaded.";
        }
      }
    }
    // Notify parent to stop its spinner so the user sees the error
    window.parent.postMessage("VIEWER_READY", "*");
    return;
  }

  // Calculate target scale from carat parameter
  let targetHeadScale = 0.5; // Default scale for ~1.0ct
  if (caratParam) {
    const carat = parseFloat(caratParam);
    if (!isNaN(carat) && carat > 0) {
      // Scale is proportional to the cube root of the carat weight
      // Formula: newScale = baseScale * (carat)^(1/3)
      // Base scale of 0.5 corresponds to 1.0 carat
      targetHeadScale = 0.5 * Math.pow(carat, 1 / 3);
    }
  }

  if (shankRoot && headRoot) {
    try {
      attachHeadToShankSmart(shankRoot, headRoot, targetHeadScale);
    } catch (e) {
      console.error("Error attaching head to shank:", e);
    }
  }

  // Position Matching Band(s)

  if (bandRoot && shankRoot && bandMode > 0) {
    try {
      const shankObj = shankRoot.modelObject || shankRoot;
      const bandObj = bandRoot.modelObject || bandRoot;
      const headObj = headRoot ? headRoot.modelObject || headRoot : null;

      // Update matrices to ensure boxes are correct
      shankObj.updateMatrixWorld(true);
      bandObj.updateMatrixWorld(true);

      // Temporarily detach head to get pure shank bounds (excluding head width)
      const headParent = headObj?.parent;
      if (headParent) {
        headParent.remove(headObj);
        shankObj.updateMatrixWorld(true);
      }

      const shankBox = getMetalBounds(shankObj);

      // Re-attach head
      if (headParent) {
        headParent.add(headObj);
        headObj.updateMatrixWorld(true);
      }

      const bandBox = getMetalBounds(bandObj);

      const bandWidthZ = bandBox.max.z - bandBox.min.z;

      // Gap between rings - slight negative to ensure contact
      const gap = -0.05;

      // Calculate offset for "Left" side (min Z direction)
      const bandCenterZ = (bandBox.max.z + bandBox.min.z) / 2;
      const targetZ_Left = shankBox.min.z - bandWidthZ / 2 - gap;

      // Move original band to Left
      bandObj.position.z += targetZ_Left - bandCenterZ;
      bandObj.updateMatrixWorld(true);
      console.log("Placed Band 1 (Left) at Z:", bandObj.position.z);

      // If Mode 2, create "Right" side band
      if (bandMode === 2) {
        bandClone = bandObj.clone();
        // Target Z for Right: shankBox.max.z + bandWidth/2 + gap
        const targetZ_Right = shankBox.max.z + bandWidthZ / 2 + gap;
        bandClone.position.z =
          bandObj.position.z + (targetZ_Right - targetZ_Left);
        viewer.scene.add(bandClone);
        console.log("Placed Band 2 (Right) at Z:", bandClone.position.z);
      }
    } catch (e) {
      console.error("Error positioning matching bands:", e);
    }
  }

  // Collect Objects from both models

  // Traverse shank for metal objects
  const shankObj = shankRoot?.modelObject || shankRoot;
  if (shankObj && typeof shankObj.traverse === "function") {
    shankObj.traverse((o: any) => {
      if (o.type === "Mesh") {
        if (o.name.toLowerCase().startsWith("diamond")) {
          diamondObjects.push(o);
        } else {
          metalObjects.push(o);
        }
      }
    });
  }

  // Traverse head for diamond and metal objects
  const headObj = headRoot?.modelObject || headRoot;
  if (headObj && typeof headObj.traverse === "function") {
    headObj.traverse((o: any) => {
      if (o.type === "Mesh") {
        if (o.name.toLowerCase().startsWith("diamond")) {
          diamondObjects.push(o);
        } else {
          metalObjects.push(o);
        }
      }
    });
  }

  // Collect band objects
  const collectBandParts = (root: any) => {
    const obj = root?.modelObject || root;
    if (obj && typeof obj.traverse === "function") {
      obj.traverse((o: any) => {
        if (o.type === "Mesh") {
          if (o.name.toLowerCase().startsWith("diamond")) {
            diamondObjects.push(o);
          } else {
            metalObjects.push(o);
          }
        }
      });
    }
  };

  if (bandRoot) collectBandParts(bandRoot);
  if (bandClone) collectBandParts(bandClone);

  // Metal Color Configuration

  // Get color from URL params
  const metalParam = urlParams.get("metalColor")?.toLowerCase();
  const twoToneParam = urlParams.get("twoTone");

  let initialColor = metalColors.white; // Default

  if (metalParam) {
    if (metalParam.includes("yellow")) {
      initialColor = metalColors.yellow;
    } else if (metalParam.includes("rose")) {
      initialColor = metalColors.rose;
    } else if (metalParam.includes("white")) {
      initialColor = metalColors.white;
    }
    console.log(
      `Setting initial metal color from URL: ${metalParam} -> ${initialColor}`,
    );
  }

  // Check if two-tone is enabled
  const isTwoTone = twoToneParam === "true";

  // Set initial color - if two-tone, head gets white gold
  if (isTwoTone) {
    console.log(
      "Two-tone enabled: Head will be white gold, Shank will be",
      metalParam,
    );
    changeMetalColor(initialColor, metalColors.white);
  } else {
    changeMetalColor(initialColor);
  }

  // Initial Camera Position
  position.set(3, -0.8, 1.2);
  target.set(0, 0, 0);

  // Get auto-rotate preference from URL
  const autoRotateParam = urlParams.get("autoRotate");
  const shouldAutoRotate = autoRotateParam === "true";

  // Enable controls
  if (camera.controls) {
    camera.controls.enabled = true;
    camera.controls.autoRotate = shouldAutoRotate;
    camera.controls.autoRotateSpeed = 2.0; // Adjust speed as needed
    camera.controls.minDistance = 4;
    camera.controls.maxDistance = 15;
  }

  // Mobile Optimizations
  if (isMobile) {
    camera.setCameraOptions({ fov: 65 });
  }

  // Refresh pipeline to ensure all changes are applied
  viewer.renderer.refreshPipeline();

  // Wait for a frame to ensure things are rendered
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Force hide loader
      const finalLoader = document.getElementById("loading-screen");
      if (finalLoader) {
        finalLoader.classList.add("hidden");
        finalLoader.style.display = "none";
      }

      // Notify parent that the viewer is fully ready (models loaded & attached & rendered)
      window.parent.postMessage("VIEWER_READY", "*");
      console.log("Viewer fully ready and rendered");
    });
  });
}

setupViewer();
