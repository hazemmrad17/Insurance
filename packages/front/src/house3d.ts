import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';


// ====== State ======

let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;

let composer: EffectComposer | null = null;
let controls: OrbitControls | null = null;
let animationId: number | null = null;

interface InteractivePart {
  mesh: THREE.Mesh;
  originalPos: THREE.Vector3;
  originalColor: THREE.Color;
  data: HousePartData;
  isFloating: boolean;

}

interface PartMap {
  [id: string]: InteractivePart;
}

const parts: PartMap = {};
let raycaster: THREE.Raycaster;
let mouse: THREE.Vector2;
let containerEl: HTMLElement | null = null;
let selectedPartId: string | null = null;
let animationTime = 0;
let modelGroup: THREE.Group | null = null;
let groundMesh: THREE.Mesh | null = null;

let onPartSelectCallback: ((data: HousePartData) => void) | null = null;

// Fallback hit-test meshes for unmatched parts — NOT added to scene, only used for raycasting
let fallbackHitMeshes: THREE.Mesh[] = [];

// Auto-rotation: stop when user interacts, resume after idle
let autoRotateTimeout: ReturnType<typeof setTimeout> | null = null;
const AUTO_ROTATE_IDLE = 3000; // 3 seconds idle before resuming

// ====== Public types ======

export interface HousePartData {
  id: string;
  label: string;
  risk: 'high' | 'medium' | 'low';
  score: number;
  description: string;
  cost: string;
  annualSavings: string;
  works: string[];
  premiumAfter: string;
}

// ====== Part Data ======

export const housePartData: Record<string, HousePartData> = {
  roof: {
    id: 'roof',
    label: 'Toiture',
    risk: 'high',
    score: 72,
    description: "Isolation vétuste et tuiles fissurées. Risque de fuite et de déperdition calorifique en cas d'épisode climatique extrême.",
    cost: '1 000 €',
    annualSavings: '-100 €/an',
    works: ["Remplacement de l'isolation (laine de roche)", 'Réparation des tuiles endommagées', 'Installation de chéneaux renforcés'],
    premiumAfter: '−12% sur la prime habitation',
  },
  walls: {
    id: 'walls',
    label: 'Façade & Murs',
    risk: 'medium',
    score: 48,
    description: 'Fissures capillaires sur la façade exposée sud. Risque de dégradation accélérée par les cycles gel-dégel.',
    cost: '2 500 €',
    annualSavings: '-60 €/an',
    works: ['Rebouchage des fissures', "Application d'un revêtement hydrofuge", 'Isolation thermique par extérieur (ITE)'],
    premiumAfter: '−8% sur la prime habitation',
  },
  ground: {
    id: 'ground',
    label: 'Fondations & Sol',
    risk: 'high',
    score: 78,
    description: 'Zone à risque de retrait-gonflement des argiles. Les fondations sont vulnérables en cas de sécheresse prolongée.',
    cost: '8 000 €',
    annualSavings: '-200 €/an',
    works: ['Étude géotechnique préalable', 'Reprise des fondations par micro-pieux', 'Drainage périphérique renforcé'],
    premiumAfter: '−20% sur la prime habitation',
  },
  windows: {
    id: 'windows',
    label: 'Menuiseries',
    risk: 'low',
    score: 22,
    description: 'Double vitrage récent (2022). Bonne isolation thermique et acoustique. Aucun risque structurel identifié.',
    cost: '800 €',
    annualSavings: '-150 €/an',
    works: ["Remplacement des joints d'étanchéité", 'Installation de volets roulants isolants', 'Survitrage anti-tempête'],
    premiumAfter: '−5% sur la prime habitation',
  },
  chimney: {
    id: 'chimney',
    label: 'Conduits & Cheminée',
    risk: 'medium',
    score: 45,
    description: 'Conduit partiellement obstrué par des résidus de combustion. Risque de refoulement de fumées et de tirage insuffisant.',
    cost: '600 €',
    annualSavings: '-40 €/an',
    works: ['Ramonage complet du conduit', "Installation d'un extracteur statique", 'Mise aux normes du tubage'],
    premiumAfter: '−6% sur la prime habitation',
  },
};



// Fallback positions are computed dynamically from the model's bounding box after loading
let computedFallbackPositions: Record<string, THREE.Vector3> = {};

function computeFallbackPositionsFromBox(box: THREE.Box3): Record<string, THREE.Vector3> {
  const mn = box.min, mx = box.max;
  const cx = (mn.x + mx.x) / 2, cy = (mn.y + mx.y) / 2, cz = (mn.z + mx.z) / 2;
  const w = mx.x - mn.x, h = mx.y - mn.y;
  // Place spheres at sensible positions relative to the actual model geometry
  return {
    roof: new THREE.Vector3(cx, mx.y + 0.2, cz),
    walls: new THREE.Vector3(cx + w * 0.5, cy + h * 0.1, mx.z + 0.2),
    ground: new THREE.Vector3(cx, mn.y + 0.1, cz),
    windows: new THREE.Vector3(mx.x + 0.2, cy + h * 0.25, cz),
    chimney: new THREE.Vector3(cx + w * 0.35, mx.y * 0.85, mn.z - 0.2),
  };
}


// ====== Part registration ======

function registerPart(id: string, mesh: THREE.Mesh, color: number) {
  const pos = mesh.position.clone();
  const data = housePartData[id];

  parts[id] = {
    mesh,
    originalPos: pos,
    originalColor: new THREE.Color(color),
    data: data || housePartData.roof,
    isFloating: false,

  };
}

function createFallbackHitMesh(partId: string): THREE.Mesh {
  const pos = computedFallbackPositions[partId] || new THREE.Vector3(0, 0.5, 0);
  const size = 0.5; // tighter sphere for more accurate hit detection
  const geo = new THREE.SphereGeometry(size, 8, 6);
  // Use a BasicMaterial with colorWrite:false + depthWrite:true so it affects neither
  // color nor depth buffer, but the raycaster can still intersect it.
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.userData = { isPart: true, partId };
  // Store world-matrix-auto-update position for raycasting
  mesh.updateMatrixWorld(true);
  return mesh;
}

function getInteractiveMeshes(): THREE.Mesh[] {
  // Only named child meshes from the GLB are in the scene.
  // Fallback meshes are NOT in the scene — they're tested separately.
  const sceneMeshes = Object.values(parts)
    .map(p => p.mesh)
    .filter(m => m.parent !== null); // only meshes attached to scene/group
  return [...sceneMeshes, ...fallbackHitMeshes];
}



// ====== Public callback setter ======

export function onHousePartSelect(callback: (data: HousePartData) => void): void {
  onPartSelectCallback = callback;
}

/** Programmatically select a house part (used by card clicks) */
export function selectHousePart(partId: string): void {
  if (!parts[partId]) return;
  const part = parts[partId];

  // Deselect previous
  if (selectedPartId && parts[selectedPartId]) {
    parts[selectedPartId].isFloating = false;
  }

  // Toggle selection
  if (selectedPartId === partId) {
    selectedPartId = null;
    part.isFloating = false;
  } else {
    selectedPartId = partId;
    part.isFloating = true;
    if (controls) {
      controls.target.copy(part.originalPos);
    }
  }

  if (onPartSelectCallback) {
    onPartSelectCallback(part.isFloating ? part.data : housePartData.roof);
  }
}

// ====== Init ======

export function initHouse(containerId: string): void {
  containerEl = document.getElementById(containerId);
  if (!containerEl || scene) return;

  const rect = containerEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    requestAnimationFrame(() => initHouse(containerId));
    return;
  }

  const w = rect.width;
  const h = rect.height;

  // --- Scene ---
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2ebe3); // warm cream

  // --- Camera ---
  camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
  camera.position.set(4.5, 3.0, 5.0);
  camera.lookAt(0, 0.5, 0);

  // --- WebGL Renderer ---
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  containerEl.appendChild(renderer.domElement);



  // --- Post-processing ---
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    0.04,   // strength — very subtle (was 0.15, caused foggy look)
    0.3,    // radius
    0.4     // threshold — only bloom very bright areas
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // --- Warm custom environment for rich PBR reflections ---
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  // Use neutral warm-cream background so reflections don't tint the model orange
  envScene.background = new THREE.Color(0xece6dd);
  const envLight = new THREE.DirectionalLight(0xffe8d0, 1.5);
  envLight.position.set(1, 1, 0.5);
  envScene.add(envLight);
  const envFill = new THREE.DirectionalLight(0x8fc5e8, 0.3);
  envFill.position.set(-0.5, 0.3, -0.5);
  envScene.add(envFill);
  const envTexture = pmremGenerator.fromScene(envScene, 0).texture;
  scene.environment = envTexture;
  pmremGenerator.dispose();

  // --- Lights ---
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  // Key light — warm, from upper-right
  const keyLight = new THREE.DirectionalLight(0xffe8d0, 4.0);
  keyLight.position.set(6, 10, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.camera.left = -5;
  keyLight.shadow.camera.right = 5;
  keyLight.shadow.camera.top = 5;
  keyLight.shadow.camera.bottom = -5;
  keyLight.shadow.bias = -0.001;
  scene.add(keyLight);

  // Fill light — warm, from left
  const fillLight = new THREE.DirectionalLight(0xffccaa, 0.8);
  fillLight.position.set(-3, 2, 1);
  scene.add(fillLight);

  // Rim light — warm, from behind
  const rimLight = new THREE.DirectionalLight(0xffdbb8, 0.5);
  rimLight.position.set(0, 2, -5);
  scene.add(rimLight);

  // Warm accent from below (terracotta glow)
  const accentLight = new THREE.DirectionalLight(0xc56a3d, 0.5);
  accentLight.position.set(0.5, -1.5, 0.5);
  scene.add(accentLight);

  // Hemisphere for sky/ground color bleed
  const hemi = new THREE.HemisphereLight(0xffeedd, 0xc56a3d, 0.4);
  scene.add(hemi);

  // --- Ground Plane (matte warm base) ---
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xd4ccc4,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.05, // barely visible reflection
  });
  const groundGeo = new THREE.CircleGeometry(4.0, 48);
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.01;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // --- OrbitControls ---
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.target.set(0, 0.5, 0);
  controls.autoRotate = false;
  controls.update();

  // Stop auto-rotation on user interaction via CSS2D overlay
  renderer.domElement.addEventListener('pointerdown', onUserInteract);
  renderer.domElement.addEventListener('wheel', onUserInteract);

  // --- Interaction ---
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  containerEl.addEventListener('mousemove', onMouseMove);
  containerEl.addEventListener('click', onMouseClick);

  // --- Resize ---
  new ResizeObserver(() => {
    if (!containerEl || !camera || !renderer || !composer) return;
    const r = containerEl.getBoundingClientRect();
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    renderer.setSize(r.width, r.height);
    composer.setSize(r.width, r.height);
  }).observe(containerEl);

  // Load Cottage (OBJ)
  loadCottageModel();
  animate();
}

// ====== User interaction resets auto-rotation timer ======

function onUserInteract() {
  if (!controls) return;
  controls.autoRotate = false;
  if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
  autoRotateTimeout = setTimeout(() => {
    if (controls) controls.autoRotate = true;
  }, AUTO_ROTATE_IDLE);
}

// ====== Cottage (OBJ) Loading ======

function loadCottageModel(): void {
  if (!scene) return;

  const mtlLoader = new MTLLoader();
  mtlLoader.load('/Cottage_FREE.mtl', (materials) => {
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.load(
      '/Cottage_FREE.obj',
      (obj) => {
        if (!scene) return;
        modelGroup = new THREE.Group();

        // Move all children from obj into our group
        while (obj.children.length > 0) {
          const child = obj.children[0];
          obj.remove(child);
          modelGroup.add(child);
        }

        // Scale and center the whole model, then lift so it sits ON the ground
        const box = new THREE.Box3().setFromObject(modelGroup);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.5 / maxDim;
        modelGroup.scale.set(scale, scale, scale);
        // Lift the model so its bottom sits on y=0 (the ground plane)
        modelGroup.position.set(
          -center.x * scale,
          -box.min.y * scale,
          -center.z * scale
        );

        // Enable shadows + improve material quality
        modelGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (mat.map) mat.map.anisotropy = 8;
              mat.envMap = scene!.environment;
              mat.envMapIntensity = 0.3;
              mat.roughness = Math.min(mat.roughness, 0.7);
            }
          }
        });

        scene.add(modelGroup);

        // Compute fallback positions from the actual model's world-space bounding box
        const worldBox = new THREE.Box3().setFromObject(modelGroup);
        computedFallbackPositions = computeFallbackPositionsFromBox(worldBox);

        // All 5 interactive parts use hit-test spheres computed from the model's actual geometry
        fallbackHitMeshes = [];
        const allIds = ['roof', 'walls', 'ground', 'windows', 'chimney'];
        for (const pid of allIds) {
          const hitMesh = createFallbackHitMesh(pid);
          fallbackHitMeshes.push(hitMesh);
          const col = housePartData[pid]?.risk === 'high' ? 0xc56a3d
            : housePartData[pid]?.risk === 'medium' ? 0xf59e0b
            : 0x10b981;
          registerPart(pid, hitMesh, col);
        }

        console.log('🏠 Cottage model loaded with 5 interactive zones');
      },
      undefined,
      (error) => {
        console.error('❌ OBJ load failed:', error);
        createFallbackModel();
      }
    );
  }, undefined, (error) => {
    console.error('❌ MTL load failed, falling back to OBJ without materials:', error);
    // Try loading OBJ without MTL as fallback
    const objLoader = new OBJLoader();
    objLoader.load(
      '/Cottage_FREE.obj',
      (obj) => {
        if (!scene) return;
        modelGroup = new THREE.Group();
        while (obj.children.length > 0) {
          const child = obj.children[0];
          obj.remove(child);
          modelGroup.add(child);
        }

        const box = new THREE.Box3().setFromObject(modelGroup);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2.5 / maxDim;
        modelGroup.scale.set(scale, scale, scale);
        // Lift the model so its bottom sits on y ≈ 0 (the ground plane)
        modelGroup.position.set(
          -center.x * scale,
          -box.min.y * scale,
          -center.z * scale
        );

        modelGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              const mat = child.material as THREE.MeshStandardMaterial;
              mat.envMap = scene!.environment;
              mat.envMapIntensity = 0.3;
            }
          }
        });

        scene.add(modelGroup);

        // Compute fallback positions from the actual model's world-space bounding box
        const worldBox = new THREE.Box3().setFromObject(modelGroup);
        computedFallbackPositions = computeFallbackPositionsFromBox(worldBox);

        fallbackHitMeshes = [];
        const allIds = ['roof', 'walls', 'ground', 'windows', 'chimney'];
        for (const pid of allIds) {
          const hitMesh = createFallbackHitMesh(pid);
          fallbackHitMeshes.push(hitMesh);
          registerPart(pid, hitMesh, 0xcccccc);
        }

        console.log('🏠 Cottage loaded (no materials) with 5 interactive zones');
      },
      undefined,
      (error) => {
        console.error('❌ OBJ (no MTL) also failed:', error);
        createFallbackModel();
      }
    );
  });
}

function createFallbackModel(): void {
  if (!scene) return;
  const fg = new THREE.Group();
  // Use estimated box centered at origin
  const estBox = new THREE.Box3(new THREE.Vector3(-0.8, 0, -0.8), new THREE.Vector3(0.8, 1.6, 0.8));
  computedFallbackPositions = computeFallbackPositionsFromBox(estBox);
  fallbackHitMeshes = [];
  for (const pid of ['roof', 'walls', 'ground', 'windows', 'chimney']) {
    const hitMesh = createFallbackHitMesh(pid);
    fallbackHitMeshes.push(hitMesh);
    const col = housePartData[pid]?.risk === 'high' ? 0xc56a3d
      : housePartData[pid]?.risk === 'medium' ? 0xf59e0b
      : 0x10b981;
    registerPart(pid, hitMesh, col);
  }
  scene.add(fg);
  modelGroup = fg;

}

// ====== Interaction ======

function onMouseMove(e: MouseEvent) {
  if (!containerEl || !camera || !scene) return;
  const rect = containerEl.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(getInteractiveMeshes(), false);

  // Reset all highlights except selected
  Object.values(parts).forEach(p => {
    const mat = p.mesh.material as THREE.MeshStandardMaterial;
    if (!p.isFloating) {
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    }
  });
  if (selectedPartId && parts[selectedPartId]) {
    const selMat = parts[selectedPartId].mesh.material as THREE.MeshStandardMaterial;
    selMat.emissive.setHex(0xc56a3d);
    selMat.emissiveIntensity = 0.25;
  }
  containerEl!.style.cursor = 'grab';

  if (intersects.length > 0) {
    const hitId = Object.keys(parts).find(id => {
      const p = parts[id];
      return p.mesh === intersects[0].object ||
        (intersects[0].object as THREE.Mesh).userData?.partId === id;
    });
    if (hitId && parts[hitId]) {
      const mat = parts[hitId].mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0xc56a3d);
      mat.emissiveIntensity = 0.12;
      containerEl!.style.cursor = 'pointer';
    }
  }
}

function onMouseClick(e: MouseEvent) {
  if (!containerEl || !camera || !scene) return;
  const rect = containerEl.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(getInteractiveMeshes(), false);

  if (intersects.length > 0) {
    const hitId = Object.keys(parts).find(id => {
      const p = parts[id];
      return p.mesh === intersects[0].object ||
        (intersects[0].object as THREE.Mesh).userData?.partId === id;
    });

    if (hitId && parts[hitId]) {
      const part = parts[hitId];

      if (selectedPartId === hitId) {
        selectedPartId = null;
        part.isFloating = false;
      } else {
        if (selectedPartId && parts[selectedPartId]) {
          parts[selectedPartId].isFloating = false;
        }
        selectedPartId = hitId;
        part.isFloating = true;
        // Move camera to look at the selected part
        if (controls) {
          controls.target.copy(part.originalPos);
        }
      }

      if (onPartSelectCallback && part.isFloating) {
        onPartSelectCallback(part.data);
      } else if (onPartSelectCallback) {
        onPartSelectCallback(housePartData.roof);
      }
    }
  }
}

// ====== Animation ======

function animate() {
  animationId = requestAnimationFrame(animate);
  animationTime += 0.016;

  if (!camera || !renderer || !scene || !composer || !controls) return;

  // Update controls
  controls.update();

  // Animate floating parts
  Object.values(parts).forEach(p => {
    const targetY = p.isFloating ? p.originalPos.y + 0.5 : p.originalPos.y;
    p.mesh.position.y += (targetY - p.mesh.position.y) * 0.06;

    if (p.isFloating) {
      p.mesh.position.y += Math.sin(animationTime * 2.5) * 0.004;
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0xc56a3d);
      mat.emissiveIntensity = 0.2 + Math.sin(animationTime * 3) * 0.08;
    }


  });

  // Render via composer (post-processing)
  composer.render();


}

// ====== Cleanup ======

export function destroyHouse(): void {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (autoRotateTimeout) clearTimeout(autoRotateTimeout);

  if (controls) {
    controls.dispose();
    controls = null;
  }

  const domEl = renderer?.domElement;
  if (containerEl) {
    containerEl.removeEventListener('mousemove', onMouseMove);
    containerEl.removeEventListener('click', onMouseClick);
    if (domEl) containerEl.removeChild(domEl);
  }

  if (composer) {
    composer.dispose();
    composer = null;
  }

  if (scene) {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  scene = null;
  camera = null;
  renderer = null;
  modelGroup = null;
  groundMesh = null;
  fallbackHitMeshes = [];
  computedFallbackPositions = {};
  Object.keys(parts).forEach(k => delete parts[k]);
  selectedPartId = null;
  onPartSelectCallback = null;
  containerEl = null;
  animationTime = 0;
}
