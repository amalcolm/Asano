import { DifferentialAmpSensorModel } from "../helpers/DifferentialAmpSensorModel.js";
import { getModelWipers } from "../helpers/Wipers.js";
import { isValidSensorVoltage } from "../model/voltage.js";
import { DEFAULT_MODEL_MAPPING } from "./ModelMapping.js";

export class AnalysisDataset {
  constructor({
    modelMapping = DEFAULT_MODEL_MAPPING,
    sensorModel = new DifferentialAmpSensorModel(),
  } = {}) {
    this.modelMapping = modelMapping;
    this.metadata = createCsvMetadata({ modelMapping: this.modelMapping });
    this.sensorModel = sensorModel;
    this.samples = [];
  }

  clear({
    category = null,
    label = null,
    name = null,
    source = null,
    startedAt = Date.now(),
    testId = null,
  } = {}) {
    this.metadata = createCsvMetadata({
      category,
      label,
      modelMapping: this.modelMapping,
      name,
      source,
      startedAt,
      testId,
    });
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
    const sensor1Estimated = getKnownVoltage(this.sensorModel.circuitSensor1FromSensor2(
      sensor2Actual,
      wipers.gain,
      wipers.offset,
    ));
    const sensor2Estimated = getKnownVoltage(this.sensorModel.circuitSensor2FromSensor1(
      sensor1Actual,
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
      sensorEstimated: {
        sensor1: sensor1Estimated,
        sensor2: sensor2Estimated,
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

  addSample(sample) {
    if (!sample || typeof sample !== "object") {
      return null;
    }

    this.samples.push(sample);
    return sample;
  }

  loadCsv({
    content,
    filename = "Dataset.csv",
  } = {}) {
    const parsedRows = parseCsvRows(content);

    if (parsedRows.length < 2) {
      throw new Error("CSV has no samples");
    }

    const header = parsedRows[0];
    const lookup = createHeaderLookup(header);
    const kind = getCsvKind(lookup);

    if (!kind) {
      throw new Error("unsupported CSV");
    }

    const source = inferCsvSource({
      filename,
      kind,
      lookup,
      modelMapping: this.modelMapping,
      rows: parsedRows.slice(1),
    });
    const startedAt = Date.now();
    const samples = parsedRows
      .slice(1)
      .map((row) => createSampleFromCsvRow(row, {
        kind,
        lookup,
        modelMapping: this.modelMapping,
        sensorModel: this.sensorModel,
        source,
        startedAt,
      }))
      .filter(Boolean);

    if (!samples.length) {
      throw new Error("CSV has no usable samples");
    }

    this.metadata = createCsvMetadata({
      filename,
      label: getCsvLabelFromFilename(filename),
      modelMapping: this.modelMapping,
      source,
      startedAt,
    });
    this.samples = samples;

    return {
      imported: samples.length,
      kind,
      skipped: parsedRows.length - 1 - samples.length,
      source,
    };
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

  getAvailableModelTracks() {
    return this.modelMapping.getModelTracks(this.metadata);
  }

  hasModelTrack(track) {
    return this.modelMapping.hasModelTrack(this.metadata, track);
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
  "",
  "sensor1",
  "sensor2",
  "sensor1_est",
  "sensor2_est",
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

const CSV_KIND_DELTA = "delta";
const CSV_KIND_SENSOR_COMPARISON = "sensor-comparison";

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
    "",
    formatCsvNumber(sample.sensorActual.sensor1),
    formatCsvNumber(sample.sensorActual.sensor2),
    formatCsvNumber(sample.sensorEstimated?.sensor1),
    formatCsvNumber(sample.sensorEstimated?.sensor2),
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

function createCsvMetadata({
  category = null,
  filename = null,
  label = null,
  modelMapping = DEFAULT_MODEL_MAPPING,
  name = null,
  source = null,
  startedAt = Date.now(),
  testId = null,
} = {}) {
  const mappedDataset = modelMapping.resolveDataset({
    category,
    filename,
    label,
    name,
    source,
    testId,
  });

  return {
    category: mappedDataset.category,
    label: mappedDataset.label,
    modelTracks: mappedDataset.modelTracks,
    name: mappedDataset.name,
    source: mappedDataset.source,
    startedAt: getKnownTimestamp(startedAt) ?? Date.now(),
    testId: mappedDataset.testId,
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

function getCsvLabelFromFilename(filename) {
  return normaliseCsvLabel(getFilenameLeaf(filename)
    .replace(/\.csv$/iu, "")
    .replace(/[_-]+/g, " "));
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

function createSampleFromCsvRow(row, {
  kind,
  lookup,
  modelMapping,
  sensorModel,
  source,
  startedAt,
}) {
  const elapsedSeconds = getKnownNumber(getCsvCell(row, lookup, "Seconds"));
  const timestamp = Number.isFinite(elapsedSeconds)
    ? startedAt + elapsedSeconds * 1000
    : startedAt;
  const wipers = {
    bot: getKnownNumber(getCsvCell(row, lookup, "bot")),
    gain: getKnownNumber(getCsvCell(row, lookup, "gain")),
    mid: getKnownNumber(getCsvCell(row, lookup, "mid")),
    offset: getKnownNumber(getCsvCell(row, lookup, "offset")),
    top: getKnownNumber(getCsvCell(row, lookup, "top")),
  };
  const sensor1Actual = getKnownVoltage(getCsvCell(row, lookup, "sensor1"));
  const sensor2Actual = getKnownVoltage(getCsvCell(row, lookup, "sensor2"));
  const csvSensor1Predicted = getKnownVoltage(getCsvCell(row, lookup, "sensor1Predicted"));
  const csvSensor2Predicted = getKnownVoltage(getCsvCell(row, lookup, "sensor2Predicted"));
  const sensor1Predicted = csvSensor1Predicted ?? getKnownVoltage(sensorModel.sensor1FromSensor2(
    sensor2Actual,
    wipers.gain,
    wipers.offset,
  ));
  const sensor2Predicted = csvSensor2Predicted ?? getKnownVoltage(sensorModel.sensor2FromSensor1(
    sensor1Actual,
    wipers.gain,
    wipers.offset,
  ));
  const sensor2Delta = getKnownVoltage(getCsvCell(row, lookup, "sensor2DeltaPerStep"));

  if (kind === CSV_KIND_DELTA && !Number.isFinite(sensor2Delta)) {
    return null;
  }

  if (kind !== CSV_KIND_DELTA
    && !Number.isFinite(sensor1Actual)
    && !Number.isFinite(sensor2Actual)) {
    return null;
  }

  return {
    diffAmpEffectiveMultiplier: getKnownNumber(getCsvCell(row, lookup, "diffAmpMultiplier")),
    elapsedSeconds,
    ledLabel: normaliseCsvLabel(getCsvCell(row, lookup, "leds")),
    leds: null,
    ledState: getKnownState(getCsvCell(row, lookup, "ledState")),
    midOutputVoltage: getKnownVoltage(getCsvCell(row, lookup, "midVoltage")),
    offsetOutputVoltage: getKnownVoltage(getCsvCell(row, lookup, "offsetVoltage")),
    plot: kind === CSV_KIND_DELTA
      ? getDeltaCsvPlot(source, wipers, sensor2Delta)
      : normalisePlot(null, sensor1Actual, sensor2Actual),
    sampleCount: null,
    sampleIndex: null,
    samplesAveraged: null,
    samplesIgnored: null,
    sensor2Average: sensor2Actual,
    sensor2Delta,
    sensor2Previous: getKnownVoltage(getCsvCell(row, lookup, "sensor2Previous")),
    sensor2RawDelta: getKnownVoltage(getCsvCell(row, lookup, "sensor2RawDelta")),
    sensor2Step: getKnownNumber(getCsvCell(row, lookup, "sensor2DeltaStep")),
    sensorActual: {
      sensor1: sensor1Actual,
      sensor2: sensor2Actual,
    },
    sensorEstimated: {
      sensor1: getKnownVoltage(getCsvCell(row, lookup, "sensor1_est")),
      sensor2: getKnownVoltage(getCsvCell(row, lookup, "sensor2_est")),
    },
    sensorPredicted: {
      sensor1: sensor1Predicted,
      sensor2: sensor2Predicted,
    },
    residuals: {
      sensor1: getKnownVoltage(getCsvCell(row, lookup, "sensor1Residual"))
        ?? subtractKnown(sensor1Actual, sensor1Predicted),
      sensor2: getKnownVoltage(getCsvCell(row, lookup, "sensor2Residual"))
        ?? subtractKnown(sensor2Actual, sensor2Predicted),
    },
    source,
    test: getTestNameForSource(source, modelMapping),
    timestamp,
    wipers,
  };
}

function parseCsvRows(content) {
  const text = String(content ?? "").replace(/^\uFEFF/u, "");
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }

      continue;
    }

    if (char === '"' && cell === "") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\r" || char === "\n") {
      row.push(cell);
      rows.push(row);
      cell = "";
      row = [];

      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => String(value ?? "").trim()));
}

function createHeaderLookup(header) {
  const lookup = new Map();

  header.forEach((name, index) => {
    const key = normaliseHeaderName(name);

    if (key && !lookup.has(key)) {
      lookup.set(key, index);
    }
  });

  return lookup;
}

function getCsvCell(row, lookup, name) {
  const index = lookup.get(normaliseHeaderName(name));

  return Number.isInteger(index) ? row[index] : "";
}

function normaliseHeaderName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function getCsvKind(lookup) {
  if (lookup.has(normaliseHeaderName("sensor2DeltaPerStep"))) {
    return CSV_KIND_DELTA;
  }

  if (lookup.has(normaliseHeaderName("sensor1"))
    && lookup.has(normaliseHeaderName("sensor2"))
    && lookup.has(normaliseHeaderName("mid"))) {
    return CSV_KIND_SENSOR_COMPARISON;
  }

  return null;
}

function inferCsvSource({
  filename,
  kind,
  lookup,
  modelMapping = DEFAULT_MODEL_MAPPING,
  rows,
}) {
  const mappedSource = getCompatibleCsvSource(
    modelMapping.resolveDataset({ filename })?.source,
    kind,
  );

  if (mappedSource) {
    return mappedSource;
  }

  const label = getFilenameLeaf(filename).toLowerCase();

  if (kind === CSV_KIND_DELTA) {
    if (label.includes("test4")) return "test4";
    if (label.includes("test3")) return "test3";
    if (label.includes("test2")) return "test2";
    if (getUniqueCsvNumberCount(rows, lookup, "gain") > 1) return "test4";
    return "test2";
  }

  if (label.includes("test1") || (label.includes("diff") && label.includes("amp"))) return "test1";
  if (label.includes("gain")) return "gain-mid-sweep";
  if (label.includes("offset")) return "offset-sweep";
  if (label.includes("mid")) return "mid-sweep";
  if (getUniqueCsvNumberCount(rows, lookup, "gain") > 1) return "gain-mid-sweep";
  if (getUniqueCsvNumberCount(rows, lookup, "offset") > 1) return "offset-sweep";

  return "mid-sweep";
}

function getUniqueCsvNumberCount(rows, lookup, name) {
  return new Set(
    rows
      .map((row) => getKnownNumber(getCsvCell(row, lookup, name)))
      .filter(Number.isFinite),
  ).size;
}

function getDeltaCsvPlot(source, wipers, sensor2Delta) {
  if (source === "test3") {
    return {
      hoverXLabel: "offset",
      hoverYLabel: "Sensor2 d/count",
      kind: "test3-delta",
      x: getKnownNumber(wipers.offset),
      xLabel: "Offset wiper",
      y: sensor2Delta,
      yLabel: "Sensor2 delta / offset step (V/count)",
    };
  }

  return {
    hoverXLabel: "mid",
    hoverYLabel: "Sensor2 d/count",
    kind: source === "test4" ? "test4-delta" : "test2-delta",
    x: getKnownNumber(wipers.mid),
    xLabel: "Mid wiper",
    y: sensor2Delta,
    yLabel: "Sensor2 delta / mid step (V/count)",
  };
}

function getTestNameForSource(source, modelMapping = DEFAULT_MODEL_MAPPING) {
  return modelMapping.getTestForSource(source)?.name ?? null;
}

function getCompatibleCsvSource(source, kind) {
  if (!source) {
    return null;
  }

  if (kind === CSV_KIND_DELTA) {
    return isDeltaSource(source) ? source : null;
  }

  return isDeltaSource(source) ? null : source;
}

function isDeltaSource(source) {
  return source === "test2" || source === "test3" || source === "test4";
}

function getFilenameLeaf(filename) {
  return String(filename ?? "").split(/[\\/]/u).pop() ?? "";
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
