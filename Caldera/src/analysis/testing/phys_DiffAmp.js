export class DifferentialAmpPhysicsTester {
  constructor({ physicsModel = null } = {}) {
    this.physicsModel = physicsModel;
    this.samples = [];
  }

  setPhysicsModel(physicsModel) {
    this.physicsModel = physicsModel ?? null;
    this.clearSamples();
    return Boolean(this.physicsModel);
  }

  getPhysicsModel() {
    return this.physicsModel;
  }

  clearSamples() {
    this.samples = [];
  }
}
