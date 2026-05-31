import { DifferentialAmpSensorModel } from "../helpers/DifferentialAmpSensorModel.js";
import { getModelWipers } from "../helpers/Wipers.js";
import { isValidSensorVoltage } from "../model/voltage.js";

export class AnalysisDataset {
  constructor({
    sensorModel = new DifferentialAmpSensorModel(),
  } = {}) {
    this.metadata = createCsvMetadata();
    this.sensorModel = sensorModel;
    this.samples = [];
  }

  clear({ label = null, startedAt = Date.now() } = {}) {
    this.metadata = createCsvMetadata({ label, startedAt });
    this.samples = [];
  }

  addSampleFromModel({
    circuitScene,
    ledLabel = null,
    leds = null,
    ledState = null,
    model,
    plot = null,
    sampleCount = null,
    sampleIndex = null,
    samplesAveraged = null,
    samplesIgnored = null,
    sensor2Average = null,
    sensor2Delta = null,
    sensor2Previous = null,
    sensor2RawDelta = null,
    sensor2Step = null,
    sensorVoltages = null,
    source = "manual",
    test = null,
  }) {
    const timestamp = Date.now();
    const wipers = getModelWipers(model);
    const sensor1Actual = getKnownVoltage(sensorVoltages?.sensor1)
      ?? getKnownVoltage(model.sensor1Voltage)
      ?? circuitScene?.getSceneSensor1Voltage?.()
      ?? null;
    const sensor2Actual = getKnownVoltage(sensorVoltages?.sensor2)
      ?? getKnownVoltage(model.sensor2Voltage);
    const sensor2Predicted = getKnownVoltage(this.sensorModel.sensor2FromSensor1(
      sensor1Actual,
      wipers.gain,
      wipers.offset,
    ));
    const sensor1Predicted = getKnownVoltage(this.sensorModel.sensor1FromSensor2(
      sensor2Actual,
      wipers.gain,
      wipers.offset,
    ));
    const diffAmpEffectiveMultiplier = getKnownNumber(
      this.sensorModel.circuitGainRatioFromWiper(wipers.gain),
    );
    const midOutputVoltage = getKnownVoltage(model?.mid?.wiperVoltage);
    const offsetOutputVoltage = getKnownVoltage(model?.offset?.wiperVoltage);
    const sample = {
      diffAmpEffectiveMultiplier,
      ledLabel,
      leds: normaliseLedMap(leds),
      ledState: getKnownState(ledState),
      plot: normalisePlot(plot, sensor1Actual, sensor2Actual),
      sampleCount: getKnownCount(sampleCount),
      sampleIndex: getKnownCount(sampleIndex),
      samplesAveraged: getKnownCount(samplesAveraged),
      samplesIgnored: getKnownNonNegativeCount(samplesIgnored),
      midOutputVoltage,
      offsetOutputVoltage,
      source,
      timestamp,
      elapsedSeconds: getElapsedSeconds(timestamp, this.metadata.startedAt),
      test,
      wipers,
      sensorActual: {
        sensor1: sensor1Actual,
        sensor2: sensor2Actual,
      },
      sensorPredicted: {
        sensor1: sensor1Predicted,
        sensor2: sensor2Predicted,
      },
      residuals: {
        sensor1: subtractKnown(sensor1Actual, sensor1Predicted),
        sensor2: subtractKnown(sensor2Actual, sensor2Predicted),
      },
      sensor2Average: getKnownVoltage(sensor2Average),
      sensor2Delta: getKnownVoltage(sensor2Delta),
      sensor2Previous: getKnownVoltage(sensor2Previous),
      sensor2RawDelta: getKnownVoltage(sensor2RawDelta),
      sensor2Step: getKnownNumber(sensor2Step),
    };

    this.samples.push(sample);

    return sample;
  }

  getAnalysisSamples() {
    return this.samples.map((sample) => ({
      ...sample,
      isPlottable: isSamplePlottable(sample),
    }));
  }

  toCsv() {
    if (this.samples.length && this.samples.every(isDeltaTestSample)) {
      return this.toDeltaTestCsv();
    }

    return [
      getCsvHeader(SENSOR_COMPARISON_CSV_HEADER),
      ...this.samples.map((sample) => [
        ...formatBaseCsvCells(sample),
        formatCsvNumber(sample.ledState, 0),
        sample.ledLabel ?? "",
        formatCsvNumber(sample.sensorPredicted.sensor1),
        formatCsvNumber(sample.sensorPredicted.sensor2),
        formatCsvNumber(sample.residuals.sensor1),
        formatCsvNumber(sample.residuals.sensor2),
      ].join(",")),
    ].join("\n");
  }

  toDeltaTestCsv() {
    return [
      getCsvHeader(DELTA_TEST_CSV_HEADER),
      ...this.samples.map(formatDeltaTestCsvRow),
    ].join("\n");
  }

  getCsvName() {
    return getCsvLabel(this.metadata.label, this.samples);
  }

  getCsvFilename() {
    return `${sanitiseFilename(this.getCsvName())}.csv`;
  }
}

const BASE_CSV_HEADER = [
  "Seconds",
  "top",
  "bot",
  "mid",
  "midVoltage",
  "gain",
  "offset",
  "offsetVoltage",
  "diffAmpMultiplier",
  "sensor1",
  "sensor2",
  "",
];

const SENSOR_COMPARISON_CSV_HEADER = [
  "ledState",
  "leds",
  "sensor1Predicted",
  "sensor2Predicted",
  "sensor1Residual",
  "sensor2Residual",
];

const DELTA_TEST_CSV_HEADER = [
  "sensor2Previous",
  "sensor2RawDelta",
  "sensor2DeltaStep",
  "sensor2DeltaPerStep",
];

function getCsvHeader(columns) {
  return [...BASE_CSV_HEADER, ...columns].join(",");
}

function formatBaseCsvCells(sample) {
  return [
    formatCsvNumber(sample.elapsedSeconds, 3),
    sample.wipers.top,
    sample.wipers.bot,
    sample.wipers.mid,
    formatCsvNumber(sample.midOutputVoltage),
    sample.wipers.gain,
    sample.wipers.offset,
    formatCsvNumber(sample.offsetOutputVoltage),
    formatCsvNumber(sample.diffAmpEffectiveMultiplier),
    formatCsvNumber(sample.sensorActual.sensor1),
    formatCsvNumber(sample.sensorActual.sensor2),
    "",
  ];
}

function formatDeltaTestCsvRow(sample) {
  return [
    ...formatBaseCsvCells(sample),
    formatCsvNumber(sample.sensor2Previous),
    formatCsvNumber(sample.sensor2RawDelta),
    formatCsvNumber(sample.sensor2Step, 0),
    formatCsvNumber(sample.sensor2Delta),
  ].join(",");
}

function createCsvMetadata({ label = null, startedAt = Date.now() } = {}) {
  return {
    label: normaliseCsvLabel(label),
    startedAt: getKnownTimestamp(startedAt) ?? Date.now(),
  };
}

function getCsvLabel(label, samples) {
  return normaliseCsvLabel(label)
    ?? normaliseCsvLabel(samples.find((sample) => sample?.test)?.test)
    ?? normaliseCsvLabel(samples.find((sample) => sample?.source)?.source)
    ?? "Dataset";
}

function sanitiseFilename(label) {
  const filename = normaliseCsvLabel(label)
    ?.replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\.+$/g, "")
    .trim();

  return filename || "Dataset";
}

function normaliseCsvLabel(label) {
  const text = String(label ?? "").replace(/\s+/g, " ").trim();

  return text || null;
}

function getKnownTimestamp(value) {
  const timestamp = Number(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getElapsedSeconds(timestamp, startedAt) {
  const sampleTimestamp = getKnownTimestamp(timestamp);
  const startTimestamp = getKnownTimestamp(startedAt);

  return sampleTimestamp !== null && startTimestamp !== null
    ? Math.max(0, (sampleTimestamp - startTimestamp) / 1000)
    : null;
}

function isSamplePlottable(sample) {
  if (isDeltaTestSample(sample)) {
    return Number.isFinite(sample.plot.x) && Number.isFinite(sample.plot.y);
  }

  return isValidSensorVoltage(sample.sensorActual.sensor1)
    && isValidSensorVoltage(sample.sensorActual.sensor2);
}

function isDeltaTestSample(sample) {
  return sample?.plot?.kind === "test2-delta"
    || sample?.plot?.kind === "test3-delta"
    || sample?.plot?.kind === "test4-delta";
}

function normalisePlot(plot, fallbackX, fallbackY) {
  const hasCustomPlot = plot && typeof plot === "object";

  return {
    hoverXLabel: String(plot?.hoverXLabel ?? "Sensor1"),
    hoverYLabel: String(plot?.hoverYLabel ?? "actual Sensor2"),
    kind: String(plot?.kind ?? "sensor-comparison"),
    x: hasCustomPlot ? getKnownNumber(plot.x) : getKnownNumber(fallbackX),
    xLabel: String(plot?.xLabel ?? "Sensor1 (V)"),
    y: hasCustomPlot ? getKnownNumber(plot.y) : getKnownNumber(fallbackY),
    yLabel: String(plot?.yLabel ?? "Sensor2 (V)"),
  };
}

function getKnownVoltage(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const voltage = Number(value);

  return Number.isFinite(voltage) ? voltage : null;
}

function getKnownNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getKnownState(value) {
  const state = Number(value);

  return Number.isFinite(state) && state >= 0
    ? Math.trunc(state) >>> 0
    : null;
}

function getKnownCount(value) {
  const count = Number(value);

  return Number.isFinite(count) && count > 0
    ? Math.trunc(count)
    : null;
}

function getKnownNonNegativeCount(value) {
  const count = Number(value);

  return Number.isFinite(count) && count >= 0
    ? Math.trunc(count)
    : null;
}

function subtractKnown(actual, predicted) {
  return Number.isFinite(actual) && Number.isFinite(predicted)
    ? actual - predicted
    : null;
}

function normaliseLedMap(leds) {
  if (!leds || typeof leds !== "object") {
    return null;
  }

  return Object.fromEntries(
    Object.entries(leds).map(([id, active]) => [id, active === true]),
  );
}

function formatCsvNumber(value, fractionDigits = 9) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const number = Number(value);

  return Number.isFinite(number) ? number.toFixed(fractionDigits) : "";
}
