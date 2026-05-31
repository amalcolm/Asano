import { Sweep } from "../helpers/Sweep.js";
import {
  addVoltageAverageSample,
  AVERAGE_SAMPLE_COUNT,
  beginVoltageAverage,
  DISCARD_SAMPLE_COUNT,
  getKnownStep,
  getKnownVoltage,
  getVoltageAverage,
} from "./DeltaSweepHelpers.js";

export const TEST4_GAIN_VALUES = Object.freeze([64, 48, 32, 24, 16, 8, 4, 2, 1]);

export class Test4Sweep extends Sweep {
  constructor(options) {
    super(options);
    this.currentGainIndex = 0;
    this.previousMid = null;
    this.previousSensor2Average = null;
    this.updateButton();
  }

  start() {
    this.currentGainIndex = 0;
    this.previousMid = null;
    this.previousSensor2Average = null;
    super.start();
  }

  beginSweepFromRange(result) {
    this.previousMid = null;
    this.previousSensor2Average = null;
    super.beginSweepFromRange(result);
  }

  advanceSweep() {
    if (this.advanceMidSweep()) {
      this.beginCurrentPoint();
      return;
    }

    if (this.currentGainIndex < TEST4_GAIN_VALUES.length - 1) {
      this.currentGainIndex += 1;
      this.previousMid = null;
      this.previousSensor2Average = null;
      this.beginRangeTest();
      return;
    }

    this.stop("done");
  }

  applyCurrentWipers() {
    this.applyWipers({
      gain: this.getCurrentGain(),
      mid: this.currentMid,
    });
  }

  captureFilterSample() {
    if (this.mode === "range-test") {
      return super.captureFilterSample();
    }

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

    this.sampleCount += 1;

    if (this.sampleCount <= DISCARD_SAMPLE_COUNT) {
      this.updateStatus(
        `${this.getPointStatus()} d${this.sampleCount}/${DISCARD_SAMPLE_COUNT}`,
      );
      return false;
    }

    const averageSampleIndex = this.sampleCount - DISCARD_SAMPLE_COUNT;
    if (averageSampleIndex === 1) {
      this.voltageAverage = beginVoltageAverage();
    }

    this.voltageAverage = addVoltageAverageSample(this.voltageAverage, voltages);
    this.filteredVoltages = getVoltageAverage(this.voltageAverage);

    this.updateStatus(
      `${this.getPointStatus()} s${averageSampleIndex}/${AVERAGE_SAMPLE_COUNT}`,
    );

    if (this.sampleCount >= this.getRequiredSampleCount()) {
      this.addSample(this.filteredVoltages);
    }

    return true;
  }

  addSample(sensorVoltages) {
    const sensor1Average = getKnownVoltage(sensorVoltages?.sensor1);
    const sensor2Average = getKnownVoltage(sensorVoltages?.sensor2);
    const sensor2Step = getKnownStep(this.previousMid, this.currentMid);
    const sensor2Previous = this.previousSensor2Average;
    const sensor2RawDelta = Number.isFinite(sensor2Average) && Number.isFinite(sensor2Previous)
      ? sensor2Average - sensor2Previous
      : null;
    const sensor2Delta = Number.isFinite(sensor2RawDelta) && Number.isFinite(sensor2Step)
      ? sensor2RawDelta / sensor2Step
      : null;

    this.onSample?.({
      circuitScene: this.circuitScene,
      model: this.model,
      plot: {
        hoverXLabel: "mid",
        hoverYLabel: "Sensor2 d/count",
        kind: "test4-delta",
        x: this.currentMid,
        xLabel: "Mid wiper",
        y: sensor2Delta,
        yLabel: "Sensor2 delta / mid step (V/count)",
      },
      sampleCount: AVERAGE_SAMPLE_COUNT,
      sampleIndex: AVERAGE_SAMPLE_COUNT,
      samplesAveraged: AVERAGE_SAMPLE_COUNT,
      samplesIgnored: DISCARD_SAMPLE_COUNT,
      sensor2Average,
      sensor2Delta,
      sensor2Previous,
      sensor2RawDelta,
      sensor2Step,
      sensorVoltages: {
        sensor1: sensor1Average,
        sensor2: sensor2Average,
      },
      source: this.getSampleSource(),
      ...this.getSampleContext(),
    });

    if (Number.isFinite(sensor2Average)) {
      this.previousMid = this.currentMid;
      this.previousSensor2Average = sensor2Average;
    }
  }

  getCurrentGain() {
    return TEST4_GAIN_VALUES[this.currentGainIndex] ?? TEST4_GAIN_VALUES[0];
  }

  getRequiredSampleCount() {
    return this.mode === "range-test"
      ? super.getRequiredSampleCount()
      : DISCARD_SAMPLE_COUNT + AVERAGE_SAMPLE_COUNT;
  }

  getSweepStatus() {
    return `T4 g${this.getCurrentGain()} m${this.currentMid}`;
  }

  getSampleSource() {
    return "test4";
  }

  getSampleContext() {
    return {
      ledState: this.getHardwareLedState(),
      test: "Test4",
    };
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    this.button.textContent = this.timer ? "Stop Test4" : "Test4";
    this.button.dataset.running = String(Boolean(this.timer));
  }
}
