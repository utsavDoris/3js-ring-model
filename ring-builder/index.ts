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

  // Use minY for consistent bottom alignment, but average X/Z for centering
  return new Vector3(center.x, minY, center.z);
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
  headScale = 0.4,
) {
  const shank = shankRoot.modelObject || shankRoot;
  const head = headRoot.modelObject || headRoot;

  if (!shank || !head) return;

  // 1. Precise Cleanup: Remove ONLY previous heads we attached
  // This prevents multiple heads from "merging" without deleting shank side-stones
  if (shank.children) {
    const toRemove = shank.children.filter(
      (child: any) => child.userData.isHead,
    );
    toRemove.forEach((child: any) => {
      console.log("Removing previous head from shank:", child.name);
      shank.remove(child);
    });
  }

  // Tag NEW head for future cleanup
  head.userData.isHead = true;

  // Update shank matrix world after potential child removal
  shank.updateMatrixWorld(true);

  // 2. RESET HEAD TRANSFORM
  head.position.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  head.scale.setScalar(headScale);
  head.updateMatrixWorld(true);

  // 3. Calculate Shank Bounds (Pure Metal)
  const shankBox = getMetalBounds(shank);
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
  // Sink it slightly (1% of shank height) into the shank for a secure look
  const shankHeight = shankBox.max.y - shankBox.min.y;
  desiredWorld.y -= shankHeight * 0.01;

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

  // --- Configuration State ---
  let currentShankUrl = fixedShankUrl;
  let currentHeadUrl = fixedHeadUrl;
  let currentMatchingBand = matchingBandParam;
  let currentCaratVal = parseFloat(caratParam || "1.0");
  let currentMetalColor = urlParams.get("metalColor")?.toLowerCase() || "white";
  let currentTwoTone = urlParams.get("twoTone") === "true";
  let currentAutoRotate = urlParams.get("autoRotate") === "true";

  // --- Multi-part Atomic Counters ---
  // These prevent a "Head" update from cancelling a "Shank" update, and vice-versa.
  let shankUpdateId = 0;
  let headUpdateId = 0;
  let bandUpdateId = 0;

  // --- State tracking for models ---
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

  // --- Centralized Refresh Functions ---

  function showModelLoader() {
    const loader = document.getElementById("model-loader");
    if (loader) {
      loader.classList.remove("hidden");
      loader.style.opacity = "1";
    }
  }

  function hideModelLoader() {
    const loader = document.getElementById("model-loader");
    if (loader) {
      loader.classList.add("hidden");
      loader.style.opacity = "0";
    }
  }

  function refreshRingAssembly() {
    console.log("Refreshing ring assembly...");
    if (shankRoot && headRoot) {
      const targetScale = 0.4 * Math.pow(currentCaratVal || 1.0, 1 / 3);
      try {
        attachHeadToShankSmart(shankRoot, headRoot, targetScale);
      } catch (e) {
        console.error("Assembly error:", e);
      }
    }

    if (bandRoot && shankRoot) {
      try {
        const shankObj = shankRoot.modelObject || shankRoot;
        const bandObj = bandRoot.modelObject || bandRoot;
        const headObj = headRoot ? headRoot.modelObject || headRoot : null;

        // Ensure matrices are fresh
        shankObj.updateMatrixWorld(true);
        bandObj.updateMatrixWorld(true);

        // Temporarily detach head for pure shank bounds
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

        // Positioning logic
        const bandCenterZ = (bandBox.max.z + bandBox.min.z) / 2;
        const targetZ_Left = shankBox.min.z - bandWidthZ / 2 - gap;

        // Use relative move to avoid accumulation errors
        const offsetLeft = targetZ_Left - bandCenterZ;
        bandObj.position.z += offsetLeft;
        bandObj.updateMatrixWorld(true);

        // If Band 2 exists, position it relative to the now-positioned Band 1
        if (bandClone) {
          const targetZ_Right = shankBox.max.z + bandWidthZ / 2 + gap;
          // Position relative to Band 1 (which is at targetZ_Left)
          bandClone.position.z =
            bandObj.position.z + (targetZ_Right - targetZ_Left);
          bandClone.updateMatrixWorld(true);
        }
      } catch (e) {
        console.error("Band position error:", e);
      }
    }
  }

  function refreshRingMaterials() {
    console.log("Refreshing ring materials...");
    metalObjects = [];
    diamondObjects = [];
    const collect = (root: any) => {
      const obj = root?.modelObject || root;
      if (obj && typeof obj.traverse === "function") {
        obj.traverse((o: any) => {
          if (o.type === "Mesh") {
            if (o.name.toLowerCase().includes("diamond"))
              diamondObjects.push(o);
            else metalObjects.push(o);
          }
        });
      }
    };
    if (shankRoot) collect(shankRoot);
    if (headRoot) collect(headRoot);
    if (bandRoot) collect(bandRoot);
    if (bandClone) collect(bandClone);

    let colorHex = metalColors.white;
    if (currentMetalColor.includes("yellow")) colorHex = metalColors.yellow;
    else if (currentMetalColor.includes("rose")) colorHex = metalColors.rose;

    if (currentTwoTone) changeMetalColor(colorHex, metalColors.white);
    else changeMetalColor(colorHex);
  }

  // Helper to safely remove models and their content (handling reparented meshes)
  function removeModels(models: any[], root: any) {
    const toRemove = new Set<any>();
    if (models && models.length > 0) models.forEach((m) => toRemove.add(m));
    if (root) toRemove.add(root);

    toRemove.forEach((model: any) => {
      if (!model) return;

      // 1. Remove the wrapper object
      if (model.parent) {
        model.parent.remove(model);
      } else {
        viewer.scene.remove(model);
      }

      // 2. Remove the actual model content (important if reparented like head -> shank)
      const content = model.modelObject;
      if (content && content.parent) {
        content.parent.remove(content);
      }
    });
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

  // Register event listener
  window.addEventListener("message", async (event) => {
    if (event.data?.type === "UPDATE_CONFIGURATION") {
      const payload = event.data.payload;
      console.log("Received update:", payload);

      const {
        shank: newShankUrl,
        head: newHeadUrl,
        metalColor: newMetalColor,
        carat: newCarat,
        matchingBand: newMatchingBand,
        twoTone: newTwoTone,
        autoRotate: newAutoRotate,
      } = payload;

      let changedModels = false;
      if (newMetalColor) currentMetalColor = newMetalColor.toLowerCase();
      if (newTwoTone !== undefined) currentTwoTone = !!newTwoTone;
      if (newCarat) {
        const c = parseFloat(newCarat);
        if (!isNaN(c) && c > 0) currentCaratVal = c;
      }
      if (newAutoRotate !== undefined) {
        currentAutoRotate = !!newAutoRotate;
        if (camera.controls) camera.controls.autoRotate = currentAutoRotate;
      }

      if (newShankUrl) {
        const fixedUrl = fixFirebaseUrl(newShankUrl);
        if (fixedUrl !== currentShankUrl) {
          const thisId = ++shankUpdateId;
          currentShankUrl = fixedUrl;
          showModelLoader();
          try {
            const models = await manager.addFromPath(fixedUrl);
            if (thisId !== shankUpdateId) removeModels(models, null);
            else {
              removeModels(shankModels, shankRoot);
              shankModels = models;
              shankRoot = models[0];
              changedModels = true;
              refreshRingAssembly();
              refreshRingMaterials();
            }
          } catch (e) {
            console.error("Shank load error", e);
          } finally {
            hideModelLoader();
          }
        }
      }

      if (newHeadUrl) {
        const fixedUrl = fixFirebaseUrl(newHeadUrl);
        if (fixedUrl !== currentHeadUrl) {
          const thisId = ++headUpdateId;
          currentHeadUrl = fixedUrl;
          showModelLoader();
          try {
            const models = await manager.addFromPath(fixedUrl);
            if (thisId !== headUpdateId) removeModels(models, null);
            else {
              removeModels(headModels, headRoot);
              headModels = models;
              headRoot = models[0];
              changedModels = true;
              refreshRingAssembly();
              refreshRingMaterials();
            }
          } catch (e) {
            console.error("Head load error", e);
          } finally {
            hideModelLoader();
          }
        }
      }

      if (
        newMatchingBand !== undefined &&
        newMatchingBand !== currentMatchingBand
      ) {
        const thisId = ++bandUpdateId;
        const val = newMatchingBand.toString();
        let mode = 0;
        let path = "";
        if (val.startsWith("http")) {
          path = fixFirebaseUrl(val);
          mode = 1;
        } else {
          mode = parseInt(val);
          path = mode > 0 ? "maching-band.glb" : "";
        }
        currentMatchingBand = newMatchingBand;
        if (path) {
          showModelLoader();
          try {
            const models = await manager.addFromPath(path);
            if (thisId !== bandUpdateId) removeModels(models, null);
            else {
              removeModels(bandModels, bandRoot);
              if (bandClone) {
                viewer.scene.remove(bandClone);
                bandClone = null;
              }
              bandModels = models;
              bandRoot = models[0];
              const bObj = bandRoot.modelObject || bandRoot;
              bObj.visible = true;
              if (bObj.scale.length() < 0.001) bObj.scale.setScalar(1.0);

              if (mode === 2 && bandRoot) {
                bandClone = bObj.clone();
                viewer.scene.add(bandClone);
              }
              changedModels = true;
              refreshRingAssembly();
              refreshRingMaterials();
            }
          } catch (e) {
            console.error("Band load error", e);
          } finally {
            hideModelLoader();
          }
        } else {
          removeModels(bandModels, bandRoot);
          if (bandClone) {
            viewer.scene.remove(bandClone);
            bandClone = null;
          }
          bandRoot = null;
          changedModels = true;
          refreshRingMaterials();
        }
      }

      if (!changedModels) {
        refreshRingAssembly();
        refreshRingMaterials();
      }
      viewer.renderer.refreshPipeline();
    }
  });

  // Determine initial band mode
  let bandMode = 0;
  let bandPath = "";
  if (matchingBandParam) {
    if (matchingBandParam.startsWith("http")) {
      bandPath = fixFirebaseUrl(matchingBandParam);
      bandMode = 1;
    } else {
      bandMode = parseInt(matchingBandParam);
      if (bandMode > 0) bandPath = "maching-band.glb";
    }
  }

  const loadPromises = [];
  if (fixedShankUrl)
    loadPromises.push(
      manager
        .addFromPath(fixedShankUrl)
        .then((m) => {
          if (fixedShankUrl === currentShankUrl) {
            shankModels = m;
            shankRoot = m[0];
          }
        })
        .catch((e) => console.error(e)),
    );
  if (fixedHeadUrl)
    loadPromises.push(
      manager
        .addFromPath(fixedHeadUrl)
        .then((m) => {
          if (fixedHeadUrl === currentHeadUrl) {
            headModels = m;
            headRoot = m[0];
          }
        })
        .catch((e) => console.error(e)),
    );
  if (bandPath)
    loadPromises.push(
      manager
        .addFromPath(bandPath)
        .then((m) => {
          const activeBandPath = currentMatchingBand?.startsWith("http")
            ? fixFirebaseUrl(currentMatchingBand)
            : parseInt(currentMatchingBand || "0") > 0
              ? "maching-band.glb"
              : "";
          if (
            bandPath === activeBandPath ||
            (bandPath === "maching-band.glb" &&
              activeBandPath === "maching-band.glb")
          ) {
            bandModels = m;
            bandRoot = m[0];
            const bObj = bandRoot.modelObject || bandRoot;
            bObj.visible = true;
            if (bObj.scale.length() < 0.001) bObj.scale.setScalar(1.0);

            if (
              (bandMode === 2 || parseInt(currentMatchingBand || "0") === 2) &&
              bandRoot
            ) {
              bandClone = bObj.clone();
              viewer.scene.add(bandClone);
            }
          }
        })
        .catch((e) => console.error(e)),
    );

  await Promise.all(loadPromises);

  // Final Assembly and Mounting
  refreshRingAssembly();
  refreshRingMaterials();
  window.parent.postMessage("VIEWER_READY", "*");

  // Camera and Controls
  position.set(3, -0.8, 1.2);
  target.set(0, 0, 0);
  if (camera.controls) {
    camera.controls.enabled = true;
    camera.controls.autoRotate = currentAutoRotate;
    camera.controls.autoRotateSpeed = 2.0;
    camera.controls.minDistance = 4;
    camera.controls.maxDistance = 15;
  }
  if (isMobile) camera.setCameraOptions({ fov: 65 });
  viewer.renderer.refreshPipeline();

  requestAnimationFrame(() => {
    const loader = document.getElementById("loading-screen");
    if (loader) {
      loader.classList.add("hidden");
      loader.style.display = "none";
    }
  });
}

setupViewer();
