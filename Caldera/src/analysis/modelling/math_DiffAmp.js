import {
  FIT_LINE_COLORS,
  HEAT_COLORSCALE,
  formatMillivolts,
  formatMultiplier,
  formatWiper,
  getLinearFit,
  getRainbowColor,
  getStageMarker,
} from "../AnalysisMath.js";

const ANALYSIS_CSV_HEADER = [
  "source",
  "name",
  "slope",
  "y-intercept",
  "rmsV",
  "samples",
  "topWiper",
  "botWiper",
  "offsetWiper",
  "gainWiper",
  "diffAmpEffectiveMultiplier",
  "ledState",
  "leds",
  "minMidWiper",
  "maxMidWiper",
].join(",");

const MIN_MODEL_GAIN = 2;

function formatCsvNumber(value, fractionDigits = 9) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(fractionDigits) : "";
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function getSensorComparisonFit(samples) {
  return getLinearFit(samples.map((sample) => ({
    plot: {
      x: sample.sensorActual.sensor1,
      y: sample.sensorActual.sensor2,
    },
  })));
}

function getSourceLabel(source) {
  switch (source) {
    case "test1":
      return "Test1";
    case "mid-sweep":
      return "Mid sweep";
    case "gain-mid-sweep":
      return "Gain sweep";
    case "offset-sweep":
      return "Offset sweep";
    default:
      return "Sample";
  }
}

function isModelGain(row) {
  return Number.isFinite(row.gain) && row.gain >= MIN_MODEL_GAIN;
}

function getReducedRows(fitRows) {
  return (fitRows ?? []).filter((row) => (
    Number.isFinite(row.computedMultiplier)
      && Number.isFinite(row.computedCentre)
  ));
}

function getModelRows(fitRows) {
  return getReducedRows(fitRows).filter(isModelGain);
}

function getMultiplierModelRows(fitRows) {
  return (fitRows ?? []).filter((row) => (
    isModelGain(row)
      && Number.isFinite(row.computedMultiplier)
  ));
}

function getCentreModelRows(fitRows) {
  return getModelRows(fitRows).filter((row) => (
    Number.isFinite(row.offset)
      && Number.isFinite(row.computedCentre)
  ));
}

function getForwardModelSamples(samples) {
  return (samples ?? []).filter((sample) => (
    sample.plot?.kind === "sensor-comparison"
      && Number.isFinite(sample.wipers?.gain)
      && sample.wipers.gain >= MIN_MODEL_GAIN
      && Number.isFinite(sample.wipers?.offset)
      && Number.isFinite(sample.sensorActual?.sensor1)
      && Number.isFinite(sample.sensorActual?.sensor2)
  ));
}

function getCentreFit(rows) {
  return getLinearFit(rows.map((row) => ({
    plot: {
      x: row.computedMultiplier,
      y: row.computedCentre,
    },
  })));
}

function getCentreFitTrace(rows, {
  color,
  dash = "solid",
  name,
}) {
  const fit = getCentreFit(rows);

  return fit.lineX.length
    ? {
      hovertemplate: [
        "multiplier %{x:.4f}",
        "fit centre %{y:.4f} V",
        `<extra>${name}</extra>`,
      ].join("<br>"),
      line: { color, dash, width: 2.5 },
      mode: "lines",
      name,
      type: "scatter",
      x: fit.lineX,
      y: fit.lineY,
    }
    : null;
}

function getMultiplierModelFit(rows) {
  return getLinearFit(rows.map((row) => ({
    plot: {
      x: row.gain,
      y: row.computedMultiplier,
    },
  })));
}

function getMultiplierAverageRows(rows) {
  const groupsByGain = new Map();

  rows.forEach((row) => {
    if (!groupsByGain.has(row.gain)) {
      groupsByGain.set(row.gain, []);
    }

    groupsByGain.get(row.gain).push(row);
  });

  return Array.from(groupsByGain.entries())
    .map(([gain, gainRows]) => {
      const multipliers = gainRows.map((row) => row.computedMultiplier);
      return {
        count: gainRows.length,
        gain,
        maxMultiplier: Math.max(...multipliers),
        meanMultiplier: multipliers.reduce((sum, value) => sum + value, 0) / multipliers.length,
        minMultiplier: Math.min(...multipliers),
      };
    })
    .sort((left, right) => left.gain - right.gain);
}

function getCentreAverageRows(rows) {
  const groupsByOffset = new Map();

  rows.forEach((row) => {
    if (!groupsByOffset.has(row.offset)) {
      groupsByOffset.set(row.offset, []);
    }

    groupsByOffset.get(row.offset).push(row);
  });

  return Array.from(groupsByOffset.entries())
    .map(([offset, offsetRows]) => {
      const centres = offsetRows.map((row) => row.computedCentre);
      return {
        count: offsetRows.length,
        maxCentre: Math.max(...centres),
        meanCentre: centres.reduce((sum, value) => sum + value, 0) / centres.length,
        minCentre: Math.min(...centres),
        offset,
      };
    })
    .sort((left, right) => left.offset - right.offset);
}

function getCentreOffsetFit(rows) {
  return getLinearFit(rows.map((row) => ({
    plot: {
      x: row.offset,
      y: row.meanCentre,
    },
  })));
}

function getEmpiricalModel(fitRows) {
  const multiplierRows = getMultiplierModelRows(fitRows);
  const centreRows = getCentreModelRows(fitRows);
  const centreAverageRows = getCentreAverageRows(centreRows);

  return {
    centreFit: getCentreOffsetFit(centreAverageRows),
    centreRows,
    multiplierFit: getMultiplierModelFit(multiplierRows),
    multiplierRows,
  };
}

function getForwardPrediction(sample, empiricalModel) {
  const gain = sample.wipers?.gain;
  const offset = sample.wipers?.offset;
  const sensor1 = sample.sensorActual?.sensor1;
  const multiplier = getMultiplierPrediction(gain, empiricalModel.multiplierFit);
  const centre = getCentrePrediction(offset, empiricalModel.centreFit);

  if (!Number.isFinite(multiplier) || !Number.isFinite(centre) || !Number.isFinite(sensor1)) {
    return null;
  }

  return {
    centre,
    multiplier,
    sensor2: centre - multiplier * (sensor1 - centre),
  };
}

function getForwardModelRows(samples, empiricalModel) {
  return getForwardModelSamples(samples)
    .map((sample) => {
      const prediction = getForwardPrediction(sample, empiricalModel);

      if (!prediction) {
        return null;
      }

      const measuredSensor2 = sample.sensorActual.sensor2;
      const error = prediction.sensor2 - measuredSensor2;

      return {
        centre: prediction.centre,
        error,
        gain: sample.wipers.gain,
        measuredSensor1: sample.sensorActual.sensor1,
        measuredSensor2,
        multiplier: prediction.multiplier,
        offset: sample.wipers.offset,
        predictedSensor2: prediction.sensor2,
        sample,
      };
    })
    .filter(Boolean);
}

function getForwardModelBlocks(rows) {
  const groupsByKey = new Map();

  rows.forEach((row) => {
    const key = `${row.gain}|${row.offset}`;

    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, []);
    }

    groupsByKey.get(key).push(row);
  });

  return Array.from(groupsByKey.values())
    .map((blockRows) => {
      const errors = blockRows.map((row) => row.error);
      const absoluteErrors = errors.map(Math.abs);
      const firstRow = blockRows[0];

      return {
        centre: getMean(blockRows.map((row) => row.centre)),
        gain: firstRow.gain,
        maxAbsError: Math.max(...absoluteErrors),
        meanError: getMean(errors),
        multiplier: getMean(blockRows.map((row) => row.multiplier)),
        offset: firstRow.offset,
        rms: getRms(errors),
        samples: blockRows.length,
      };
    })
    .sort((left, right) => left.gain - right.gain || left.offset - right.offset);
}

function getInversePrediction(sample, empiricalModel) {
  const gain = sample.wipers?.gain;
  const offset = sample.wipers?.offset;
  const sensor2 = sample.sensorActual?.sensor2;
  const multiplier = getMultiplierPrediction(gain, empiricalModel.multiplierFit);
  const centre = getCentrePrediction(offset, empiricalModel.centreFit);

  if (!Number.isFinite(multiplier)
    || Math.abs(multiplier) < 1e-9
    || !Number.isFinite(centre)
    || !Number.isFinite(sensor2)) {
    return null;
  }

  return {
    centre,
    multiplier,
    sensor1: centre + (centre - sensor2) / multiplier,
  };
}

function getInverseModelRows(samples, empiricalModel) {
  return getForwardModelSamples(samples)
    .map((sample) => {
      const prediction = getInversePrediction(sample, empiricalModel);

      if (!prediction) {
        return null;
      }

      const measuredSensor1 = sample.sensorActual.sensor1;
      const error = prediction.sensor1 - measuredSensor1;

      return {
        centre: prediction.centre,
        error,
        estimatedSensor1: prediction.sensor1,
        gain: sample.wipers.gain,
        measuredSensor1,
        measuredSensor2: sample.sensorActual.sensor2,
        multiplier: prediction.multiplier,
        offset: sample.wipers.offset,
        sample,
      };
    })
    .filter(Boolean);
}

function getRowsByNumber(rows, key) {
  const groupsByValue = new Map();

  rows.forEach((row) => {
    const value = row[key];

    if (!Number.isFinite(value)) {
      return;
    }

    if (!groupsByValue.has(value)) {
      groupsByValue.set(value, []);
    }

    groupsByValue.get(value).push(row);
  });

  return Array.from(groupsByValue.entries())
    .sort((left, right) => left[0] - right[0]);
}

function getPaddedRangeFromValues(values, fallback) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return fallback;
  }

  const min = Math.min(...knownValues);
  const max = Math.max(...knownValues);
  const padding = Math.max((max - min) * 0.08, 0.025);

  return [min - padding, max + padding];
}

function getInverseValidationAxisRanges(rows) {
  return {
    x: getPaddedRangeFromValues(rows.map((row) => row.measuredSensor1), [0, 1]),
    y: getPaddedRangeFromValues([
      0,
      ...rows.map((row) => row.error),
    ], [-0.025, 0.025]),
  };
}

function getMultiplierOffsetLineTraces(rows, fit) {
  if (!Number.isFinite(fit.slope)) {
    return [];
  }

  const gainRange = getValueRange(rows.map((row) => row.gain));

  if (!gainRange) {
    return [];
  }

  const rowsByOffset = new Map();

  rows.forEach((row) => {
    if (!Number.isFinite(row.offset)) {
      return;
    }

    if (!rowsByOffset.has(row.offset)) {
      rowsByOffset.set(row.offset, []);
    }

    rowsByOffset.get(row.offset).push(row);
  });

  const offsetGroups = Array.from(rowsByOffset.entries())
    .sort((left, right) => left[0] - right[0]);

  return offsetGroups.map(([offset, offsetRows], index) => {
    const intercept = getMean(
      offsetRows.map((row) => row.computedMultiplier - fit.slope * row.gain),
    );
    const color = getRainbowColor(index, offsetGroups.length, 0.72);

    return {
      hovertemplate: [
        "gain %{x:.2f}",
        "offset trend %{y:.4f}",
        `<extra>offset ${formatWiper(offset)}</extra>`,
      ].join("<br>"),
      line: { color, width: 1.7 },
      mode: "lines",
      name: `offset ${formatWiper(offset)} trend`,
      type: "scatter",
      x: gainRange,
      y: gainRange.map((gain) => intercept + fit.slope * gain),
    };
  });
}

function getCentreGainLineTraces(rows, fit) {
  if (!Number.isFinite(fit.slope)) {
    return [];
  }

  const offsetRange = getValueRange(rows.map((row) => row.offset));

  if (!offsetRange) {
    return [];
  }

  const rowsByGain = new Map();

  rows.forEach((row) => {
    if (!Number.isFinite(row.gain)) {
      return;
    }

    if (!rowsByGain.has(row.gain)) {
      rowsByGain.set(row.gain, []);
    }

    rowsByGain.get(row.gain).push(row);
  });

  const gainGroups = Array.from(rowsByGain.entries())
    .sort((left, right) => left[0] - right[0]);

  return gainGroups.map(([gain, gainRows], index) => {
    const intercept = getMean(
      gainRows.map((row) => row.computedCentre - fit.slope * row.offset),
    );
    const color = getRainbowColor(index, gainGroups.length, 0.70);

    return {
      hovertemplate: [
        "offset %{x:.0f}",
        "gain trend %{y:.4f} V",
        `<extra>gain ${formatWiper(gain)}</extra>`,
      ].join("<br>"),
      line: { color, width: 1.6 },
      mode: "lines",
      name: `gain ${formatWiper(gain)} centre trend`,
      type: "scatter",
      x: offsetRange,
      y: offsetRange.map((offset) => intercept + fit.slope * offset),
    };
  });
}

function getMultiplierPrediction(gain, fit) {
  return Number.isFinite(fit.intercept) && Number.isFinite(fit.slope)
    ? fit.intercept + fit.slope * gain
    : null;
}

function getMultiplierResidual(row, fit) {
  const predicted = getMultiplierPrediction(row.gain, fit);

  return Number.isFinite(predicted)
    ? row.computedMultiplier - predicted
    : null;
}

function getCentrePrediction(offset, fit) {
  return Number.isFinite(fit.intercept) && Number.isFinite(fit.slope)
    ? fit.intercept + fit.slope * offset
    : null;
}

function getCentreResidual(row, fit) {
  const predicted = getCentrePrediction(row.offset, fit);

  return Number.isFinite(predicted)
    ? row.computedCentre - predicted
    : null;
}

function getRms(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return Math.sqrt(
    knownValues.reduce((sum, value) => sum + value ** 2, 0) / knownValues.length,
  );
}

function formatSignedNumber(value, fractionDigits = 3) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(fractionDigits)}`;
}

function formatVoltage(value, fractionDigits = 4) {
  return Number.isFinite(value) ? `${value.toFixed(fractionDigits)} V` : "-";
}

function formatFormulaNumber(value, fractionDigits = 6) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

function formatSignedMillivolts(value, fractionDigits = 3) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : "-"}${Math.abs(value * 1000).toFixed(fractionDigits)} mV`;
}

function getFormulaeHtml(lines) {
  return [
    "<span class=\"analysis-stage-formulae__title\">Math formulae</span>",
    ...lines.map((line) => `<code>${line}</code>`),
  ].join("");
}

function getEmpiricalModelFormulae(empiricalModel, lines) {
  const multiplierLine = Number.isFinite(empiricalModel.multiplierFit.intercept)
    && Number.isFinite(empiricalModel.multiplierFit.slope)
    ? `multiplier = ${formatFormulaNumber(empiricalModel.multiplierFit.intercept)} ${formatSignedNumber(empiricalModel.multiplierFit.slope, 6)} * gain`
    : "multiplier = A + B * gain";
  const centreLine = Number.isFinite(empiricalModel.centreFit.intercept)
    && Number.isFinite(empiricalModel.centreFit.slope)
    ? `centre = ${formatFormulaNumber(empiricalModel.centreFit.intercept)} ${formatSignedNumber(empiricalModel.centreFit.slope, 6)} * offset`
    : "centre = C + D * offset";

  return getFormulaeHtml([
    multiplierLine,
    centreLine,
    ...lines,
  ]);
}

function getMean(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length;
}

function getValueRange(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return [Math.min(...knownValues), Math.max(...knownValues)];
}

export class DifferentialAmp {
  constructor() {
    this.cachedFitLines = null;
    this.cachedFitRows = null;
    this.cachedStages = new Map();
  }

  getStages() {
    return [
      {
        id: "samples",
        label: "1: Linear reduction",
        defaultDetail: "raw rows",
        isPrimary: true,
        title: "Reduced block centre vs multiplier",
      },
      {
        id: "fits",
        label: "2: Fit Multiplier",
        defaultDetail: "config rows",
        title: "Multiplier fit from gain",
      },
      {
        id: "gain",
        label: "3: Fit Centre",
        defaultDetail: "awaiting fits",
        title: "Centre fit from offset",
      },
      {
        id: "offset",
        label: "4: Forward Model",
        defaultDetail: "awaiting model",
        title: "Forward model Sensor2 error by gain and offset",
      },
      {
        id: "inverse",
        label: "5: Invert & Validate",
        defaultDetail: "awaiting model",
        title: "Inverse model Sensor1 residuals",
      },
    ];
  }

  clearCache() {
    this.cachedFitLines = null;
    this.cachedFitRows = null;
    this.cachedStages.clear();
  }

  getAnalysis(
    stageId,
    plottableSamples,
    unlockedStages,
    completedStages = new Set(),
    { includeFitLines = true } = {},
  ) {
    const summaryStageIds = new Set(completedStages);

    if (stageId) {
      summaryStageIds.add(stageId);
    }

    const needsFitRows = summaryStageIds.size > 0 || unlockedStages.has("fits");
    const fitRows = needsFitRows ? this.getCachedFitRows(plottableSamples) : [];
    const fitLines = includeFitLines
      ? this.getCachedFitLines(plottableSamples)
      : [];
    const stages = this.getStageSummaries(fitRows, summaryStageIds, plottableSamples);

    return {
      fitLines,
      fitRows,
      stage: stageId ? stages.get(stageId) ?? null : null,
      stages,
    };
  }

  getModel(samples) {
    const plottableSamples = (samples ?? []).filter((sample) => sample?.isPlottable !== false);
    const fitRows = this.getCachedFitRows(plottableSamples);
    const empiricalModel = getEmpiricalModel(fitRows);
    const multiplier = {
      intercept: empiricalModel.multiplierFit.intercept,
      slope: empiricalModel.multiplierFit.slope,
    };
    const centre = {
      intercept: empiricalModel.centreFit.intercept,
      slope: empiricalModel.centreFit.slope,
    };
    const ready = Number.isFinite(multiplier.intercept)
      && Number.isFinite(multiplier.slope)
      && Number.isFinite(centre.intercept)
      && Number.isFinite(centre.slope);
    const inverseRows = ready ? getInverseModelRows(plottableSamples, empiricalModel) : [];
    const axisRanges = getInverseValidationAxisRanges(inverseRows);
    const formulae = getEmpiricalModelFormulae(empiricalModel, [
      "sensor1_est = centre + (centre - sensor2) / multiplier",
      "error = sensor1_est - sensor1",
    ]);
    const id = [
      multiplier.intercept,
      multiplier.slope,
      centre.intercept,
      centre.slope,
      ...axisRanges.x,
      ...axisRanges.y,
    ].map((value) => (Number.isFinite(value) ? value.toFixed(12) : "-")).join("|");

    return {
      axisRanges,
      centre,
      formulae,
      id,
      multiplier,
      ready,
    };
  }

  getFormulae(samples) {
    return this.getModel(samples).formulae;
  }

  getStageSummaries(fitRows, unlockedStages, samples) {
    return new Map(
      this.getStages()
        .filter((stage) => unlockedStages.has(stage.id))
        .map((stage) => [stage.id, this.getCachedStage(stage.id, fitRows, samples)]),
    );
  }

  getCachedStage(stageId, fitRows, samples) {
    if (!this.cachedStages.has(stageId)) {
      const stage = this.getStages().find((candidate) => candidate.id === stageId);
      const stageData = this.getStage(stageId, fitRows, samples);

      this.cachedStages.set(stageId, stageData
        ? { title: stage?.title ?? stage?.label ?? "", ...stageData }
        : stageData);
    }

    return this.cachedStages.get(stageId);
  }

  getStage(stageId, fitRows, samples) {
    switch (stageId) {
      case "samples":
        return this.getInputSamplesStage(fitRows);
      case "fits":
        return this.getLineFitsStage(fitRows);
      case "gain":
        return this.getGainTermStage(fitRows);
      case "offset":
        return this.getOffsetTermStage(fitRows, samples);
      case "inverse":
        return this.getInverseValidationStage(fitRows, samples);
      default:
        return null;
    }
  }

  getCachedFitRows(samples) {
    if (!samples.length) {
      return this.cachedFitRows ?? [];
    }

    this.cachedFitRows ??= this.getAnalysisFitRows(samples);

    return this.cachedFitRows;
  }

  getCachedFitLines(samples) {
    if (!samples.length) {
      return this.cachedFitLines ?? [];
    }

    this.cachedFitLines ??= this.getSweepFitLines(samples);

    return this.cachedFitLines;
  }

  // --- Stage specific implementations ---

  getInputSamplesStage(fitRows) {
    if (!fitRows || fitRows.length === 0) {
      return {
        description: `
          <p><strong>1: Linear Reduction</strong></p>
          <p>Load a calibration CSV or run Test1 to reduce each Gain & Offset block into a fitted multiplier and centre voltage.</p>
        `,
        detail: "No fits available",
        formulae: getFormulaeHtml([
          "sensor2 = m * sensor1 + b",
          "multiplier = -m",
          "centre = b / (1 - m)",
        ]),
        traces: [],
        value: "0",
        xTitle: "Effective Multiplier",
        yTitle: "Centre (V)",
      };
    }

    const validRows = getReducedRows(fitRows);
    const modelRows = getModelRows(fitRows);

    const traces = [
      {
        customdata: validRows.map((row) => [
          row.name,
          formatWiper(row.gain),
          formatWiper(row.offset),
          formatMillivolts(row.rms),
          row.samples,
        ]),
        hovertemplate: [
          "Multiplier %{x:.4f}",
          "Centre %{y:.4f} V",
          "RMS %{customdata[3]}",
          "samples %{customdata[4]}",
          "gain %{customdata[1]}",
          "offset %{customdata[2]}",
          "%{customdata[0]}",
          "<extra></extra>",
        ].join("<br>"),
        marker: getStageMarker(validRows.map((row) => row.rms), "RMS", 7, HEAT_COLORSCALE),
        mode: "markers",
        name: "reduced blocks",
        type: "scatter",
        x: validRows.map((row) => row.computedMultiplier),
        y: validRows.map((row) => row.computedCentre),
      },
      getCentreFitTrace(validRows, {
        color: "rgba(255, 123, 114, 0.78)",
        dash: "dot",
        name: "all gains fit",
      }),
      getCentreFitTrace(modelRows, {
        color: "rgba(126, 231, 135, 0.90)",
        name: `gain ${MIN_MODEL_GAIN}+ fit`,
      }),
    ].filter(Boolean);

    const avgMultiplier = modelRows.length
      ? modelRows.reduce((sum, row) => sum + row.computedMultiplier, 0) / modelRows.length
      : null;

    return {
      description: `
        <p><strong>1: Linear Reduction</strong></p>
        <p>Reduces thousands of raw sensor samples into a single multiplier and centre voltage for each fixed Gain & Offset block.</p>
        <ul>
          <li><strong>Multiplier:</strong> derived from the negative slope (-m) of Sensor2 vs Sensor1.</li>
          <li><strong>Centre:</strong> derived from the intercept where Sensor1 equals Sensor2.</li>
        </ul>
        <p>The red dotted trend includes every reduced block. The green trend excludes gains 0 and 1, matching the rows used by later model stages.</p>
      `,
      detail: `${modelRows.length}/${validRows.length} model rows`,
      formulae: getFormulaeHtml([
        "sensor2 = m * sensor1 + b",
        "multiplier = -m",
        "centre = b / (1 - m)",
      ]),
      traces,
      value: avgMultiplier !== null ? formatMultiplier(avgMultiplier) : "0",
      xTitle: "Effective Multiplier",
      yTitle: "Centre (V)",
    };
  }

  getLineFitsStage(fitRows) {
    const validRows = getMultiplierModelRows(fitRows);

    if (validRows.length < 2) {
      return {
        description: `
          <p><strong>2: Fit Multiplier from Gain</strong></p>
          <p>Run the first stage to reduce the raw samples into Gain & Offset blocks, then this stage fits multiplier from raw gain.</p>
        `,
        detail: fitRows.length ? "need two gain rows" : "awaiting stage 1",
        formulae: getFormulaeHtml([
          "multiplier = A + B * gain",
        ]),
        traces: [],
        value: "-",
        xTitle: "Gain Wiper",
        yTitle: "Effective Multiplier",
      };
    }

    const fit = getMultiplierModelFit(validRows);
    const residuals = validRows.map((row) => getMultiplierResidual(row, fit));
    const averageRows = getMultiplierAverageRows(validRows);
    const baseText = formatMultiplier(fit.intercept);
    const gainTermText = formatSignedNumber(fit.slope, 3);
    const rmsText = formatMultiplier(fit.rms);
    const offsetLineTraces = getMultiplierOffsetLineTraces(validRows, fit);

    return {
      description: `
        <p><strong>2: Fit Multiplier from Gain</strong></p>
        <p>Fits the reduced stage-1 blocks to effectiveMultiplier = A + B * gain, using raw gain values 2 and above.</p>
        <ul>
          <li><strong>A:</strong> ${baseText} fixed/background multiplier.</li>
          <li><strong>B:</strong> ${gainTermText} multiplier per raw gain step.</li>
          <li><strong>RMS:</strong> ${rmsText} remaining multiplier error after the fit.</li>
        </ul>
        <p>The offset-coloured trend lines all use the same fitted gain slope. They are vertically shifted only to show how each offset set sits around the shared model.</p>
      `,
      detail: Number.isFinite(fit.rms)
        ? `A ${baseText}, RMS ${rmsText}`
        : `${validRows.length} fit rows`,
      formulae: getFormulaeHtml([
        `multiplier = ${formatFormulaNumber(fit.intercept)} ${formatSignedNumber(fit.slope, 6)} * gain`,
      ]),
      traces: [
        ...offsetLineTraces,
        {
          customdata: validRows.map((row, index) => [
            row.name,
            formatWiper(row.offset),
            formatMultiplier(getMultiplierPrediction(row.gain, fit)),
            formatSignedNumber(residuals[index], 4),
            row.samples,
          ]),
          hovertemplate: [
            "gain %{x:.0f}",
            "multiplier %{y:.4f}",
            "fit %{customdata[2]}",
            "residual %{customdata[3]}",
            "offset %{customdata[1]}",
            "samples %{customdata[4]}",
            "%{customdata[0]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            ...getStageMarker(validRows.map((row) => row.offset), "Offset", 7),
          },
          mode: "markers",
          name: "offset blocks",
          type: "scatter",
          x: validRows.map((row) => row.gain),
          y: validRows.map((row) => row.computedMultiplier),
        },
        {
          customdata: averageRows.map((row) => [
            row.count,
            formatMultiplier(row.minMultiplier),
            formatMultiplier(row.maxMultiplier),
          ]),
          hovertemplate: [
            "gain %{x:.0f}",
            "mean multiplier %{y:.4f}",
            "offset blocks %{customdata[0]}",
            "range %{customdata[1]} to %{customdata[2]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            color: "#ffffff",
            line: { color: "#08141c", width: 1.5 },
            opacity: 0.96,
            size: 9,
            symbol: "diamond",
          },
          mode: "markers",
          name: "gain means",
          type: "scatter",
          x: averageRows.map((row) => row.gain),
          y: averageRows.map((row) => row.meanMultiplier),
        },
      ].filter(Boolean),
      value: Number.isFinite(fit.slope) ? `${gainTermText}/gain` : "-",
      xTitle: "Gain Wiper",
      yTitle: "Effective Multiplier",
    };
  }

  getGainTermStage(fitRows) {
    const modelRows = getCentreModelRows(fitRows);

    if (modelRows.length < 2) {
      return {
        description: `
          <p><strong>3: Fit Centre from Offset</strong></p>
          <p>Run the first stage to reduce the raw samples into Gain & Offset blocks, then this stage fits centre from raw offset.</p>
        `,
        detail: modelRows.length ? "need two offset rows" : "awaiting stage 1",
        formulae: getFormulaeHtml([
          "centre = C + D * offset",
        ]),
        traces: [],
        value: "-",
        xTitle: "Offset Wiper",
        yTitle: "Centre (V)",
      };
    }

    const averageRows = getCentreAverageRows(modelRows);
    const fit = getCentreOffsetFit(averageRows);
    const residuals = modelRows.map((row) => getCentreResidual(row, fit));
    const gainLineTraces = getCentreGainLineTraces(modelRows, fit);
    const spanVolts = Number.isFinite(fit.slope) ? fit.slope * 255 : null;
    const baseText = formatVoltage(fit.intercept);
    const offsetTermText = `${formatSignedMillivolts(fit.slope)}/step`;
    const spanText = formatMillivolts(spanVolts);
    const fitLineX = Number.isFinite(fit.intercept) && Number.isFinite(fit.slope)
      ? [0, Math.max(...averageRows.map((row) => row.offset))]
      : [];
    const fitLineTrace = fitLineX.length
      ? {
        hovertemplate: [
          "offset %{x:.0f}",
          "fit centre %{y:.4f} V",
          "<extra>centre fit</extra>",
        ].join("<br>"),
        line: { color: "#ffcf5a", width: 2.8 },
        mode: "lines",
        name: "centre fit",
        type: "scatter",
        x: fitLineX,
        y: fitLineX.map((offset) => getCentrePrediction(offset, fit)),
      }
      : null;

    return {
      description: `
        <p><strong>3: Fit Centre from Offset</strong></p>
        <p>Fits the stage-1 centre points to centre = A + B * offset, using gain ${MIN_MODEL_GAIN}+ rows.</p>
        <ul>
          <li><strong>A:</strong> ${baseText} centre at offset 0.</li>
          <li><strong>B:</strong> ${offsetTermText} centre movement per raw offset step.</li>
          <li><strong>Span:</strong> ${spanText} movement across the full 0-255 offset range.</li>
        </ul>
        <p>The gain-coloured trend lines share the fitted offset slope. Separation between them shows any remaining gain/offset interaction.</p>
      `,
      detail: Number.isFinite(fit.intercept)
        ? `A ${baseText}, ${offsetTermText}`
        : `${modelRows.length} model rows`,
      formulae: getFormulaeHtml([
        `centre = ${formatFormulaNumber(fit.intercept)} ${formatSignedNumber(fit.slope, 6)} * offset`,
      ]),
      traces: [
        ...gainLineTraces,
        {
          customdata: modelRows.map((row, index) => [
            row.name,
            formatWiper(row.gain),
            formatVoltage(getCentrePrediction(row.offset, fit)),
            formatSignedMillivolts(residuals[index], 4),
            row.samples,
          ]),
          hovertemplate: [
            "offset %{x:.0f}",
            "centre %{y:.4f} V",
            "fit %{customdata[2]}",
            "residual %{customdata[3]}",
            "gain %{customdata[1]}",
            "samples %{customdata[4]}",
            "%{customdata[0]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: getStageMarker(residuals, "Residual", 7, HEAT_COLORSCALE),
          mode: "markers",
          name: "centre blocks",
          type: "scatter",
          x: modelRows.map((row) => row.offset),
          y: modelRows.map((row) => row.computedCentre),
        },
        {
          customdata: averageRows.map((row) => [
            row.count,
            formatVoltage(row.minCentre),
            formatVoltage(row.maxCentre),
          ]),
          hovertemplate: [
            "offset %{x:.0f}",
            "mean centre %{y:.4f} V",
            "gain blocks %{customdata[0]}",
            "range %{customdata[1]} to %{customdata[2]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            color: "#ffffff",
            line: { color: "#08141c", width: 1.5 },
            opacity: 0.96,
            size: 9,
            symbol: "diamond",
          },
          mode: "markers",
          name: "offset means",
          type: "scatter",
          x: averageRows.map((row) => row.offset),
          y: averageRows.map((row) => row.meanCentre),
        },
        fitLineTrace,
      ].filter(Boolean),
      value: Number.isFinite(spanVolts) ? spanText : "-",
      xTitle: "Offset Wiper",
      yTitle: "Centre (V)",
    };
  }

  getOffsetTermStage(fitRows, samples) {
    const empiricalModel = getEmpiricalModel(fitRows);
    const modelRows = getForwardModelRows(samples, empiricalModel);

    if (modelRows.length < 2) {
      return {
        description: `
          <p><strong>4: Forward Model</strong></p>
          <p>Run the previous stages to fit multiplier and centre, then this stage combines them to predict Sensor2 from Sensor1.</p>
        `,
        detail: modelRows.length ? "need validation rows" : "awaiting model",
        formulae: getEmpiricalModelFormulae(empiricalModel, [
          "sensor2_est = centre - multiplier * (sensor1 - centre)",
          "error = sensor2_est - sensor2",
        ]),
        traces: [],
        value: "-",
        xTitle: "Gain Wiper",
        yTitle: "Offset Wiper",
      };
    }

    const blocks = getForwardModelBlocks(modelRows);
    const errors = modelRows.map((row) => row.error);
    const rmse = getRms(errors);
    const meanError = getMean(errors);
    const maxAbsError = Math.max(...errors.map((error) => Math.abs(error)));
    const multiplierBaseText = formatMultiplier(empiricalModel.multiplierFit.intercept);
    const multiplierGainText = formatSignedNumber(empiricalModel.multiplierFit.slope, 3);
    const centreBaseText = formatVoltage(empiricalModel.centreFit.intercept);
    const centreOffsetText = `${formatSignedMillivolts(empiricalModel.centreFit.slope)}/step`;

    return {
      description: `
        <p><strong>4: Forward Model</strong></p>
        <p>Combines the fitted multiplier and centre relationships to predict Sensor2 from Sensor1.</p>
        <ul>
          <li><strong>Multiplier:</strong> ${multiplierBaseText} ${multiplierGainText} * gain.</li>
          <li><strong>Centre:</strong> ${centreBaseText} ${centreOffsetText}.</li>
          <li><strong>Error:</strong> predicted Sensor2 minus measured Sensor2.</li>
        </ul>
        <p>The map is grouped by gain and offset. Bright blocks show configurations where the combined model is least consistent.</p>
      `,
      detail: `mean ${formatSignedMillivolts(meanError)}, worst ${formatMillivolts(maxAbsError)}`,
      formulae: getEmpiricalModelFormulae(empiricalModel, [
        "sensor2_est = centre - multiplier * (sensor1 - centre)",
        "error = sensor2_est - sensor2",
      ]),
      traces: [
        {
          customdata: blocks.map((block) => [
            formatMillivolts(block.rms),
            formatSignedMillivolts(block.meanError),
            formatMillivolts(block.maxAbsError),
            formatMultiplier(block.multiplier),
            formatVoltage(block.centre),
            block.samples,
          ]),
          hovertemplate: [
            "gain %{x:.0f}",
            "offset %{y:.0f}",
            "RMS %{customdata[0]}",
            "mean error %{customdata[1]}",
            "worst error %{customdata[2]}",
            "multiplier %{customdata[3]}",
            "centre %{customdata[4]}",
            "samples %{customdata[5]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            ...getStageMarker(blocks.map((block) => block.rms), "RMS", 10, HEAT_COLORSCALE),
            symbol: "square",
          },
          mode: "markers",
          name: "forward model blocks",
          type: "scatter",
          x: blocks.map((block) => block.gain),
          y: blocks.map((block) => block.offset),
        },
      ],
      value: formatMillivolts(rmse),
      xTitle: "Gain Wiper",
      yTitle: "Offset Wiper",
    };
  }

  getInverseValidationStage(fitRows, samples) {
    const empiricalModel = getEmpiricalModel(fitRows);
    const modelRows = getInverseModelRows(samples, empiricalModel);

    if (modelRows.length < 2) {
      return {
        description: `
          <p><strong>5: Invert & Validate</strong></p>
          <p>Run the previous stages to fit multiplier and centre, then this stage inverts the model to estimate Sensor1 from Sensor2.</p>
        `,
        detail: modelRows.length ? "need validation rows" : "awaiting model",
        formulae: getEmpiricalModelFormulae(empiricalModel, [
          "sensor1_est = centre + (centre - sensor2) / multiplier",
          "error = sensor1_est - sensor1",
        ]),
        traces: [],
        value: "-",
        xTitle: "Measured Sensor1 (V)",
        yTitle: "Sensor1 Error (V)",
      };
    }

    const errors = modelRows.map((row) => row.error);
    const absoluteErrors = errors.map(Math.abs);
    const axisRanges = getInverseValidationAxisRanges(modelRows);
    const rmse = getRms(errors);
    const meanError = getMean(errors);
    const meanAbsoluteError = getMean(absoluteErrors);
    const minError = Math.min(...errors);
    const maxError = Math.max(...errors);
    const maxAbsError = Math.max(...absoluteErrors);
    const rowsByGain = getRowsByNumber(modelRows, "gain");
    const sensor1Range = getValueRange(modelRows.map((row) => row.measuredSensor1));
    const zeroTrace = sensor1Range
      ? {
        hoverinfo: "skip",
        line: { color: "rgba(255, 255, 255, 0.44)", dash: "dot", width: 1.4 },
        mode: "lines",
        name: "zero error",
        showlegend: false,
        type: "scatter",
        x: sensor1Range,
        y: [0, 0],
      }
      : null;

    return {
      description: `
        <p><strong>5: Invert & Validate</strong></p>
        <p>Inverts the combined model to estimate Sensor1 from measured Sensor2, then plots the residual error against measured Sensor1.</p>
        <ul>
          <li><strong>RMSE:</strong> ${formatMillivolts(rmse)} overall Sensor1 estimate error.</li>
          <li><strong>MAE:</strong> ${formatMillivolts(meanAbsoluteError)} mean absolute error.</li>
          <li><strong>Range:</strong> ${formatSignedMillivolts(minError)} to ${formatSignedMillivolts(maxError)}.</li>
        </ul>
        <p>A flat cloud around zero suggests the simple inverse model is good enough. Curves or sloped bands suggest a remaining gain, offset, or sensor-range correction.</p>
      `,
      detail: `MAE ${formatMillivolts(meanAbsoluteError)}, worst ${formatMillivolts(maxAbsError)}`,
      formulae: getEmpiricalModelFormulae(empiricalModel, [
        "sensor1_est = centre + (centre - sensor2) / multiplier",
        "error = sensor1_est - sensor1",
      ]),
      showLegend: true,
      traces: [
        zeroTrace,
        ...rowsByGain.map(([gain, gainRows], index) => ({
          customdata: gainRows.map((row) => [
            formatWiper(row.offset),
            formatVoltage(row.estimatedSensor1),
            formatSignedMillivolts(row.error),
            formatVoltage(row.measuredSensor2),
            formatMultiplier(row.multiplier),
            formatVoltage(row.centre),
          ]),
          hovertemplate: [
            "measured Sensor1 %{x:.4f} V",
            "Sensor1 error %{y:.4f} V",
            "error %{customdata[2]}",
            "estimated Sensor1 %{customdata[1]}",
            "measured Sensor2 %{customdata[3]}",
            "gain " + formatWiper(gain),
            "offset %{customdata[0]}",
            "multiplier %{customdata[4]}",
            "centre %{customdata[5]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            color: getRainbowColor(index, rowsByGain.length, 0.88),
            line: { color: "rgba(255, 255, 255, 0.62)", width: 0.6 },
            opacity: 0.82,
            size: 4.8,
          },
          mode: "markers",
          name: `gain ${formatWiper(gain)}`,
          type: "scatter",
          x: gainRows.map((row) => row.measuredSensor1),
          y: gainRows.map((row) => row.error),
        })),
      ].filter(Boolean),
      value: formatMillivolts(rmse),
      xRange: axisRanges.x,
      xTitle: "Measured Sensor1 (V)",
      yRange: axisRanges.y,
      yTitle: "Sensor1 Error (V)",
    };
  }

  // --- Modelling Logic ---

  getSweepFitLines(samples) {
    return this.getSweepFitGroups(samples)
      .map((group, index) => ({
        ...getLinearFit(group.samples),
        color: FIT_LINE_COLORS[index % FIT_LINE_COLORS.length],
        gain: group.samples.find((sample) => Number.isFinite(sample.wipers?.gain))?.wipers.gain ?? null,
        name: group.name,
      }))
      .filter((fitLine) => fitLine.lineX.length && fitLine.lineY.length);
  }

  getAnalysisFitRows(samples) {
    return this.getAnalysisFitGroups(samples)
      .map((group) => {
        const fit = getSensorComparisonFit(group.samples);
        const firstSample = group.samples[0];
        const mids = group.samples
          .map((sample) => Number(sample.wipers.mid))
          .filter(Number.isFinite);
        const m = fit.slope;
        const b = fit.intercept;
        const effectiveMultiplier = Number.isFinite(m) ? -m : null;
        const centre = (Number.isFinite(m) && m !== 1) ? b / (1 - m) : null;

        return {
          bot: firstSample?.wipers.bot,
          computedCentre: centre,
          computedMultiplier: effectiveMultiplier,
          diffAmpEffectiveMultiplier: firstSample?.diffAmpEffectiveMultiplier,
          gain: firstSample?.wipers.gain,
          intercept: fit.intercept,
          ledLabel: firstSample?.ledLabel ?? "",
          ledState: firstSample?.ledState,
          maxMid: mids.length ? Math.max(...mids) : null,
          minMid: mids.length ? Math.min(...mids) : null,
          name: group.name,
          offset: firstSample?.wipers.offset,
          rms: fit.rms,
          samples: group.samples.length,
          slope: fit.slope,
          source: firstSample?.source ?? "",
          top: firstSample?.wipers.top,
        };
      })
      .filter((row) => Number.isFinite(row.slope) && Number.isFinite(row.intercept));
  }

  getAnalysisFitGroups(samples) {
    const groupsByKey = new Map();

    samples.forEach((sample) => {
      const group = this.getAnalysisFitGroup(sample);

      if (!group) {
        return;
      }

      if (!groupsByKey.has(group.key)) {
        groupsByKey.set(group.key, { ...group, samples: [] });
      }

      groupsByKey.get(group.key).samples.push(sample);
    });

    return Array.from(groupsByKey.values())
      .filter((group) => group.samples.length >= 2);
  }

  getAnalysisFitGroup(sample) {
    const { wipers } = sample;

    if (sample.plot?.kind !== "sensor-comparison"
      || !Number.isFinite(wipers?.gain)
      || !Number.isFinite(wipers?.offset)) {
      return null;
    }

    return {
      key: this.getSweepFitKey([sample.source, wipers.gain, wipers.offset]),
      name: `${getSourceLabel(sample.source)} gain ${formatWiper(wipers.gain)} offset ${formatWiper(wipers.offset)} fit`,
    };
  }

  getSweepFitGroups(samples) {
    const groupsByKey = new Map();

    samples.forEach((sample) => {
      const group = this.getSweepFitGroup(sample);

      if (!group) {
        return;
      }

      if (!groupsByKey.has(group.key)) {
        groupsByKey.set(group.key, { ...group, samples: [] });
      }

      groupsByKey.get(group.key).samples.push(sample);
    });

    return Array.from(groupsByKey.values())
      .filter((group) => group.samples.length >= 2);
  }

  getSweepFitGroup(sample) {
    const { wipers } = sample;

    if (sample.source === "mid-sweep") {
      return {
        key: this.getSweepFitKey(["mid", wipers.top, wipers.bot, wipers.offset, wipers.gain]),
        name: `mid fit offset ${formatWiper(wipers.offset)} gain ${formatWiper(wipers.gain)}`,
      };
    }

    if (sample.source === "gain-mid-sweep") {
      return {
        key: this.getSweepFitKey([
          "gain-mid",
          wipers.top,
          wipers.bot,
          wipers.offset,
          wipers.gain,
        ]),
        name: `gain ${formatWiper(wipers.gain)} fit`,
      };
    }

    if (sample.source === "offset-sweep") {
      return {
        key: this.getSweepFitKey(["offset", wipers.top, wipers.bot, wipers.offset, wipers.gain]),
        name: `offset ${formatWiper(wipers.offset)} fit`,
      };
    }

    if (sample.source === "test1") {
      return {
        key: this.getSweepFitKey([
          "test1",
          wipers.top,
          wipers.bot,
          wipers.offset,
          wipers.gain,
          sample.ledLabel,
        ]),
        name: `Test1 ${sample.ledLabel ?? "off"} fit`,
      };
    }

    if (sample.source === "test2") {
      return {
        key: this.getSweepFitKey([
          "test2",
          wipers.top,
          wipers.bot,
          wipers.offset,
          wipers.gain,
        ]),
        name: "Test2 Sensor2 delta/count fit",
      };
    }

    if (sample.source === "test3") {
      return {
        key: this.getSweepFitKey([
          "test3",
          wipers.top,
          wipers.bot,
          wipers.mid,
          wipers.gain,
        ]),
        name: `Test3 mid ${formatWiper(wipers.mid)} Sensor2 offset delta/count fit`,
      };
    }

    if (sample.source === "test4") {
      return {
        key: this.getSweepFitKey([
          "test4",
          wipers.top,
          wipers.bot,
          wipers.offset,
          wipers.gain,
        ]),
        name: `Test4 gain ${formatWiper(wipers.gain)} Sensor2 mid delta/count fit`,
      };
    }

    return null;
  }

  getSweepFitKey(parts) {
    return parts.map((part) => String(part)).join("|");
  }

  getAnalysisCsv(samples) {
    const plottableSamples = samples.filter((sample) => sample.isPlottable);
    return [
      ANALYSIS_CSV_HEADER,
      ...this.getAnalysisFitRows(plottableSamples).map(this.formatAnalysisFitCsvRow),
    ].join("\n");
  }

  formatAnalysisFitCsvRow(row) {
    return [
      row.source,
      row.name,
      formatCsvNumber(row.slope, 12),
      formatCsvNumber(row.intercept, 12),
      formatCsvNumber(row.rms, 12),
      row.samples,
      formatCsvNumber(row.top, 0),
      formatCsvNumber(row.bot, 0),
      formatCsvNumber(row.offset, 0),
      formatCsvNumber(row.gain, 0),
      formatCsvNumber(row.diffAmpEffectiveMultiplier),
      formatCsvNumber(row.ledState, 0),
      row.ledLabel,
      formatCsvNumber(row.minMid, 0),
      formatCsvNumber(row.maxMid, 0),
    ].map(csvCell).join(",");
  }
}
