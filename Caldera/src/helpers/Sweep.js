import Tests from "./Tests.js";
import { COMMAND_FLAGS } from "./CommandFlags.js";
import { getModelWipers, normaliseWipers } from "./Wipers.js";

export const MID_SWEEP_START = 16;
export const MID_SWEEP_END = 240;
export const MID_SWEEP_STEP = 8;
const STACKED_SWEEP_STEP = 16;
const MID_SWEEP_POINT_COUNT = Math.floor((MID_SWEEP_END - MID_SWEEP_START) / MID_SWEEP_STEP) + 1;
const STACKED_SWEEP_POINT_COUNT = Math.floor((MID_SWEEP_END - MID_SWEEP_START) / STACKED_SWEEP_STEP) + 1;
const SWEEP_SETTLE_MS = 100;
const SWEEP_SAMPLE_INTERVAL_MS = 50;
const SWEEP_DISCARD_SAMPLE_COUNT = 2;
const SWEEP_AVERAGE_SAMPLE_COUNT = 8;
const SWEEP_FILTER_SAMPLE_COUNT = SWEEP_DISCARD_SAMPLE_COUNT + SWEEP_AVERAGE_SAMPLE_COUNT;
const RANGE_TEST_SAMPLE_COUNT = 3;
const GAIN_SWEEP_WIPERS = Object.freeze([0, 1, 2, 4, 8, 16, 32]);

export class Sweep {
  constructor({
    button,
    circuitScene,
    commandFlags = null,
    getHardwareWiperRevision = null,
    getHardwareWipers = null,
    model,
    onClear = null,
    onStart = null,
    onStatus = null,
    onSample = null,
    requireWiperAck = false,
    status,
    sweepPointCount = MID_SWEEP_POINT_COUNT,
    updateWiperDebug,
    webView,
  }) {
    this.button = button;
    this.circuitScene = circuitScene;
    this.commandFlags = commandFlags;
    this.discardedFirstSample = false;
    this.getHardwareWiperRevision = getHardwareWiperRevision;
    this.getHardwareWipers = getHardwareWipers;
    this.model = model;
    this.onClear = onClear;
    this.onStart = onStart;
    this.onStatus = onStatus;
    this.onSample = onSample;
    this.requireWiperAck = requireWiperAck;
    this.status = status;
    this.sweepPointCount = sweepPointCount;
    this.updateWiperDebug = updateWiperDebug;
    this.webView = webView;
    this.currentMid = MID_SWEEP_START;
    this.currentMidIndex = 0;
    this.filteredVoltages = null;
    this.mode = "idle";
    this.rangeTest = null;
    this.sampleVoltageBounds = null;
    this.sampleCount = 0;
    this.sweepPoints = [];
    this.targetWipers = null;
    this.timer = null;
    this.wiperAcknowledged = false;

    this.button?.addEventListener("click", () => {
      if (this.timer) {
        this.stop("stopped");
      } else {
        this.start();
      }
    });

    this.updateButton();
  }

  start() {
    this.onStart?.(this);
    this.commandFlags?.setFlag(COMMAND_FLAGS.HOLD_WIPERS, true, { post: false });

    this.onClear?.();
    this.beginRangeTest();
  }

  runStep() {
    if (!this.timer) {
      return;
    }

    const captureResult = this.captureFilterSample();

    if (captureResult === "settling") {
      this.scheduleStep(this.getSettleDelay());
      return;
    }

    if (!captureResult || this.sampleCount < this.getRequiredSampleCount()) {
      this.scheduleStep(SWEEP_SAMPLE_INTERVAL_MS);
      return;
    }

    if (this.mode === "range-test") {
      this.recordRangeTestSample();
      return;
    }

    this.advanceSweep();
  }

  stop(status = "idle") {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    this.mode = "idle";
    this.rangeTest = null;

    this.updateStatus(status);
    this.updateButton();
  }

  beginRangeTest() {
    this.rangeTest = new Tests({
      pointCount: this.sweepPointCount,
      wiperId: "mid",
    });
    this.sweepPoints = [];
    this.currentMidIndex = 0;

    this.beginRangeTestProbe(this.rangeTest.begin());
  }

  beginRangeTestProbe(probe) {
    if (!probe || probe.value === null || probe.value === undefined) {
      this.stop("fail");
      return;
    }

    this.mode = "range-test";
    this.currentMid = probe.value;
    this.beginCurrentPoint();
  }

  recordRangeTestSample() {
    const result = this.rangeTest.record({
      max: this.sampleVoltageBounds?.sensor2?.max,
      min: this.sampleVoltageBounds?.sensor2?.min,
      sensor2: this.filteredVoltages?.sensor2,
    });

    if (result.failed) {
      this.stop(result.status || "fail");
      return;
    }

    if (!result.done) {
      this.beginRangeTestProbe(result.next);
      return;
    }

    this.beginSweepFromRange(result);
  }

  beginSweepFromRange(result) {
    this.sweepPoints = Array.isArray(result.points) ? result.points : [];

    if (!this.sweepPoints.length) {
      this.stop("fail");
      return;
    }

    this.mode = "sweep";
    this.rangeTest = null;
    this.resetMidSweep();
    this.beginCurrentPoint();
  }

  beginCurrentPoint() {
    this.filteredVoltages = null;
    this.discardedFirstSample = false;
    this.sampleVoltageBounds = null;
    this.sampleCount = 0;
    this.targetWipers = null;
    this.wiperAcknowledged = !this.requireWiperAck;
    this.applyCurrentWipers();
    this.updateStatus(this.getPointStatus());
    this.scheduleStep(this.wiperAcknowledged ? this.getSettleDelay() : SWEEP_SAMPLE_INTERVAL_MS);
  }

  scheduleStep(delayMs) {
    this.timer = window.setTimeout(() => this.runStep(), delayMs);
    this.updateButton();
  }

  captureFilterSample() {
    if (!this.wiperAcknowledged) {
      if (!this.hasHardwareAppliedTargetWipers()) {
        this.updateStatus(`${this.getPointStatus()} ack`);
        return false;
      }

      this.wiperAcknowledged = true;
      this.updateStatus(`${this.getPointStatus()} set`);
      return "settling";
    }

    const voltages = this.readVoltages();

    if (this.mode !== "range-test") {
      return this.captureSweepSample(voltages);
    }

    if (!this.discardedFirstSample) {
      this.discardedFirstSample = true;
      this.updateStatus(`${this.getPointStatus()} skip`);
      return false;
    }

    this.sampleCount += 1;
    this.sampleVoltageBounds = trackVoltageBounds(this.sampleVoltageBounds, voltages);
    this.filteredVoltages = filterVoltages(this.filteredVoltages, voltages, this.sampleCount);

    const requiredSampleCount = this.getRequiredSampleCount();

    this.updateStatus(
      `${this.getPointStatus()} s${this.sampleCount}/${requiredSampleCount}`,
    );
    return true;
  }

  captureSweepSample(voltages) {
    this.sampleCount += 1;

    if (this.sampleCount <= SWEEP_DISCARD_SAMPLE_COUNT) {
      this.updateStatus(
        `${this.getPointStatus()} d${this.sampleCount}/${SWEEP_DISCARD_SAMPLE_COUNT}`,
      );
      return false;
    }

    const averageSampleIndex = this.sampleCount - SWEEP_DISCARD_SAMPLE_COUNT;
    this.filteredVoltages = filterVoltages(this.filteredVoltages, voltages, averageSampleIndex);

    this.updateStatus(
      `${this.getPointStatus()} s${averageSampleIndex}/${SWEEP_AVERAGE_SAMPLE_COUNT}`,
    );

    if (averageSampleIndex >= SWEEP_AVERAGE_SAMPLE_COUNT) {
      this.addSample(this.filteredVoltages);
    }

    return true;
  }

  readVoltages() {
    return {
      sensor1: getKnownVoltage(this.model?.sensor1Voltage)
        ?? getKnownVoltage(this.circuitScene?.getSceneSensor1Voltage?.()),
      sensor2: getKnownVoltage(this.model?.sensor2Voltage),
    };
  }

  addSample(sensorVoltages) {
    this.onSample?.({
      circuitScene: this.circuitScene,
      model: this.model,
      sampleCount: this.getOutputSampleCount(),
      sampleIndex: this.getOutputSampleIndex(),
      samplesAveraged: this.getSamplesAveraged(),
      samplesIgnored: this.getSamplesIgnored(),
      sensorVoltages: sensorVoltages ? { ...sensorVoltages } : null,
      source: this.getSampleSource(),
      ...this.getSampleContext(),
    });
  }

  advanceSweep() {
    if (!this.advanceMidSweep()) {
      this.stop("done");
      return;
    }

    this.beginCurrentPoint();
  }

  resetMidSweep() {
    this.currentMidIndex = 0;
    this.currentMid = this.sweepPoints[0] ?? MID_SWEEP_START;
  }

  advanceMidSweep() {
    if (this.currentMidIndex >= this.sweepPoints.length - 1) {
      return false;
    }

    this.currentMidIndex += 1;
    this.currentMid = this.sweepPoints[this.currentMidIndex];
    return true;
  }

  applyCurrentWipers() {
    this.applyMidWiper(this.currentMid);
  }

  applyMidWiper(mid) {
    this.applyWipers({ mid });
  }

  applyWipers(wiperOverrides) {
    const wipers = normaliseWipers({
      ...getModelWipers(this.model),
      ...wiperOverrides,
    });

    this.targetWipers = wipers;
    this.model.applyWiperValues(wipers);
    this.updateWiperDebug(wipers, { applied: true });
    this.circuitScene.render();
    this.webView.postSetWipers(wipers);
  }

  hasHardwareAppliedTargetWipers() {
    if (!this.targetWipers) {
      return true;
    }

    const revision = Number(this.getHardwareWiperRevision?.());

    if (!Number.isFinite(revision) || revision <= 0) {
      return false;
    }

    return areWipersEqual(this.getHardwareWipers?.(), this.targetWipers);
  }

  getSweepStatus() {
    return `m${this.currentMid}`;
  }

  getPointStatus() {
    if (this.mode === "range-test") {
      return this.getRangeTestStatus();
    }

    return this.getSweepStatus();
  }

  getRangeTestStatus() {
    const probe = this.rangeTest?.getCurrentProbe?.();
    const probeStatus = probe?.status ? probe.status : "";

    return `r${probeStatus} m${this.currentMid}`;
  }

  getSampleSource() {
    return "mid-sweep";
  }

  getSampleContext() {
    return {
      ledState: this.getHardwareLedState(),
    };
  }

  getRequiredSampleCount() {
    return this.mode === "range-test"
      ? RANGE_TEST_SAMPLE_COUNT
      : SWEEP_FILTER_SAMPLE_COUNT;
  }

  getOutputSampleCount() {
    return this.mode === "range-test"
      ? this.getRequiredSampleCount()
      : SWEEP_AVERAGE_SAMPLE_COUNT;
  }

  getOutputSampleIndex() {
    return this.mode === "range-test"
      ? this.sampleCount
      : SWEEP_AVERAGE_SAMPLE_COUNT;
  }

  getSamplesAveraged() {
    return this.mode === "range-test"
      ? null
      : SWEEP_AVERAGE_SAMPLE_COUNT;
  }

  getSamplesIgnored() {
    return this.mode === "range-test"
      ? null
      : SWEEP_DISCARD_SAMPLE_COUNT;
  }

  getSettleDelay() {
    return this.mode === "range-test"
      ? SWEEP_SAMPLE_INTERVAL_MS
      : SWEEP_SETTLE_MS;
  }

  getHardwareLedState() {
    return getKnownState(this.getHardwareWipers?.()?.state);
  }

  updateStatus(status) {
    if (this.status) {
      this.status.textContent = status;
    }

    this.onStatus?.(status, this);
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop sweep" : "Sweep mid";
    this.button.dataset.running = String(Boolean(this.timer));
  }
}

export class OffsetSweep extends Sweep {
  constructor(options) {
    super({
      sweepPointCount: STACKED_SWEEP_POINT_COUNT,
      ...options,
    });
    this.currentOffset = MID_SWEEP_START;
    this.updateButton();
  }

  start() {
    this.onStart?.(this);
    this.commandFlags?.setFlag(COMMAND_FLAGS.HOLD_WIPERS, true, { post: false });

    this.onClear?.();
    this.currentOffset = MID_SWEEP_START;
    this.beginRangeTest();
  }

  advanceSweep() {
    if (this.advanceMidSweep()) {
      this.beginCurrentPoint();
      return;
    }

    if (this.currentOffset < MID_SWEEP_END) {
      this.currentOffset = Math.min(this.currentOffset + STACKED_SWEEP_STEP, MID_SWEEP_END);
      this.resetMidSweep();
      this.beginCurrentPoint();
      return;
    }

    this.stop("done");
  }

  applyCurrentWipers() {
    this.applyOffsetMidWipers();
  }

  applyOffsetMidWipers() {
    this.applyWipers({
      mid: this.currentMid,
      offset: this.currentOffset,
    });
  }

  getSweepStatus() {
    return `o${this.currentOffset} m${this.currentMid}`;
  }

  getSampleSource() {
    return "offset-sweep";
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop offset" : "Sweep offset";
    this.button.dataset.running = String(Boolean(this.timer));
  }
}

export class GainSweep extends Sweep {
  constructor(options) {
    super({
      sweepPointCount: STACKED_SWEEP_POINT_COUNT,
      ...options,
    });
    this.currentGainIndex = 0;
    this.updateButton();
  }

  start() {
    this.onStart?.(this);
    this.commandFlags?.setFlag(COMMAND_FLAGS.HOLD_WIPERS, true, { post: false });

    this.onClear?.();
    this.currentGainIndex = 0;
    this.beginRangeTest();
  }

  advanceSweep() {
    if (this.advanceMidSweep()) {
      this.beginCurrentPoint();
      return;
    }

    if (this.currentGainIndex < GAIN_SWEEP_WIPERS.length - 1) {
      this.currentGainIndex += 1;
      this.resetMidSweep();
      this.beginCurrentPoint();
      return;
    }

    this.stop("done");
  }

  applyCurrentWipers() {
    this.applyGainMidWipers();
  }

  applyGainMidWipers() {
    const gain = GAIN_SWEEP_WIPERS[this.currentGainIndex];

    this.applyWipers({
      gain,
      mid: this.currentMid,
    });
  }

  getSweepStatus() {
    const gain = GAIN_SWEEP_WIPERS[this.currentGainIndex];

    return `g${gain} m${this.currentMid}`;
  }

  getSampleSource() {
    return "gain-mid-sweep";
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop gain" : "Sweep gain";
    this.button.dataset.running = String(Boolean(this.timer));
  }
}

function filterVoltages(oldVoltages, newVoltages, sampleCount) {
  return {
    sensor1: filterVoltage(oldVoltages?.sensor1, newVoltages?.sensor1, sampleCount),
    sensor2: filterVoltage(oldVoltages?.sensor2, newVoltages?.sensor2, sampleCount),
  };
}

function trackVoltageBounds(oldBounds, voltages) {
  return {
    sensor1: trackVoltageBound(oldBounds?.sensor1, voltages?.sensor1),
    sensor2: trackVoltageBound(oldBounds?.sensor2, voltages?.sensor2),
  };
}

function trackVoltageBound(oldBound, value) {
  const voltage = getKnownVoltage(value);

  if (!Number.isFinite(voltage)) {
    return oldBound ?? null;
  }

  if (!oldBound) {
    return {
      max: voltage,
      min: voltage,
    };
  }

  return {
    max: Math.max(oldBound.max, voltage),
    min: Math.min(oldBound.min, voltage),
  };
}

function areWipersEqual(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  return Object.entries(expected).every(([id, value]) => Number(actual[id]) === Number(value));
}

function filterVoltage(oldValue, newValue, sampleCount) {
  const newVoltage = getKnownVoltage(newValue);

  if (!Number.isFinite(newVoltage)) {
    return getKnownVoltage(oldValue);
  }

  const oldVoltage = getKnownVoltage(oldValue);

  if (!Number.isFinite(oldVoltage)) {
    return newVoltage;
  }

  const count = Math.max(1, Number(sampleCount) || 1);
  const t = 1 / count;

  return (1 - t) * oldVoltage + t * newVoltage;
}

function getKnownVoltage(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const voltage = Number(value);

  return Number.isFinite(voltage) ? voltage : null;
}

function getKnownState(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const state = Number(value);

  return Number.isFinite(state) && state >= 0
    ? Math.trunc(state) >>> 0
    : null;
}
