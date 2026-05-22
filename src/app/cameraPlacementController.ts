import * as THREE from "three";

type CameraProofParams = {
  name: string;
  xMm: number;
  zMm: number;
  heightMm: number;
  fovDeg: number;
  rotationDeg: number;
  pitchDeg: number;
};

type CameraProofInstance = {
  id: string;
  params: CameraProofParams;
  root: THREE.Group;
  direction: THREE.Line;
  marker: THREE.Mesh;
  cone: THREE.LineSegments;
};

type CameraPlacementControllerContext = {
  renderer: THREE.WebGLRenderer;
  layoutRoot: THREE.Group;
  getCamera: () => THREE.Camera;
  propertiesEl: HTMLElement;
  ensureFloorplanView?: () => void;
  onCamerasChanged?: () => void;
  setStatus: (text: string) => void;
  commitHistory: () => void;
};

const MM_TO_M = 0.001;
const DEFAULT_HEIGHT_MM = 1500;
const DEFAULT_FOV_DEG = 55;
const DEFAULT_PITCH_DEG = -5;
const CAMERA_LOOK_YAW_PER_PX = 0.1;
const CAMERA_LOOK_PITCH_PER_PX = 0.08;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value.trim().replace(",", ".").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function angleDeg(from: THREE.Vector3, to: THREE.Vector3) {
  return THREE.MathUtils.radToDeg(Math.atan2(to.x - from.x, to.z - from.z));
}

function directionFromAngles(yawDeg: number, pitchDeg: number) {
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(pitchDeg, -80, 80));
  const cp = Math.cos(pitch);
  return new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
}

function anglesFromDirection(direction: THREE.Vector3) {
  const dir = direction.clone().normalize();
  const flat = Math.max(1e-6, Math.sqrt(dir.x * dir.x + dir.z * dir.z));
  return {
    rotationDeg: THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z)),
    pitchDeg: THREE.MathUtils.radToDeg(Math.atan2(dir.y, flat))
  };
}

function groundPointFromPointer(event: PointerEvent, renderer: THREE.WebGLRenderer, camera: THREE.Camera): THREE.Vector3 | null {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, point) ? point : null;
}

function createCameraVisual(id: string, params: CameraProofParams): CameraProofInstance {
  const root = new THREE.Group();
  root.name = `visualCamera_${id}`;
  root.userData.kind = "visualCamera";
  root.userData.cameraId = id;

  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.18, 4),
    new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.55, metalness: 0.05 })
  );
  marker.name = `visualCameraMarker_${id}`;
  marker.rotation.x = Math.PI / 2;
  marker.userData.kind = "visualCamera";
  marker.userData.cameraId = id;
  root.add(marker);

  const direction = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#0f766e", linewidth: 2 })
  );
  direction.name = `visualCameraDirection_${id}`;
  root.add(direction);

  const cone = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#14b8a6", transparent: true, opacity: 0.88 })
  );
  cone.name = `visualCameraFov_${id}`;
  root.add(cone);

  const instance = { id, params, root, marker, direction, cone };
  updateCameraVisual(instance);
  return instance;
}

function updateCameraVisual(instance: CameraProofInstance) {
  const p = instance.params;
  const pos = new THREE.Vector3(p.xMm * MM_TO_M, Math.max(0.02, p.heightMm * MM_TO_M), p.zMm * MM_TO_M);
  const floor = new THREE.Vector3(p.xMm * MM_TO_M, 0.025, p.zMm * MM_TO_M);
  const yaw = THREE.MathUtils.degToRad(p.rotationDeg);
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  const len = 0.75;
  const end = floor.clone().addScaledVector(dir, len);

  instance.root.position.set(0, 0, 0);
  instance.marker.position.copy(pos);
  instance.marker.rotation.z = -yaw + Math.PI / 4;

  instance.direction.geometry.dispose();
  instance.direction.geometry = new THREE.BufferGeometry().setFromPoints([floor, end]);

  const half = THREE.MathUtils.degToRad(clamp(p.fovDeg, 20, 120) / 2);
  const left = new THREE.Vector3(
    Math.sin(yaw - half),
    0,
    Math.cos(yaw - half)
  ).normalize();
  const right = new THREE.Vector3(
    Math.sin(yaw + half),
    0,
    Math.cos(yaw + half)
  ).normalize();
  const coneLen = 1.05;
  const leftEnd = floor.clone().addScaledVector(left, coneLen);
  const rightEnd = floor.clone().addScaledVector(right, coneLen);
  instance.cone.geometry.dispose();
  instance.cone.geometry = new THREE.BufferGeometry().setFromPoints([
    floor,
    leftEnd,
    floor,
    rightEnd,
    leftEnd,
    rightEnd
  ]);

  instance.root.userData.cameraParams = { ...p };
}

function disposeCameraVisual(instance: CameraProofInstance) {
  instance.root.removeFromParent();
  instance.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
}

export function createCameraPlacementController(ctx: CameraPlacementControllerContext) {
  const cameras: CameraProofInstance[] = [];
  let overlay: HTMLDivElement | null = null;
  let active = false;
  let firstPoint: THREE.Vector3 | null = null;
  let draft: CameraProofInstance | null = null;
  let activeViewId: string | null = null;
  let viewCamera: THREE.PerspectiveCamera | null = null;
  let viewControls: { target: THREE.Vector3; update: () => void } | null = null;
  let viewDrag: { pointerId: number; x: number; y: number } | null = null;
  let selectedId: string | null = null;
  let counter = 1;

  const selected = () => cameras.find((camera) => camera.id === selectedId) ?? cameras[cameras.length - 1] ?? null;

  const syncOpenInputs = (camera: CameraProofInstance) => {
    const fields: Array<[string, string]> = [
      ["rotationDeg", String(Math.round(camera.params.rotationDeg))],
      ["pitchDeg", String(Math.round(camera.params.pitchDeg))],
      ["fovDeg", String(Math.round(camera.params.fovDeg))],
      ["heightMm", String(Math.round(camera.params.heightMm))]
    ];
    for (const [field, value] of fields) {
      const input = ctx.propertiesEl.querySelector<HTMLInputElement>(`[data-camera-field="${field}"]`);
      if (input && document.activeElement !== input) input.value = value;
    }
  };

  const ensureOverlay = () => {
    if (overlay) return overlay;
    const parent = ctx.renderer.domElement.parentElement;
    overlay = document.createElement("div");
    overlay.className = "camera-view-overlay";
    overlay.innerHTML = `
      <div class="camera-view-frame"></div>
      <div class="camera-view-grid">
        <div class="camera-view-grid-v camera-view-grid-v1"></div>
        <div class="camera-view-grid-v camera-view-grid-v2"></div>
        <div class="camera-view-grid-h camera-view-grid-h1"></div>
        <div class="camera-view-grid-h camera-view-grid-h2"></div>
      </div>
      <div class="camera-view-horizon"><span>H</span></div>
      <div class="camera-view-label">CAMERA VIEW</div>
    `;
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "42px 12px 36px 12px",
      pointerEvents: "none",
      display: "none",
      zIndex: "8"
    });
    if (parent) {
      if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
      parent.appendChild(overlay);
    }
    return overlay;
  };

  const setOverlayVisible = (visible: boolean) => {
    ensureOverlay().style.display = visible ? "block" : "none";
  };

  const setCameraHelpersVisible = (visible: boolean) => {
    for (const camera of cameras) camera.root.visible = visible;
    if (draft) draft.root.visible = visible;
  };

  const syncOverlayForCamera = (instance: CameraProofInstance) => {
    const el = ensureOverlay();
    const horizonY = clamp(50 + instance.params.pitchDeg * 0.55, 18, 82);
    el.style.setProperty("--camera-horizon-y", `${horizonY}%`);
  };

  const applyInstanceToView = (instance: CameraProofInstance) => {
    if (!viewCamera || !viewControls) return;
    const position = new THREE.Vector3(
      instance.params.xMm * MM_TO_M,
      Math.max(0.1, instance.params.heightMm * MM_TO_M),
      instance.params.zMm * MM_TO_M
    );
    viewCamera.position.copy(position);
    viewCamera.fov = clamp(instance.params.fovDeg, 20, 120);
    viewControls.target.copy(position).addScaledVector(directionFromAngles(instance.params.rotationDeg, instance.params.pitchDeg), 2.4);
    viewCamera.lookAt(viewControls.target);
    viewCamera.updateProjectionMatrix();
    viewControls.update();
  };

  const renderProps = () => {
    const camera = selected();
    ctx.propertiesEl.innerHTML = "";
    const title = document.createElement("div");
    title.className = "props-title";
    title.textContent = "Camera";
    ctx.propertiesEl.appendChild(title);

    const section = document.createElement("div");
    section.className = "props-section";
    if (!camera) {
      section.innerHTML = active
        ? `<div class="muted">Click first point in floor plan, then click direction.</div>`
        : `<div class="muted">Use Visualisation > Camera to place a render camera.</div>`;
      ctx.propertiesEl.appendChild(section);
      return;
    }

    section.innerHTML = `
      <label>Name<input data-camera-field="name" type="text" value="${camera.params.name}" /></label>
      <label>Height mm<input data-camera-field="heightMm" type="number" min="100" max="3000" step="10" value="${camera.params.heightMm}" /></label>
      <label>Field of view<input data-camera-field="fovDeg" type="number" min="20" max="120" step="1" value="${camera.params.fovDeg}" /></label>
      <label>Rotation deg<input data-camera-field="rotationDeg" type="number" min="-360" max="360" step="1" value="${Math.round(camera.params.rotationDeg)}" /></label>
      <label>Pitch deg<input data-camera-field="pitchDeg" type="number" min="-80" max="80" step="1" value="${Math.round(camera.params.pitchDeg)}" /></label>
      <div class="muted">Position: ${Math.round(camera.params.xMm)} / ${Math.round(camera.params.zMm)} mm</div>
      <button type="button" data-camera-action="place">Place new camera</button>
    `;
    ctx.propertiesEl.appendChild(section);

    section.querySelectorAll<HTMLInputElement>("[data-camera-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.cameraField;
        if (field === "name") camera.params.name = input.value.trim() || "Camera";
        if (field === "heightMm") camera.params.heightMm = clamp(Math.round(parseNumber(input.value, DEFAULT_HEIGHT_MM)), 100, 3000);
        if (field === "fovDeg") camera.params.fovDeg = clamp(Math.round(parseNumber(input.value, DEFAULT_FOV_DEG)), 20, 120);
        if (field === "rotationDeg") camera.params.rotationDeg = parseNumber(input.value, camera.params.rotationDeg);
        if (field === "pitchDeg") camera.params.pitchDeg = clamp(parseNumber(input.value, camera.params.pitchDeg), -80, 80);
        updateCameraVisual(camera);
      });
      input.addEventListener("change", () => ctx.commitHistory());
    });
    section.querySelector<HTMLButtonElement>("[data-camera-action='place']")?.addEventListener("click", () => activate());
  };

  const finishPlacement = (point: THREE.Vector3, directionPoint: THREE.Vector3) => {
    if (draft) {
      disposeCameraVisual(draft);
      draft = null;
    }
    const id = `vcam${counter++}`;
    const params: CameraProofParams = {
      name: `Camera ${counter - 1}`,
      xMm: Math.round(point.x / MM_TO_M),
      zMm: Math.round(point.z / MM_TO_M),
      heightMm: DEFAULT_HEIGHT_MM,
      fovDeg: DEFAULT_FOV_DEG,
      rotationDeg: angleDeg(point, directionPoint),
      pitchDeg: DEFAULT_PITCH_DEG
    };
    const instance = createCameraVisual(id, params);
    cameras.push(instance);
    ctx.layoutRoot.add(instance.root);
    selectedId = id;
    firstPoint = null;
    active = false;
    ctx.renderer.domElement.style.cursor = "";
    ctx.setStatus("Camera placed. Adjust height and field of view on the left.");
    renderProps();
    ctx.onCamerasChanged?.();
    ctx.commitHistory();
  };

  const updateDraftDirection = (directionPoint: THREE.Vector3) => {
    if (!firstPoint || !draft) return;
    draft.params.rotationDeg = angleDeg(firstPoint, directionPoint);
    updateCameraVisual(draft);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!active && activeViewId && event.button === 0) {
      viewDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      try {
        ctx.renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      ctx.renderer.domElement.style.cursor = "grabbing";
      return;
    }
    if (!active) return;
    if (event.button !== 0) return;
    const point = groundPointFromPointer(event, ctx.renderer, ctx.getCamera());
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!firstPoint) {
      firstPoint = point;
      draft = createCameraVisual("draft", {
        name: "Camera preview",
        xMm: Math.round(point.x / MM_TO_M),
        zMm: Math.round(point.z / MM_TO_M),
        heightMm: DEFAULT_HEIGHT_MM,
        fovDeg: DEFAULT_FOV_DEG,
        rotationDeg: 0,
        pitchDeg: DEFAULT_PITCH_DEG
      });
      draft.root.name = "visualCamera_draft";
      ctx.layoutRoot.add(draft.root);
      ctx.setStatus("Camera position set. Move the mouse to aim, then click a second point.");
      renderProps();
      return;
    }
    finishPlacement(firstPoint, point);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active && viewDrag && viewDrag.pointerId === event.pointerId && activeViewId) {
      const instance = cameras.find((camera) => camera.id === activeViewId) ?? null;
      if (!instance) return;
      const dx = event.clientX - viewDrag.x;
      const dy = event.clientY - viewDrag.y;
      viewDrag.x = event.clientX;
      viewDrag.y = event.clientY;
      instance.params.rotationDeg += dx * CAMERA_LOOK_YAW_PER_PX;
      instance.params.pitchDeg = clamp(instance.params.pitchDeg - dy * CAMERA_LOOK_PITCH_PER_PX, -80, 80);
      updateCameraVisual(instance);
      applyInstanceToView(instance);
      syncOverlayForCamera(instance);
      syncOpenInputs(instance);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (!active || !firstPoint || !draft) return;
    const point = groundPointFromPointer(event, ctx.renderer, ctx.getCamera());
    if (!point) return;
    updateDraftDirection(point);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!viewDrag || viewDrag.pointerId !== event.pointerId) return;
    viewDrag = null;
    try {
      ctx.renderer.domElement.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    if (activeViewId) ctx.renderer.domElement.style.cursor = "grab";
    ctx.commitHistory();
  };

  ctx.renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  ctx.renderer.domElement.addEventListener("pointermove", onPointerMove, true);
  ctx.renderer.domElement.addEventListener("pointerup", onPointerUp, true);

  const activate = () => {
    ctx.ensureFloorplanView?.();
    if (draft) {
      disposeCameraVisual(draft);
      draft = null;
    }
    active = true;
    firstPoint = null;
    ctx.renderer.domElement.style.cursor = "crosshair";
    ctx.setStatus("Camera tool: click camera position, then click direction.");
    renderProps();
  };

  const dispose = () => {
    ctx.renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
    ctx.renderer.domElement.removeEventListener("pointermove", onPointerMove, true);
    ctx.renderer.domElement.removeEventListener("pointerup", onPointerUp, true);
    if (draft) disposeCameraVisual(draft);
    overlay?.remove();
  };

  return {
    activate,
    renderProps,
    dispose,
    syncActiveCameraView(activeViewerTab: string, currentViewCamera: THREE.Camera, controls: { target: THREE.Vector3; update: () => void }) {
      if (!activeViewerTab.startsWith("camera:") || !(currentViewCamera instanceof THREE.PerspectiveCamera)) {
        activeViewId = null;
        viewDrag = null;
        setOverlayVisible(false);
        setCameraHelpersVisible(true);
        if (!active) ctx.renderer.domElement.style.cursor = "";
        return;
      }
      const id = activeViewerTab.slice("camera:".length);
      const instance = cameras.find((camera) => camera.id === id) ?? null;
      if (!instance) {
        activeViewId = null;
        viewDrag = null;
        setOverlayVisible(false);
        setCameraHelpersVisible(true);
        if (!active) ctx.renderer.domElement.style.cursor = "";
        return;
      }
      activeViewId = id;
      viewCamera = currentViewCamera;
      viewControls = controls;
      selectedId = id;
      if (!ctx.propertiesEl.querySelector("[data-camera-field='rotationDeg']")) renderProps();
      setOverlayVisible(true);
      setCameraHelpersVisible(false);
      ctx.renderer.domElement.style.cursor = viewDrag ? "grabbing" : "grab";
      syncOverlayForCamera(instance);
      if (viewDrag) {
        applyInstanceToView(instance);
        syncOpenInputs(instance);
        return;
      }
      const fixedPosition = new THREE.Vector3(
        instance.params.xMm * MM_TO_M,
        Math.max(0.1, instance.params.heightMm * MM_TO_M),
        instance.params.zMm * MM_TO_M
      );
      const currentDirection = controls.target.clone().sub(viewCamera.position);
      if (currentDirection.lengthSq() < 1e-8) currentDirection.copy(directionFromAngles(instance.params.rotationDeg, instance.params.pitchDeg));
      currentDirection.normalize();
      const angles = anglesFromDirection(currentDirection);
      instance.params.rotationDeg = angles.rotationDeg;
      instance.params.pitchDeg = clamp(angles.pitchDeg, -80, 80);
      instance.params.fovDeg = clamp(viewCamera.fov, 20, 120);
      viewCamera.position.copy(fixedPosition);
      controls.target.copy(fixedPosition).addScaledVector(directionFromAngles(instance.params.rotationDeg, instance.params.pitchDeg), 2.4);
      viewCamera.lookAt(controls.target);
      viewCamera.updateProjectionMatrix();
      controls.update();
      updateCameraVisual(instance);
      syncOpenInputs(instance);
    },
    selectCamera(id: string) {
      if (!cameras.some((camera) => camera.id === id)) return false;
      selectedId = id;
      renderProps();
      return true;
    },
    getCameras: () => cameras.map((camera) => ({ id: camera.id, params: { ...camera.params } }))
  };
}
