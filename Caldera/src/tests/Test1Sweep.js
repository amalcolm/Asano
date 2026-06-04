import { Sweep } from "../helpers/Sweep.js";

export const TEST1_GAIN_VALUES = Object.freeze([64, 48, 32, 24, 16, 8, 4, 2, 1, 0]);
export const TEST1_OFFSET_VALUES = Object.freeze([128, 96, 160, 64, 192, 32, 224, 0, 255]);

export class Test1Sweep extends Sweep {
  constructor({
    gainValues = TEST1_GAIN_VALUES,
    offsetValues = TEST1_OFFSET_VALUES,
    ...options
  }) {
    super(options);
    this.currentConfigurationIndex = 0;
    this.gainValues = normaliseWiperValues(gainValues);
    this.offsetValues = normaliseWiperValues(offsetValues);
    this.configurations = getCalibrationConfigurations(this.gainValues, this.offsetValues);
    this.updateButton();
  }

  start() {
    this.currentConfigurationIndex = 0;
    this.configurations = getCalibrationConfigurations(this.gainValues, this.offsetValues);
    super.start();
  }

  beginRangeTest() {
    if (!this.getCurrentConfiguration()) {
      this.stop("done");
      return;
    }

    super.beginRangeTest();
  }

  recordRangeTestSample() {
    const result = this.rangeTest?.record({
      max: this.sampleVoltageBounds?.sensor2?.max,
      min: this.sampleVoltageBounds?.sensor2?.min,
      sensor2: this.filteredVoltages?.sensor2,
    });

    if (!result || result.failed) {
      this.handleRangeTestFailure(result);
      return;
    }

    if (!result.done) {
      this.beginRangeTestProbe(result.next);
      return;
    }

    this.beginSweepFromRange(result);
  }

  advanceSweep() {
    if (this.advanceMidSweep()) {
      this.beginCurrentPoint();
      return;
    }

    if (this.advanceConfiguration()) {
      this.beginRangeTest();
      return;
    }

    this.stop("done");
  }

  applyCurrentWipers() {
    const configuration = this.getCurrentConfiguration();

    if (!configuration) {
      return;
    }

    this.applyWipers({
      gain: configuration.gain,
      mid: this.currentMid,
      offset: configuration.offset,
    });
  }

  getCurrentConfiguration() {
    return this.configurations[this.currentConfigurationIndex] ?? null;
  }

  getCurrentConfigurationLabel() {
    const configuration = this.getCurrentConfiguration();

    return configuration
      ? `g${configuration.gain} o${configuration.offset}`
      : "done";
  }

  getRangeTestStatus() {
    const probe = this.rangeTest?.getCurrentProbe?.();
    const probeStatus = probe?.status ? probe.status : "";

    return `T1 ${this.getCurrentConfigurationLabel()} r${probeStatus} m${this.currentMid}`;
  }

  getSweepStatus() {
    return `T1 ${this.getCurrentConfigurationLabel()} m${this.currentMid}`;
  }

  getSampleSource() {
    return "test1";
  }

  getSampleContext() {
    return {
      ledLabel: this.getCurrentConfigurationLabel(),
      ledState: this.getHardwareLedState(),
      test: "Diff.Amp.",
    };
  }

  advanceConfiguration() {
    if (this.currentConfigurationIndex >= this.configurations.length - 1) {
      return false;
    }

    this.currentConfigurationIndex += 1;
    return true;
  }

  handleRangeTestFailure(result) {
    if (this.advanceConfiguration()) {
      this.beginRangeTest();
      return;
    }

    this.stop(result?.status || "fail");
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop Diff.Amp." : "Diff.Amp.";
    this.button.dataset.running = String(Boolean(this.timer));
  }
}

function getCalibrationConfigurations(gainValues, offsetValues) {
  return offsetValues.flatMap((offset) => (
    gainValues.map((gain) => ({ gain, offset }))
  ));
}

function normaliseWiperValues(values) {
  return Array.from(new Set(Array.from(values ?? [], normaliseWiperValue)))
    .filter(Number.isFinite);
}

function normaliseWiperValue(value) {
  const wiper = Number(value);

  if (!Number.isFinite(wiper)) {
    return null;
  }

  return Math.max(0, Math.min(255, Math.trunc(wiper)));
}
