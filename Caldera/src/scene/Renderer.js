import * as THREE from "three";

export const SCENE_BACKGROUND = "#2e9450";

const CANVAS_LABEL = "A two dimensional circuit with powered digipots, a photodiode, differential amplifiers, a slider, and a gain stage.";
const MINIMUM_VIEW_HEIGHT = 10.2;

export class Renderer {
  constructor(mount, { clearColor = SCENE_BACKGROUND, onResize = null } = {}) {
    this.mount = mount;
    this.onResize = onResize;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.webGLRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.circuitPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.worldPointer = new THREE.Vector3();

    this.setupCamera();
    this.webGLRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webGLRenderer.setClearColor(clearColor, 1);
    this.webGLRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this.domElement.className = "circuit-canvas";
    this.domElement.setAttribute("role", "img");
    this.domElement.setAttribute("aria-label", CANVAS_LABEL);
  }

  get domElement() {
    return this.webGLRenderer.domElement;
  }

  start() {
    this.mount.append(this.domElement);
    this.resizeObserver.observe(this.mount);
    this.resize();
  }

  stop() {
    this.resizeObserver.disconnect();
    this.domElement.remove();
  }

  addShape(shape) {
    shape.addTo(this.scene);
  }

  addCanvasEventListener(type, listener) {
    this.domElement.addEventListener(type, listener);
  }

  removeCanvasEventListener(type, listener) {
    this.domElement.removeEventListener(type, listener);
  }

  setCursor(cursor) {
    this.domElement.style.cursor = cursor;
  }

  getCanvasBounds() {
    return this.domElement.getBoundingClientRect();
  }

  getWorldPoint(event) {
    const bounds = this.getCanvasBounds();

    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.ray.intersectPlane(this.circuitPlane, this.worldPointer);

    return this.worldPointer.clone();
  }

  getClientPoint(worldPoint) {
    const bounds = this.getCanvasBounds();

    this.camera.updateMatrixWorld();

    const projectedPoint = worldPoint.clone().project(this.camera);

    return {
      x: bounds.left + ((projectedPoint.x + 1) / 2) * bounds.width,
      y: bounds.top + ((1 - projectedPoint.y) / 2) * bounds.height,
    };
  }

  updateMatrixWorld() {
    this.scene.updateMatrixWorld(true);
  }

  resize() {
    const width = Math.max(this.mount.clientWidth, 1);
    const height = Math.max(this.mount.clientHeight, 1);
    const aspect = width / height;

    let viewWidth = 12.5;
    let viewHeight = viewWidth / aspect;
    let xOffset = -0.3;

    if (viewHeight < MINIMUM_VIEW_HEIGHT) {
      viewHeight = MINIMUM_VIEW_HEIGHT;
      viewWidth = viewHeight * aspect;
    }

    this.camera.left = -viewWidth / 2 + xOffset;
    this.camera.right = viewWidth / 2 + xOffset;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();

    this.webGLRenderer.setSize(width, height, false);
    this.onResize?.();
  }

  render() {
    this.webGLRenderer.render(this.scene, this.camera);
  }

  setupCamera() {
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
  }
}
