import { RAINBOW_COLORSCALE } from "../AnalysisMath.js";
import {
  VALID_SENSOR_MAX_V,
  VALID_SENSOR_MIN_V,
  isValidSensorVoltage,
} from "../../model/voltage.js";

const MIN_SAMPLE_INTERVAL_MS = 250;
const DEFAULT_AXIS_RANGES = Object.freeze({
  x: [0, 1],
  y: [-0.025, 0.025],
});
const CORRECTION_AXIS_RANGES = Object.freeze({
  x: [0, 255],
  y: [VALID_SENSOR_MIN_V, VALID_SENSOR_MAX_V],
});
const RESIDUAL_COLORSCALE = Object.freeze([
  [0, "#1877f2"],
  [0.5, "#ffffff"],
  [1, "#ff3b30"],
]);

export class DifferentialAmpFormulaTester {
  constructor({
    minSampleIntervalMs = MIN_SAMPLE_INTERVAL_MS,
  } = {}) {
    this.enabled = false;
    this.latestVoltages = null;
    this.latestWipers = null;
    this.lastSampleAt = 0;
    this.lastSampledWiperKey = null;
    this.minSampleIntervalMs = minSampleIntervalMs;
    this.model = null;
    this.pendingWiperKey = null;
    this.samples = [];
  }

  setModel(model) {
    const nextModel = model?.ready ? model : null;
    const oldModelId = this.model?.id ?? null;
    const nextModelId = nextModel?.id ?? null;

    this.model = nextModel;

    if (oldModelId !== nextModelId) {
      this.clearSamples();
    }

    return Boolean(this.model);
  }

  getModel() {
    return this.model;
  }

  getFormulae() {
    return this.model?.formulae ?? "";
  }

  getCorrectionSamples() {
    return this.samples.map((sample) => ({ ...sample }));
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);

    if (!this.enabled) {
      this.pendingWiperKey = null;
    }

    return this.enabled;
  }

  clearSamples() {
    this.lastSampleAt = 0;
    this.lastSampledWiperKey = null;
    this.pendingWiperKey = null;
    this.samples = [];
  }

  updateTelemetry({
    now = Date.now(),
    settled = false,
    voltages = null,
    wipers = null,
  } = {}) {
    if (wipers && typeof wipers === "object") {
      this.latestWipers = normaliseWipers(wipers);

      if (this.enabled) {
        this.pendingWiperKey = getWiperKey(this.latestWipers);
      }
    }

    if (voltages && typeof voltages === "object") {
      this.latestVoltages = normaliseVoltages(voltages);
    }

    if (!this.enabled || !this.model || !this.pendingWiperKey || !settled) {
      return null;
    }

    if (this.pendingWiperKey === this.lastSampledWiperKey) {
      this.pendingWiperKey = null;
      return null;
    }

    if (now - this.lastSampleAt < this.minSampleIntervalMs) {
      return null;
    }

    return this.addPendingSample(now);
  }

  addPendingSample(now) {
    const prediction = this.predictSensor1({
      sensor2: this.latestVoltages?.sensor2,
      wipers: this.latestWipers,
    });
    const sensor1 = this.latestVoltages?.sensor1;

    if (!prediction || !Number.isFinite(sensor1)) {
      return null;
    }

    const sample = {
      centre: prediction.centre,
      error: prediction.sensor1 - sensor1,
      gain: this.latestWipers.gain,
      offset: this.latestWipers.offset,
      sensor1,
      sensor1Estimate: prediction.sensor1,
      sensor2: this.latestVoltages.sensor2,
      timestamp: now,
    };

    if (!isValidFormulaSample(sample)) {
      return null;
    }

    this.samples.push(sample);
    this.lastSampleAt = now;
    this.lastSampledWiperKey = this.pendingWiperKey;
    this.pendingWiperKey = null;

    return sample;
  }

  predictSensor1({
    sensor2,
    wipers,
  } = {}) {
    const gain = Number(wipers?.gain);
    const offset = Number(wipers?.offset);
    const multiplier = this.getMultiplier(gain);
    const centre = this.getCentre(offset);

    if (!Number.isFinite(sensor2)
      || !Number.isFinite(multiplier)
      || Math.abs(multiplier) < 1e-9
      || !Number.isFinite(centre)) {
      return null;
    }

    return {
      centre,
      multiplier,
      sensor1: centre + (centre - sensor2) / multiplier,
    };
  }

  getMultiplier(gain) {
    const fit = this.model?.multiplier;

    return Number.isFinite(fit?.intercept) && Number.isFinite(fit?.slope) && Number.isFinite(gain)
      ? fit.intercept + fit.slope * gain
      : null;
  }

  getCentre(offset) {
    const fit = this.model?.centre;

    return Number.isFinite(fit?.intercept) && Number.isFinite(fit?.slope) && Number.isFinite(offset)
      ? fit.intercept + fit.slope * offset
      : null;
  }

  getChartData() {
    const axisRanges = this.model?.axisRanges ?? DEFAULT_AXIS_RANGES;

    return {
      title: "Live Sensor1 Formula Residuals",
      traces: [
        {
          hoverinfo: "skip",
          line: { color: "rgba(255, 255, 255, 0.44)", dash: "dot", width: 1.4 },
          mode: "lines",
          name: "zero error",
          type: "scatter",
          x: axisRanges.x,
          y: [0, 0],
        },
        {
          customdata: this.samples.map((sample) => [
            formatVoltage(sample.sensor1Estimate),
            formatSignedMillivolts(sample.error),
            formatVoltage(sample.sensor2),
            formatWiper(sample.gain),
            formatWiper(sample.offset),
            formatVoltage(sample.centre),
          ]),
          hovertemplate: [
            "measured Sensor1 %{x:.4f} V",
            "Sensor1 error %{y:.4f} V",
            "error %{customdata[1]}",
            "estimated Sensor1 %{customdata[0]}",
            "measured Sensor2 %{customdata[2]}",
            "gain %{customdata[3]}",
            "offset %{customdata[4]}",
            "centre %{customdata[5]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            cmax: 255,
            cmin: 0,
            color: this.samples.map((sample) => sample.gain),
            colorbar: {
              len: 0.64,
              outlinewidth: 0,
              thickness: 10,
              title: { side: "right", text: "gain" },
            },
            colorscale: RAINBOW_COLORSCALE,
            line: { color: "rgba(255, 255, 255, 0.72)", width: 0.8 },
            opacity: 0.88,
            showscale: true,
            size: 6,
          },
          mode: "markers",
          name: "live residuals",
          type: "scatter",
          x: this.samples.map((sample) => sample.sensor1),
          y: this.samples.map((sample) => sample.error),
        },
      ],
      value: this.samples.length ? String(this.samples.length) : "0",
      xRange: axisRanges.x,
      xTitle: "Measured Sensor1 (V)",
      yRange: axisRanges.y,
      yTitle: "Sensor1 Error (V)",
    };
  }

  getCorrectionChartData() {
    const colorRange = getSymmetricRange(this.samples.map((sample) => sample.error), 0.002);

    return {
      title: "Live Correction Dataset: Sensor1 Residual by Gain and Sensor2",
      traces: [
        {
          customdata: this.samples.map((sample) => [
            formatVoltage(sample.sensor1),
            formatVoltage(sample.sensor1Estimate),
            formatSignedMillivolts(sample.error),
            formatWiper(sample.offset),
            formatVoltage(sample.centre),
          ]),
          hovertemplate: [
            "gain %{x:.0f}",
            "measured Sensor2 %{y:.4f} V",
            "Sensor1 error %{customdata[2]}",
            "measured Sensor1 %{customdata[0]}",
            "estimated Sensor1 %{customdata[1]}",
            "offset %{customdata[3]}",
            "centre %{customdata[4]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            cmax: colorRange[1],
            cmin: colorRange[0],
            color: this.samples.map((sample) => sample.error),
            colorbar: {
              len: 0.64,
              outlinewidth: 0,
              thickness: 10,
              title: { side: "right", text: "S1 error" },
            },
            colorscale: RESIDUAL_COLORSCALE,
            line: { color: "rgba(255, 255, 255, 0.76)", width: 0.8 },
            opacity: 0.9,
            showscale: this.samples.length > 0,
            size: 9,
            symbol: "square",
          },
          mode: "markers",
          name: "correction samples",
          type: "scatter",
          x: this.samples.map((sample) => sample.gain),
          y: this.samples.map((sample) => sample.sensor2),
        },
      ],
      xRange: CORRECTION_AXIS_RANGES.x,
      xTitle: "Gain Wiper",
      yRange: CORRECTION_AXIS_RANGES.y,
      yTitle: "Measured Sensor2 (V)",
    };
  }
}

function isValidFormulaSample(sample) {
  return isValidSensorVoltage(sample?.sensor1)
    && isValidSensorVoltage(sample?.sensor2)
    && isValidSensorVoltage(sample?.sensor1Estimate);
}

function normaliseWipers(wipers) {
  return {
    bot: getKnownNumber(wipers?.bot),
    gain: getKnownNumber(wipers?.gain),
    mid: getKnownNumber(wipers?.mid),
    offset: getKnownNumber(wipers?.offset),
    state: wipers?.state ?? null,
    top: getKnownNumber(wipers?.top),
  };
}

function normaliseVoltages(voltages) {
  return {
    sensor1: getKnownNumber(voltages?.sensor1),
    sensor2: getKnownNumber(voltages?.sensor2),
  };
}

function getWiperKey(wipers) {
  return [
    wipers?.top,
    wipers?.bot,
    wipers?.mid,
    wipers?.offset,
    wipers?.gain,
    wipers?.state,
  ].map((value) => String(value ?? "")).join("|");
}

function getKnownNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getSymmetricRange(values, fallbackMaxAbs) {
  const maxAbs = Math.max(
    fallbackMaxAbs,
    ...values.filter(Number.isFinite).map((value) => Math.abs(value)),
  );

  return [-maxAbs, maxAbs];
}

function formatVoltage(value) {
  return Number.isFinite(value) ? `${value.toFixed(4)} V` : "-";
}

function formatSignedMillivolts(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : "-"}${Math.abs(value * 1000).toFixed(3)} mV`;
}

function formatWiper(value) {
  return Number.isFinite(value) ? String(value) : "-";
}
