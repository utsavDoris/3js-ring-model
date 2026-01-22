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

  // Take only bottom 15%
  const threshold = minY + Math.abs(minY) * 0.15;

  const bottomPoints = points.filter((p) => p.y <= threshold);

  // Average center
  const center = new Vector3();
  bottomPoints.forEach((p) => center.add(p));
  center.divideScalar(bottomPoints.length || 1);

  return center;
}

function attachHeadToShankSmart(
  shankRoot: any,
  headRoot: any,
  headScale = 0.4,
) {
  const shank = shankRoot.modelObject || shankRoot;
  const head = headRoot.modelObject || headRoot;

  if (!shank || !head) return;

  head.scale.setScalar(headScale);
  head.updateMatrixWorld(true);

  const shankBox = new Box3().setFromObject(shank);

  const shankSeat = new Vector3(
    (shankBox.min.x + shankBox.max.x) / 2,
    shankBox.max.y,
    (shankBox.min.z + shankBox.max.z) / 2,
  );

  const headSeat = getBottomSeatCenter(head);

  const desiredWorld = shankSeat.clone().sub(headSeat);

  // adaptive penetration
  desiredWorld.y -= (shankBox.max.y - shankBox.min.y) * 0.05;

  shank.updateMatrixWorld(true);
  const local = shank.worldToLocal(desiredWorld.clone());

  shank.add(head);
  head.position.copy(local);
  head.updateMatrixWorld(true);

  console.log("✅ Head attached (heart-safe centering)");
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

  // Load models from URL params (no fallback)
  let shankModels: any = [];
  let headModels: any = [];
  let bandModels: any = [];

  try {
    if (fixedShankUrl) {
      shankModels = await manager.addFromPath(fixedShankUrl);
    }
  } catch (error) {
    console.error("Error loading shank model:", error);
  }

  try {
    if (fixedHeadUrl) {
      headModels = await manager.addFromPath(fixedHeadUrl);
    }
  } catch (error) {
    console.error("Error loading head model:", error);
  }

  try {
    if (bandPath && bandMode > 0) {
      bandModels = await manager.addFromPath(bandPath);
    }
  } catch (error) {
    console.error("Error loading matching band model:", error);
  }

  // Get the root objects - WebGI returns ISceneObject[]
  // Cast to any to access internal properties
  const shankRoot: any =
    shankModels && shankModels.length > 0 ? shankModels[0] : null;
  const headRoot: any =
    headModels && headModels.length > 0 ? headModels[0] : null;
  const bandRoot: any =
    bandModels && bandModels.length > 0 ? bandModels[0] : null;

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
  let targetHeadScale = 0.4; // Default scale for ~1.0ct
  if (caratParam) {
    const carat = parseFloat(caratParam);
    if (!isNaN(carat) && carat > 0) {
      // Scale is proportional to the cube root of the carat weight
      // Formula: newScale = baseScale * (newCarat / baseCarat)^(1/3)
      // Assuming 0.4 scale corresponds to 1.0 carat
      targetHeadScale = 0.4 * Math.pow(carat, 1 / 6);
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
  let bandClone: any = null;
  if (bandRoot && shankRoot && bandMode > 0) {
    try {
      const shankObj = shankRoot.modelObject || shankRoot;
      const bandObj = bandRoot.modelObject || bandRoot;
      const headObj = headRoot ? headRoot.modelObject || headRoot : null;

      // Update matrices to ensure boxes are correct
      shankObj.updateMatrixWorld(true);
      bandObj.updateMatrixWorld(true);

      const getMetalBounds = (object: any) => {
        const box = new Box3();
        box.makeEmpty();
        let hasMetal = false;
        object.traverse((o: any) => {
          if (
            o.isMesh &&
            o.material &&
            !o.name.toLowerCase().includes("diamond")
          ) {
            const meshBox = new Box3().setFromObject(o);
            box.union(meshBox);
            hasMetal = true;
          }
        });
        return hasMetal ? box : new Box3().setFromObject(object);
      };

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
  let diamondObjects: any[] = [];
  let metalObjects: any[] = [];

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

  function changeMetalColor(colorHex: string) {
    const color = new Color(colorHex).convertSRGBToLinear();
    for (const obj of metalObjects) {
      if (obj.material) {
        obj.material.color = color;
      }
    }
    viewer.renderer.refreshPipeline();
  }

  // Metal Color Configuration
  const metalColors: Record<string, string> = {
    white: "#c2c2c3",
    yellow: "#e3bb5e",
    rose: "#d9a483",
  };

  // Get color from URL params
  const metalParam = urlParams.get("metalColor")?.toLowerCase();

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

  // Set initial color
  changeMetalColor(initialColor);

  // Initial Camera Position
  position.set(3, -0.8, 1.2);
  target.set(0, 0, 0);

  // Enable controls
  if (camera.controls) {
    camera.controls.enabled = true;
    camera.controls.autoRotate = false;
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
