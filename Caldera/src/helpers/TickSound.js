export class TickSound {
  constructor({
    duration = 0.005,
    frequency = 6000,
    minIntervalSeconds = 0.015,
    volume = 0.06,
  } = {}) {
    this.buffer = null;
    this.ctx = null;
    this.duration = duration;
    this.frequency = frequency;
    this.initPromise = null;
    this.lastTickTime = Number.NEGATIVE_INFINITY;
    this.minIntervalSeconds = minIntervalSeconds;
    this.volume = volume;
  }

  init() {
    if (this.ctx && this.buffer) {
      return this.resume();
    }

    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;

    if (!AudioContextClass) {
      return Promise.resolve(false);
    }

    try {
      this.ctx = new AudioContextClass();
      this.buffer = this.createTickBuffer();
      this.initPromise = this.resume();
      return this.initPromise;
    } catch {
      this.ctx = null;
      this.buffer = null;
      return Promise.resolve(false);
    }
  }

  async resume() {
    if (!this.ctx || this.ctx.state !== "suspended") {
      return Promise.resolve(true);
    }

    try {
      await this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  createTickBuffer() {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * this.duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 220);
      data[i] = Math.sin(2 * Math.PI * this.frequency * t) * envelope * this.volume;
    }

    return buffer;
  }

  play() {
    if (!this.ctx || !this.buffer) {
      this.init();
    }

    if (!this.ctx || !this.buffer) {
      return;
    }

    if (this.ctx.state === "suspended") {
      this.resume();
    }

    const jitter = (Math.random() - 0.5) * 0.01;

    const now = this.ctx.currentTime + jitter;

    if (now - this.lastTickTime < this.minIntervalSeconds) {
      return;
    }

    this.lastTickTime = now;

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.ctx.destination);
    source.start();
  }
}
