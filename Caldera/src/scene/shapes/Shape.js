import * as THREE from "three";

export class ConnectionPort {
  constructor(owner, name, position, {
    direction = [1, 0, 0],
    kind = "passive",
    signal = null,
    voltage = signal?.voltage ?? null,
  } = {}) {
    this.owner = owner;
    this.name = name;
    this.kind = kind;
    this.signal = signal;
    this.voltage = voltage;
    this.position = toVector3(position);
    this.direction = toVector3(direction).normalize();
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return this.owner.localToWorld(target.copy(this.position));
  }

  getWorldDirection(target = new THREE.Vector3()) {
    return target.copy(this.direction).transformDirection(this.owner.matrixWorld).normalize();
  }
}

export class Shape extends THREE.Group {
  constructor({ name = "Shape", position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
    super();

    if (new.target === Shape) {
      throw new TypeError("Shape is a superclass. Extend it with a concrete shape.");
    }

    this.name = name;
    this.ports = new Map();
    this.position.fromArray(position);
    this.rotation.set(...rotation);

    if (Array.isArray(scale)) {
      this.scale.fromArray(scale);
    } else {
      this.scale.setScalar(scale);
    }
  }

  get object3d() {
    return this;
  }

  addTo(scene) {
    scene.add(this);
    return this;
  }

  addPort(name, position, options) {
    const port = new ConnectionPort(this, name, position, options);
    this.ports.set(name, port);
    return port;
  }

  port(name) {
    const port = this.ports.get(name);

    if (!port) {
      throw new Error(`${this.name} does not have a "${name}" port.`);
    }

    return port;
  }

  update(_delta, _elapsed) {}
}

function toVector3(position) {
  if (position instanceof THREE.Vector3) {
    return position.clone();
  }

  const [x, y, z = 0] = position;
  return new THREE.Vector3(x, y, z);
}
