import { getLinearFit } from "../AnalysisMath.js";

const MID_STEP_STAGE_ONE_ID = "mid-step-blocks";
const MID_STEP_STAGE_TWO_ID = "sensor1-validation";
const MID_STEP_STAGE_THREE_ID = "measured-mid-response";
const MID_STEP_STAGE_FOUR_ID = "pivot-derivation";
const MID_STEP_STAGE_FIVE_ID = "finite-difference-prediction";
const MID_STEP_STAGE_SIX_ID = "residual-correction-map";
const RUN_COLORS = Object.freeze([
  "#ff9500",
  "#34c759",
  "#5bc0eb",
  "#af52de",
  "#ff2d55",
  "#ffcc00",
]);
const RUN_SYMBOLS = Object.freeze([
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "cross",
  "x",
]);
const GAIN_MARKER_COLORS = Object.freeze([
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
  "#ffffff",
  "#c6f6ff",
  "#d9d2ff",
  "#ffc7e7",
  "#ffffff",
]);
const STANDARD_GAIN_COLOR_DOMAIN = Object.freeze([0, 1, 2, 4, 8, 16, 24, 32, 48, 64]);
const EXTENDED_GAIN_COLOR_DOMAIN = Object.freeze([
  ...STANDARD_GAIN_COLOR_DOMAIN,
  96,
  128,
  192,
  255,
]);
export class MidStep {
  constructor() {
    this.cachedBlockRows = null;
    this.cachedStages = new Map();
  }

  getStages() {
    return [
      {
        id: MID_STEP_STAGE_ONE_ID,
        label: "1: Block reduction",
        defaultDetail: "run/gain blocks",
        isPrimary: true,
        title: "Reduced Sensor2 response by gain block",
      },
      {
        id: MID_STEP_STAGE_TWO_ID,
        label: "2: Sensor1 estimate",
        defaultDetail: "sensor1_est check",
        title: "Sensor1 estimate validation",
      },
      {
        id: MID_STEP_STAGE_THREE_ID,
        label: "3: Measured response",
        defaultDetail: "dS2/dMid target",
        title: "Measured Sensor2 response to mid step",
      },
      {
        id: MID_STEP_STAGE_FOUR_ID,
        label: "4: Pivot derivation",
        defaultDetail: "V0 / S0 pivot",
        title: "Mid-voltage pivot derivation",
      },
      {
        id: MID_STEP_STAGE_FIVE_ID,
        label: "5: State prediction",
        defaultDetail: "state-aware step",
        title: "State-aware mid-step prediction",
      },
      {
        id: MID_STEP_STAGE_SIX_ID,
        label: "6: Residual validation",
        defaultDetail: "mid/gain structure",
        title: "State-aware residual validation",
      },
    ];
  }

  clearCache() {
    this.cachedBlockRows = null;
    this.cachedStages.clear();
  }

  getAnalysis(stageId, plottableSamples, unlockedStages, completedStages = new Set()) {
    const summaryStageIds = new Set(completedStages);

    if (stageId) {
      summaryStageIds.add(stageId);
    }

    const blocks = summaryStageIds.size ? this.getCachedBlockRows(plottableSamples) : [];
    const stages = new Map(
      this.getStages()
        .filter((stage) => summaryStageIds.has(stage.id))
        .map((stage) => [stage.id, this.getCachedStage(stage.id, blocks, plottableSamples)]),
    );

    return {
      fitLines: [],
      fitRows: blocks,
      stage: stageId ? stages.get(stageId) ?? null : null,
      stages,
    };
  }

  getModel(samples) {
    const pivotModel = getPivotModel(samples);
    const rows = getStateAwarePredictionRows(samples, pivotModel);
    const residuals = rows.map((row) => row.residual);
    const residualRmse = getRms(residuals);
    const residualMean = getMean(residuals);
    const maxAbsResidual = residuals.length
      ? Math.max(...residuals.map((residual) => Math.abs(residual)))
      : null;
    const ready = rows.length > 0
      && Number.isFinite(pivotModel.midVoltage)
      && Number.isFinite(pivotModel.sensor1Estimate);
    const formulae = getMidStepFormulaeHtml({
      maxAbsResidual,
      pivotModel,
      residualMean,
      residualRmse,
    });
    const id = [
      pivotModel.midVoltage,
      pivotModel.sensor1Estimate,
      residualRmse,
      residualMean,
      maxAbsResidual,
    ].map((value) => (Number.isFinite(value) ? value.toFixed(12) : "-")).join("|");

    return {
      formulaTestable: false,
      formulae,
      id,
      kind: "mid-step-math",
      pivot: {
        midVoltage: pivotModel.midVoltage,
        sensor1Estimate: pivotModel.sensor1Estimate,
      },
      ready,
      residual: {
        maxAbs: maxAbsResidual,
        mean: residualMean,
        rmse: residualRmse,
      },
    };
  }

  getFormulae(samples) {
    return this.getModel(samples).formulae;
  }

  getAnalysisCsv(samples) {
    return [
      [
        "run",
        "gain",
        "rows",
        "minMid",
        "maxMid",
        "meanSensor2DeltaPerStep",
        "rmsSensor2DeltaPerStep",
        "minSensor1Est",
        "maxSensor1Est",
        "dSensor2_dSensor1Est",
        "sensitivityRmsV",
        "expectedSensitivity",
        "sensitivityResidual",
      ].join(","),
      ...this.getAnalysisFitRows(samples).map((row) => [
        row.run,
        row.gain,
        row.samples,
        formatCsvNumber(row.minMid, 0),
        formatCsvNumber(row.maxMid, 0),
        formatCsvNumber(row.meanDelta, 12),
        formatCsvNumber(row.rmsDelta, 12),
        formatCsvNumber(row.minSensor1Est, 12),
        formatCsvNumber(row.maxSensor1Est, 12),
        formatCsvNumber(row.sensitivity, 12),
        formatCsvNumber(row.sensitivityRms, 12),
        formatCsvNumber(row.expectedSensitivity, 12),
        formatCsvNumber(row.sensitivityResidual, 12),
      ].join(",")),
    ].join("\n");
  }

  getAnalysisFitRows(samples) {
    return getMidStepBlockRows((samples ?? []).filter(isMidStepSample));
  }

  getCachedBlockRows(samples) {
    if (!samples.length) {
      return this.cachedBlockRows ?? [];
    }

    this.cachedBlockRows ??= this.getAnalysisFitRows(samples);

    return this.cachedBlockRows;
  }

  getCachedStage(stageId, blocks, samples) {
    if (!this.cachedStages.has(stageId)) {
      const stage = this.getStages().find((candidate) => candidate.id === stageId);
      const stageData = this.getStage(stageId, blocks, samples);

      this.cachedStages.set(stageId, stageData
        ? { title: stage?.title ?? stage?.label ?? "", ...stageData }
        : stageData);
    }

    return this.cachedStages.get(stageId);
  }

  getStage(stageId, blocks, samples) {
    switch (stageId) {
      case MID_STEP_STAGE_ONE_ID:
        return getBlockReductionStage(blocks, samples);
      case MID_STEP_STAGE_TWO_ID:
        return getSensor1ValidationStage(samples);
      case MID_STEP_STAGE_THREE_ID:
        return getMeasuredResponseStage(blocks);
      case MID_STEP_STAGE_FOUR_ID:
        return getPivotDerivationStage(samples);
      case MID_STEP_STAGE_FIVE_ID:
        return getFiniteDifferenceStage(blocks, samples);
      case MID_STEP_STAGE_SIX_ID:
        return getResidualCorrectionStage(blocks, samples);
      default:
        return null;
    }
  }
}

const FORMULA_ROW_GAP = "0.85em";
const FORMULA_ROW_HEIGHT_STRUT = "\\vphantom{\\mathrm{sensor1}_{est}(\\mathrm{top},\\mathrm{bot},\\mathrm{mid}+1)}";

function getMidStepFormulaeHtml({
  maxAbsResidual,
  pivotModel,
  residualMean,
  residualRmse,
} = {}) {
  const pivotMidVoltage = formatFormulaNumber(pivotModel?.midVoltage, 6);
  const pivotSensor1Estimate = formatFormulaNumber(pivotModel?.sensor1Estimate, 6);
  const lines = [
    `V_0 &= ${pivotMidVoltage}`,
    `S_0 &= ${pivotSensor1Estimate}`,
    "V &= \\mathrm{midVoltage}(\\mathrm{top},\\mathrm{bot},\\mathrm{mid})",
    "V_{next} &= \\mathrm{midVoltage}(\\mathrm{top},\\mathrm{bot},\\mathrm{mid}+\\mathrm{step})",
    "S &= \\mathrm{sensor1}_{est}",
    "S_{next} &= S_0 + (S - S_0) \\cdot \\frac{V_{next} - V_0}{V - V_0}",
    "\\Delta S_{step} &= \\frac{S_{next} - S}{\\mathrm{step}}",
    "\\Delta\\mathrm{sensor2}_{pred} &= -\\mathrm{multiplier}(\\mathrm{gain}) \\cdot \\Delta S_{step}",
    "\\mathrm{residual} &= \\Delta\\mathrm{sensor2}_{measured,step} - \\Delta\\mathrm{sensor2}_{pred}",
  ];
  const alignedFormulae = lines
    .map((line) => `${FORMULA_ROW_HEIGHT_STRUT}${line}`)
    .join(` \\\\[${FORMULA_ROW_GAP}] `);

  return [
    "<span class=\"analysis-stage-formulae__title\">Mid Step math formulae</span>",
    `<span class="analysis-stage-formulae__math" data-analysis-formula-tex="${escapeHtml(`\\begin{aligned}${alignedFormulae}\\end{aligned}`)}"></span>`,
    "<span class=\"analysis-stage-formulae__summary\">",
    `RMSE ${escapeHtml(formatMillivolts(residualRmse))}`,
    `, mean ${escapeHtml(formatSignedMillivolts(residualMean))}`,
    `, worst ${escapeHtml(formatMillivolts(maxAbsResidual))}`,
    "</span>",
  ].join("");
}

function formatFormulaNumber(value, fractionDigits = 6) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "?";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function getBlockReductionStage(blocks, samples) {
  const midStepSamples = (samples ?? []).filter(isMidStepSample);

  if (!midStepSamples.length) {
    return {
      description: `
        <p><strong>1: Block Reduction</strong></p>
        <p>Load a Calibration; Mid Step CSV to split the samples into runs and gain blocks.</p>
      `,
      detail: "No Mid Step samples",
      traces: [],
      value: "0",
      xTitle: "Mid wiper",
      yTitle: "Sensor2 delta / mid step (V/count)",
    };
  }

  const runs = getRunCount(midStepSamples);
  const meanAbsDelta = getMean(blocks.map((block) => Math.abs(block.meanDelta)));
  const deltaExtents = blocks.flatMap((block) => [
    block.meanDelta - block.stdDelta,
    block.meanDelta + block.stdDelta,
  ]);

  return {
    description: `
      <p><strong>1: Block Reduction</strong></p>
      <p>Splits the Mid Step CSV into contiguous runs and gain blocks, then reduces each block to one mean Sensor2 change per mid-wiper step.</p>
      <p>The error bars show the spread inside each raw mid sweep. This reduced block table is the observed target for the next stages.</p>
    `,
    detail: `${runs} runs, ${blocks.length} gain blocks`,
    traces: getMidStepBlockTraces(blocks),
    value: `${formatMillivolts(meanAbsDelta)}/step`,
    xRange: getPaddedRange(blocks.map((block) => block.gain), 2),
    xTitle: "Gain wiper",
    yRange: getPaddedRange(deltaExtents, 0.001),
    yTitle: "Mean Sensor2 delta / mid step (V/count)",
    showLegend: true,
  };
}

function getMidStepBlockTraces(blocks) {
  const blocksByRun = new Map();

  blocks.forEach((block) => {
    const run = block.run;

    if (!Number.isFinite(run)) {
      return;
    }

    if (!blocksByRun.has(run)) {
      blocksByRun.set(run, []);
    }

    blocksByRun.get(run).push(block);
  });

  return Array.from(blocksByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runBlocks]) => {
      const sortedBlocks = [...runBlocks].sort((left, right) => left.gain - right.gain);
      const color = getRunColor(run);

      return {
        customdata: sortedBlocks.map((block) => [
          block.samples,
          formatWiper(block.minMid),
          formatWiper(block.maxMid),
          formatMillivolts(block.stdDelta),
          formatMillivolts(block.minDelta),
          formatMillivolts(block.maxDelta),
          formatVoltage(block.minSensor1Est),
          formatVoltage(block.maxSensor1Est),
        ]),
        error_y: {
          array: sortedBlocks.map((block) => block.stdDelta),
          color: withAlpha(color, 0.42),
          thickness: 1,
          type: "data",
          visible: true,
          width: 2,
        },
        hovertemplate: [
          "gain %{x:.0f}",
          "mean delta %{y:.6f} V/count",
          "samples %{customdata[0]}",
          "mid %{customdata[1]} to %{customdata[2]}",
          "std dev %{customdata[3]}/step",
          "range %{customdata[4]} to %{customdata[5]}/step",
          "sensor1_est %{customdata[6]} to %{customdata[7]}",
          `<extra>run ${formatWiper(run)}</extra>`,
        ].join("<br>"),
        line: {
          color: withAlpha(color, 0.68),
          dash: "dot",
          width: 1.7,
        },
        marker: {
          color,
          line: { color: "rgba(255, 255, 255, 0.72)", width: 0.9 },
          opacity: 0.92,
          size: 8,
        },
        mode: "lines+markers",
        name: `run ${formatWiper(run)}`,
        type: "scatter",
        x: sortedBlocks.map((block) => block.gain),
        y: sortedBlocks.map((block) => block.meanDelta),
      };
    });
}

function getSensor1ValidationStage(samples) {
  const rows = getSensor1ValidationRows(samples);

  if (!rows.length) {
    const midStepSampleCount = (samples ?? []).filter(isMidStepSample).length;

    return {
      description: `
        <p><strong>2: Sensor1 Estimate Validation</strong></p>
        <p>Load a Calibration; Mid Step CSV with measured Sensor1 and sensor1_est/sensor1Predicted values to run this validation.</p>
      `,
      detail: midStepSampleCount ? "no Sensor1 estimate rows" : "awaiting samples",
      traces: [],
      value: "-",
      xTitle: "Measured Sensor1 (V)",
      yTitle: "sensor1_est - sensor1 (V)",
    };
  }

  const errors = rows.map((row) => row.error);
  const rmse = getRms(errors);
  const meanError = getMean(errors);
  const maxAbsError = Math.max(...errors.map((error) => Math.abs(error)));
  const sensor1Range = getValueRange(rows.map((row) => row.sensor1));
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
      <p><strong>2: Sensor1 Estimate Validation</strong></p>
      <p>Compares the CSV sensor1_est value with measured Sensor1 for each Mid Step sample.</p>
      <p>This checks whether Sensor1Estimate(top, bot, mid) is trustworthy enough to use as the input to later stages.</p>
    `,
    detail: `mean ${formatSignedMillivolts(meanError)}, worst ${formatMillivolts(maxAbsError)}`,
    traces: [
      zeroTrace,
      ...getSensor1ValidationRunTraces(rows),
    ].filter(Boolean),
    value: formatMillivolts(rmse),
    xRange: getPaddedRange(rows.map((row) => row.sensor1), 0.01),
    xTitle: "Measured Sensor1 (V)",
    yRange: getPaddedRange([0, ...errors], Math.max(maxAbsError * 0.12, 0.001)),
    yTitle: "sensor1_est - sensor1 (V)",
    showLegend: true,
  };
}

function getSensor1ValidationRows(samples) {
  return getSamplesWithRunIndex((samples ?? [])
    .filter((sample) => (
      isMidStepSample(sample)
        && Number.isFinite(sample.sensorActual?.sensor1)
        && Number.isFinite(getSensor1Estimate(sample))
    )))
    .map((sample) => ({
      error: getSensor1Estimate(sample) - sample.sensorActual.sensor1,
      gain: sample.wipers?.gain,
      mid: sample.wipers?.mid,
      midVoltage: sample.midOutputVoltage,
      run: sample.runIndex,
      sensor1: sample.sensorActual.sensor1,
      sensor1Est: getSensor1Estimate(sample),
    }))
    .filter((row) => Number.isFinite(row.run) && Number.isFinite(row.error))
    .sort((left, right) => (
      left.run - right.run
        || left.sensor1 - right.sensor1
        || left.gain - right.gain
    ));
}

function getSamplesWithRunIndex(samples) {
  let currentRun = 0;
  let previousElapsed = null;

  return samples.map((sample) => {
    const elapsed = sample.elapsedSeconds;

    if (Number.isFinite(previousElapsed)
      && Number.isFinite(elapsed)
      && elapsed < previousElapsed - 0.001) {
      currentRun += 1;
    }

    previousElapsed = Number.isFinite(elapsed) ? elapsed : previousElapsed;

    return {
      ...sample,
      runIndex: Number.isFinite(sample.runIndex) ? sample.runIndex : currentRun + 1,
    };
  });
}

function getSensor1ValidationRunTraces(rows) {
  const rowsByRun = new Map();

  rows.forEach((row) => {
    if (!rowsByRun.has(row.run)) {
      rowsByRun.set(row.run, []);
    }

    rowsByRun.get(row.run).push(row);
  });

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runRows]) => {
      const color = getRunColor(run);

      return {
        customdata: runRows.map((row) => [
          formatVoltage(row.sensor1Est),
          formatSignedMillivolts(row.error),
          formatWiper(row.gain),
          formatWiper(row.mid),
          formatVoltage(row.midVoltage),
        ]),
        hovertemplate: [
          "measured Sensor1 %{x:.6f} V",
          "sensor1_est error %{y:.6f} V",
          "sensor1_est %{customdata[0]}",
          "error %{customdata[1]}",
          "gain %{customdata[2]}",
          "mid %{customdata[3]}",
          "mid voltage %{customdata[4]}",
          `<extra>run ${formatWiper(run)}</extra>`,
        ].join("<br>"),
        marker: {
          color,
          line: { color: "rgba(255, 255, 255, 0.60)", width: 0.5 },
          opacity: 0.56,
          size: 5,
          symbol: getRunSymbol(run),
        },
        mode: "markers",
        name: `run ${formatWiper(run)}`,
        type: "scatter",
        x: runRows.map((row) => row.sensor1),
        y: runRows.map((row) => row.error),
      };
    });
}

function getSensitivityStage(blocks) {
  const sensitivityRows = getSensitivityRows(blocks);

  if (sensitivityRows.length < 2) {
    return {
      description: `
        <p><strong>4: Gain Sensitivity</strong></p>
        <p>Run the first stage to reduce the Mid Step CSV into gain blocks, then this stage fits Sensor2 against sensor1_est inside each block.</p>
      `,
      detail: sensitivityRows.length ? "need two gain rows" : "awaiting stage 1",
      traces: [],
      value: "-",
      xTitle: "Gain wiper",
      yTitle: "dSensor2 / dSensor1_est",
    };
  }

  const fit = getSensitivityFit(sensitivityRows);
  const residuals = sensitivityRows.map((row) => getSensitivityResidual(row, fit));
  const residualRms = getRms(residuals);
  const expectedResiduals = sensitivityRows
    .map((row) => row.sensitivityResidual)
    .filter(Number.isFinite);
  const expectedResidualRms = getRms(expectedResiduals);
  const slopeText = `${formatSignedNumber(fit.slope, 4)}/gain`;
  const interceptText = formatSensitivity(fit.intercept);
  const fitLine = getSensitivityFitTrace(sensitivityRows, fit);

  return {
    description: `
      <p><strong>4: Gain Sensitivity</strong></p>
      <p>Fits Sensor2 vs sensor1_est inside each reduced run/gain block. The fitted slope is the local dSensor2 / dSensor1_est sensitivity.</p>
      <p>The overall line then fits that sensitivity against gain. This checks the clean gain-side relationship before using it to predict mid-step changes.</p>
    `,
    detail: `A ${interceptText}, RMS ${formatSensitivityRms(residualRms)}`,
    traces: [
      ...getSensitivityRunTraces(sensitivityRows),
      fitLine,
    ].filter(Boolean),
    value: slopeText,
    xRange: getPaddedRange(sensitivityRows.map((row) => row.gain), 2),
    xTitle: "Gain wiper",
    yRange: getPaddedRange([
      ...sensitivityRows.map((row) => row.sensitivity),
      ...sensitivityRows.map((row) => getSensitivityPrediction(row.gain, fit)),
    ], 0.5),
    yTitle: "dSensor2 / dSensor1_est",
    showLegend: true,
    summary: {
      expectedResidualRms,
      fit,
      interceptText,
      residualRms,
      slopeText,
    },
  };
}

function getPivotDerivationStage(samples) {
  const pivotModel = getPivotModel(samples);
  const runFits = pivotModel.runFits ?? [];
  const rows = getPivotDerivationRows(samples);
  const runFitRms = getRms(runFits.map((fit) => fit.rms));

  if (!rows.length || runFits.length < 2 || !Number.isFinite(pivotModel.midVoltage)) {
    return {
      description: `
        <p><strong>4: Pivot Derivation</strong></p>
        <p>Load a Mid Step CSV with at least two light-state runs. This stage fits sensor1_est against calculated mid voltage for each run, then derives their shared pivot.</p>
      `,
      detail: rows.length ? "need two runs" : "awaiting samples",
      traces: rows.length ? getPivotSampleRunTraces(rows) : [],
      value: "-",
      xTitle: "Calculated mid voltage (V)",
      yTitle: "sensor1_est (V)",
      showLegend: Boolean(rows.length),
    };
  }

  return {
    description: `
      <p><strong>4: Pivot Derivation</strong></p>
      <p>Fits sensor1_est against calculated mid voltage for each light-state run.</p>
      <p>The run lines should cross near one common pivot. That pivot becomes V0/S0 in the finite-difference formula used by the next stage.</p>
    `,
    detail: `V0 ${formatVoltage(pivotModel.midVoltage)}, S0 ${formatVoltage(pivotModel.sensor1Estimate)}`,
    traces: [
      ...getPivotSampleRunTraces(rows),
      ...getPivotFitLineTraces(runFits, rows),
      getPivotPointTrace(pivotModel),
    ].filter(Boolean),
    value: formatMillivolts(runFitRms),
    xRange: getPaddedRange([
      ...rows.map((row) => row.midVoltage),
      pivotModel.midVoltage,
    ], 0.005),
    xTitle: "Calculated mid voltage (V)",
    yRange: getPaddedRange([
      ...rows.map((row) => row.sensor1Estimate),
      pivotModel.sensor1Estimate,
    ], 0.005),
    yTitle: "sensor1_est (V)",
    showLegend: true,
    summary: {
      pivotModel,
      runFitRms,
    },
  };
}

function getPivotDerivationRows(samples) {
  return getSamplesWithRunIndex((samples ?? [])
    .filter((sample) => (
      isMidStepSample(sample)
        && Number.isFinite(sample.midOutputVoltage)
        && Number.isFinite(getSensor1Estimate(sample))
    )))
    .map((sample) => ({
      gain: sample.wipers?.gain,
      mid: sample.wipers?.mid,
      midVoltage: sample.midOutputVoltage,
      run: sample.runIndex,
      sensor1Estimate: getSensor1Estimate(sample),
    }))
    .filter((row) => (
      Number.isFinite(row.run)
        && Number.isFinite(row.midVoltage)
        && Number.isFinite(row.sensor1Estimate)
    ))
    .sort((left, right) => (
      left.run - right.run
        || left.midVoltage - right.midVoltage
        || left.gain - right.gain
    ));
}

function getPivotSampleRunTraces(rows) {
  const rowsByRun = groupRowsByRun(rows);

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runRows]) => {
      const color = getRunColor(run);

      return {
        customdata: runRows.map((row) => [
          formatWiper(row.gain),
          formatWiper(row.mid),
        ]),
        hovertemplate: [
          "mid voltage %{x:.6f} V",
          "sensor1_est %{y:.6f} V",
          "gain %{customdata[0]}",
          "mid %{customdata[1]}",
          `<extra>run ${formatWiper(run)} samples</extra>`,
        ].join("<br>"),
        marker: {
          color: withAlpha(color, 0.52),
          line: { color: withAlpha(color, 0.88), width: 0.7 },
          size: 4,
          symbol: getRunSymbol(run),
        },
        mode: "markers",
        name: `run ${formatWiper(run)} samples`,
        type: "scatter",
        x: runRows.map((row) => row.midVoltage),
        y: runRows.map((row) => row.sensor1Estimate),
      };
    });
}

function getPivotFitLineTraces(runFits, rows) {
  const midVoltageRange = getValueRange(rows.map((row) => row.midVoltage));

  if (!midVoltageRange) {
    return [];
  }

  return (runFits ?? [])
    .map((fit) => {
      if (!Number.isFinite(fit.intercept) || !Number.isFinite(fit.slope)) {
        return null;
      }

      const color = getRunColor(fit.run);

      return {
        customdata: midVoltageRange.map(() => [
          formatSignedNumber(fit.slope, 4),
          formatVoltage(fit.intercept),
          formatMillivolts(fit.rms),
        ]),
        hovertemplate: [
          "mid voltage %{x:.6f} V",
          "fit sensor1_est %{y:.6f} V",
          "slope %{customdata[0]}",
          "intercept %{customdata[1]}",
          "RMS %{customdata[2]}",
          `<extra>run ${formatWiper(fit.run)} pivot fit</extra>`,
        ].join("<br>"),
        line: {
          color,
          dash: "dash",
          width: 2,
        },
        mode: "lines",
        name: `run ${formatWiper(fit.run)} fit`,
        type: "scatter",
        x: midVoltageRange,
        y: midVoltageRange.map((midVoltage) => fit.intercept + fit.slope * midVoltage),
      };
    })
    .filter(Boolean);
}

function getPivotPointTrace(pivotModel) {
  if (!Number.isFinite(pivotModel?.midVoltage)
    || !Number.isFinite(pivotModel?.sensor1Estimate)) {
    return null;
  }

  return {
    customdata: [[
      formatVoltage(pivotModel.midVoltage),
      formatVoltage(pivotModel.sensor1Estimate),
    ]],
    hovertemplate: [
      "V0 %{customdata[0]}",
      "S0 %{customdata[1]}",
      "<extra>shared pivot</extra>",
    ].join("<br>"),
    marker: {
      color: "#ffffff",
      line: { color: "rgba(0, 0, 0, 0.72)", width: 1.6 },
      size: 12,
      symbol: "x",
    },
    mode: "markers",
    name: "shared pivot",
    type: "scatter",
    x: [pivotModel.midVoltage],
    y: [pivotModel.sensor1Estimate],
  };
}

function getFiniteDifferenceStage(blocks, samples) {
  const pivotModel = getPivotModel(samples);
  const rows = getStateAwarePredictionRows(samples, pivotModel);

  if (!rows.length) {
    return {
      description: `
        <p><strong>5: State-Aware Prediction</strong></p>
        <p>Run the pivot derivation first. This stage needs a stable pivot plus adjacent Mid Step samples with sensor1_est before it can predict Sensor2 change per mid step.</p>
      `,
      detail: "awaiting pivot fit",
      traces: [],
      value: "-",
      xTitle: "Predicted dSensor2 / dMid (V/count)",
      yTitle: "Measured dSensor2 / dMid (V/count)",
    };
  }

  const residuals = rows.map((row) => row.residual);
  const rmse = getRms(residuals);
  const meanResidual = getMean(residuals);
  const maxAbsResidual = Math.max(...residuals.map((residual) => Math.abs(residual)));
  const axisValues = rows.flatMap((row) => [row.predictedDelta, row.measuredDelta]);
  const axisRange = getPaddedRange(axisValues, Math.max(maxAbsResidual * 0.4, 0.001));

  return {
    description: `
      <p><strong>5: State-Aware Prediction</strong></p>
      <p>Predicts each adjacent mid-wiper step using the pivot-state model: current sensor1_est, current/next midVoltage, and the Diff.Amp multiplier for that sample.</p>
      <p>This treats sensor1_est as the current optical state rather than trying to infer a universal mid-step correction factor.</p>
    `,
    detail: `mean ${formatSignedMillivolts(meanResidual)}, worst ${formatMillivolts(maxAbsResidual)}`,
    traces: [
      getFiniteDifferenceDiagonalTrace(axisRange),
      ...getFiniteDifferenceRunTraces(rows),
    ].filter(Boolean),
    value: formatMillivolts(rmse),
    xRange: axisRange,
    xTitle: "Predicted dSensor2 / dMid (V/count)",
    yRange: axisRange,
    yTitle: "Measured dSensor2 / dMid (V/count)",
    showLegend: true,
    summary: {
      maxAbsResidual,
      meanResidual,
      rmse,
    },
  };
}

function getStateAwarePredictionRows(samples, pivotModel) {
  if (!Number.isFinite(pivotModel?.midVoltage)
    || !Number.isFinite(pivotModel?.sensor1Estimate)) {
    return [];
  }

  const pivotMidVoltage = pivotModel.midVoltage;
  const pivotSensor1Estimate = pivotModel.sensor1Estimate;
  const rows = [];
  let previousSample = null;

  getSamplesWithRunIndex((samples ?? []).filter(isMidStepSample))
    .sort((left, right) => (
      left.runIndex - right.runIndex
        || left.elapsedSeconds - right.elapsedSeconds
    ))
    .forEach((sample) => {
      if (!previousSample || !isSameMidStepBlock(previousSample, sample)) {
        previousSample = sample;
        return;
      }

      const step = Number.isFinite(sample.sensor2Step)
        ? sample.sensor2Step
        : sample.wipers?.mid - previousSample.wipers?.mid;
      const currentSensor1Estimate = getSensor1Estimate(previousSample);
      const currentMidVoltage = previousSample.midOutputVoltage;
      const nextMidVoltage = sample.midOutputVoltage;
      const diffAmpMultiplier = Number.isFinite(previousSample.diffAmpEffectiveMultiplier)
        ? previousSample.diffAmpEffectiveMultiplier
        : sample.diffAmpEffectiveMultiplier;
      const nextSensor1Estimate = getPivotNextSensor1Estimate({
        currentMidVoltage,
        currentSensor1Estimate,
        nextMidVoltage,
        pivotMidVoltage,
        pivotSensor1Estimate,
      });
      const predictedDelta = Number.isFinite(nextSensor1Estimate)
        && Number.isFinite(currentSensor1Estimate)
        && Number.isFinite(diffAmpMultiplier)
        && Number.isFinite(step)
        && Math.abs(step) > 1e-12
        ? -diffAmpMultiplier * (nextSensor1Estimate - currentSensor1Estimate) / step
        : null;
      const measuredDelta = sample.sensor2Delta;
      const residual = Number.isFinite(predictedDelta) && Number.isFinite(measuredDelta)
        ? measuredDelta - predictedDelta
        : null;

      rows.push({
        bot: sample.wipers?.bot,
        currentMid: previousSample.wipers?.mid,
        currentMidVoltage,
        currentSensor1Estimate,
        diffAmpMultiplier,
        gain: sample.wipers?.gain,
        measuredDelta,
        nextMid: sample.wipers?.mid,
        nextMidVoltage,
        nextSensor1Estimate,
        offset: sample.wipers?.offset,
        predictedDelta,
        residual,
        run: sample.runIndex,
        samples: 1,
        step,
        top: sample.wipers?.top,
      });

      previousSample = sample;
    });

  return rows
    .filter((row) => (
      Number.isFinite(row.run)
        && Number.isFinite(row.gain)
        && Number.isFinite(row.step)
        && Math.abs(row.step) > 1e-12
        && Number.isFinite(row.currentMidVoltage)
        && Number.isFinite(row.nextMidVoltage)
        && Number.isFinite(row.currentSensor1Estimate)
        && Number.isFinite(row.nextSensor1Estimate)
        && Number.isFinite(row.diffAmpMultiplier)
        && Number.isFinite(row.predictedDelta)
        && Number.isFinite(row.measuredDelta)
        && Number.isFinite(row.residual)
    ))
    .sort((left, right) => (
      left.run - right.run
        || left.gain - right.gain
        || left.currentMid - right.currentMid
    ));
}

function isSameMidStepBlock(left, right) {
  return Number.isFinite(left?.runIndex)
    && left.runIndex === right?.runIndex
    && left?.wipers?.top === right?.wipers?.top
    && left?.wipers?.bot === right?.wipers?.bot
    && left?.wipers?.offset === right?.wipers?.offset
    && left?.wipers?.gain === right?.wipers?.gain;
}

function getPivotFiniteDifferenceRows(blocks, pivotModel) {
  if (!Number.isFinite(pivotModel?.midVoltage)
    || !Number.isFinite(pivotModel?.sensor1Estimate)) {
    return [];
  }

  const pivotMidVoltage = pivotModel.midVoltage;
  const pivotSensor1Estimate = pivotModel.sensor1Estimate;

  return (blocks ?? [])
    .map((block) => {
      const nextMidVoltage = Number.isFinite(block.meanMidVoltage) && Number.isFinite(block.midVoltageSlope)
        ? block.meanMidVoltage + block.midVoltageSlope
        : null;
      const nextSensor1Estimate = getPivotNextSensor1Estimate({
        currentMidVoltage: block.meanMidVoltage,
        currentSensor1Estimate: block.meanSensor1Est,
        nextMidVoltage,
        pivotMidVoltage,
        pivotSensor1Estimate,
      });
      const predictedDelta = Number.isFinite(nextSensor1Estimate)
        && Number.isFinite(block.meanSensor1Est)
        && Number.isFinite(block.diffAmpMultiplier)
        ? -block.diffAmpMultiplier * (nextSensor1Estimate - block.meanSensor1Est)
        : null;
      const measuredDelta = block.meanDelta;
      const residual = Number.isFinite(predictedDelta) && Number.isFinite(measuredDelta)
        ? measuredDelta - predictedDelta
        : null;

      return {
        ...block,
        measuredDelta,
        nextMidVoltage,
        nextSensor1Estimate,
        predictedDelta,
        residual,
      };
    })
    .filter((row) => (
      Number.isFinite(row.run)
        && Number.isFinite(row.gain)
        && Number.isFinite(row.meanMidVoltage)
        && Number.isFinite(row.nextMidVoltage)
        && Number.isFinite(row.meanSensor1Est)
        && Number.isFinite(row.nextSensor1Estimate)
        && Number.isFinite(row.diffAmpMultiplier)
        && Number.isFinite(row.predictedDelta)
        && Number.isFinite(row.measuredDelta)
        && Number.isFinite(row.residual)
    ))
    .sort((left, right) => (
      left.run - right.run
        || left.gain - right.gain
    ));
}

function getPivotNextSensor1Estimate({
  currentMidVoltage,
  currentSensor1Estimate,
  nextMidVoltage,
  pivotMidVoltage,
  pivotSensor1Estimate,
}) {
  if (!Number.isFinite(currentMidVoltage)
    || !Number.isFinite(currentSensor1Estimate)
    || !Number.isFinite(nextMidVoltage)
    || !Number.isFinite(pivotMidVoltage)
    || !Number.isFinite(pivotSensor1Estimate)
    || Math.abs(currentMidVoltage - pivotMidVoltage) < 1e-12) {
    return null;
  }

  return pivotSensor1Estimate
    + (currentSensor1Estimate - pivotSensor1Estimate)
      * (nextMidVoltage - pivotMidVoltage)
      / (currentMidVoltage - pivotMidVoltage);
}

function getPivotModel(samples) {
  const runFits = getPivotRunFits(samples);
  const pivot = getLinePivot(runFits);

  return {
    midVoltage: pivot?.x ?? null,
    runFits,
    sensor1Estimate: pivot?.y ?? null,
  };
}

function getPivotRunFits(samples) {
  const rowsByRun = new Map();

  getSamplesWithRunIndex((samples ?? [])
    .filter((sample) => (
      isMidStepSample(sample)
        && Number.isFinite(sample.midOutputVoltage)
        && Number.isFinite(getSensor1Estimate(sample))
    )))
    .forEach((sample) => {
      if (!rowsByRun.has(sample.runIndex)) {
        rowsByRun.set(sample.runIndex, []);
      }

      rowsByRun.get(sample.runIndex).push(sample);
    });

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runSamples]) => {
      const fit = getLinearFit(runSamples.map((sample) => ({
        plot: {
          x: sample.midOutputVoltage,
          y: getSensor1Estimate(sample),
        },
      })));

      return {
        intercept: fit.intercept,
        rms: fit.rms,
        run,
        samples: runSamples.length,
        slope: fit.slope,
      };
    })
    .filter((fit) => (
      fit.samples >= 2
        && Number.isFinite(fit.intercept)
        && Number.isFinite(fit.slope)
    ));
}

function getLinePivot(lines) {
  if ((lines ?? []).length < 2) {
    return null;
  }

  const sumM2 = getSum(lines.map((line) => line.slope ** 2));
  const sumM = getSum(lines.map((line) => line.slope));
  const sumB = getSum(lines.map((line) => line.intercept));
  const sumMB = getSum(lines.map((line) => line.slope * line.intercept));
  const count = lines.length;
  const determinant = sumM2 * count - sumM ** 2;

  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    return null;
  }

  return {
    x: (sumM * sumB - count * sumMB) / determinant,
    y: (sumM2 * sumB - sumMB * sumM) / determinant,
  };
}

function getFiniteDifferenceDiagonalTrace(axisRange) {
  if (!axisRange?.every(Number.isFinite)) {
    return null;
  }

  return {
    hoverinfo: "skip",
    line: { color: "rgba(255, 255, 255, 0.52)", dash: "dot", width: 1.6 },
    mode: "lines",
    name: "ideal",
    showlegend: false,
    type: "scatter",
    x: axisRange,
    y: axisRange,
  };
}

function getFiniteDifferenceRunTraces(rows) {
  const rowsByRun = new Map();
  const allGains = rows.map((row) => row.gain);

  rows.forEach((row) => {
    if (!rowsByRun.has(row.run)) {
      rowsByRun.set(row.run, []);
    }

    rowsByRun.get(row.run).push(row);
  });

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runRows], index) => {
      const sortedRows = [...runRows].sort((left, right) => (
        left.gain - right.gain
          || left.currentMidVoltage - right.currentMidVoltage
      ));
      const color = getRunColor(run);

      return {
        customdata: sortedRows.map((row) => [
          formatWiper(row.gain),
          formatSignedMillivolts(row.residual),
          formatVoltage(row.currentMidVoltage),
          formatVoltage(row.nextMidVoltage),
          formatWiper(row.currentMid),
          formatWiper(row.nextMid),
          formatWiper(row.step),
          formatVoltage(row.currentSensor1Estimate),
          formatVoltage(row.nextSensor1Estimate),
          formatSensitivity(row.diffAmpMultiplier),
        ]),
        hovertemplate: [
          "predicted %{x:.6f} V/count",
          "measured %{y:.6f} V/count",
          "gain %{customdata[0]}",
          "residual %{customdata[1]}",
          "current mid voltage %{customdata[2]}",
          "next mid voltage %{customdata[3]}",
          "mid %{customdata[4]} to %{customdata[5]}",
          "step %{customdata[6]}",
          "current sensor1_est %{customdata[7]}",
          "next sensor1_est %{customdata[8]}",
          "diffAmp multiplier %{customdata[9]}",
          `<extra>run ${formatWiper(run)}</extra>`,
        ].join("<br>"),
        marker: {
          ...getGainMarker(sortedRows.map((row) => row.gain), allGains, index === 0),
          line: { color: withAlpha(color, 0.95), width: 1.3 },
          symbol: getRunSymbol(run),
        },
        mode: "markers",
        name: `run ${formatWiper(run)}`,
        type: "scatter",
        x: sortedRows.map((row) => row.predictedDelta),
        y: sortedRows.map((row) => row.measuredDelta),
      };
    });
}

function getResidualCorrectionStage(blocks, samples) {
  const rows = getStateAwarePredictionRows(samples, getPivotModel(samples));

  if (!rows.length) {
    return {
      description: `
        <p><strong>6: State-Aware Residual Validation</strong></p>
        <p>Run the state-aware prediction stage first. This stage plots the remaining measured-minus-predicted error against current calculated mid voltage.</p>
      `,
      detail: "awaiting prediction",
      traces: [],
      value: "-",
      xTitle: "Current calculated mid voltage (V)",
      yTitle: "Measured - predicted dSensor2 / dMid (V/count)",
    };
  }

  const residuals = rows.map((row) => row.residual);
  const rmse = getRms(residuals);
  const meanResidual = getMean(residuals);
  const maxAbsResidual = Math.max(...residuals.map((residual) => Math.abs(residual)));
  const trendTraces = getResidualMidVoltageTrendTraces(rows);
  const trendValues = trendTraces.flatMap((trace) => trace.y);

  return {
    description: `
      <p><strong>6: State-Aware Residual Validation</strong></p>
      <p>Plots the state-aware prediction residual against current calculated mid voltage. Marker colour is gain, and marker shape/fit line is run.</p>
      <p>The dotted lines are per-run residual-vs-midVoltage fits. A stable slope here suggests the midVoltage magnitude still needs to enter the model; a run offset suggests remaining light-state dependency.</p>
    `,
    detail: `mean ${formatSignedMillivolts(meanResidual)}, worst ${formatMillivolts(maxAbsResidual)}`,
    traces: [
      getResidualZeroTrace(rows),
      ...trendTraces,
      ...getResidualRunTraces(rows),
    ].filter(Boolean),
    value: formatMillivolts(rmse),
    xRange: getPaddedRange(rows.map((row) => row.currentMidVoltage), 0.005),
    xTitle: "Current calculated mid voltage (V)",
    yRange: getPaddedRange([0, ...residuals, ...trendValues], Math.max(maxAbsResidual * 0.18, 0.00025)),
    yTitle: "Measured - predicted dSensor2 / dMid (V/count)",
    showLegend: true,
    summary: {
      maxAbsResidual,
      meanResidual,
      rmse,
    },
  };
}

function getResidualMidVoltageTrendTraces(rows) {
  const rowsByRun = new Map();

  rows.forEach((row) => {
    if (!rowsByRun.has(row.run)) {
      rowsByRun.set(row.run, []);
    }

    rowsByRun.get(row.run).push(row);
  });

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runRows]) => {
      const fit = getLinearFit(runRows.map((row) => ({
        plot: {
          x: row.currentMidVoltage,
          y: row.residual,
        },
      })));
      const midVoltageRange = getValueRange(runRows.map((row) => row.currentMidVoltage));

      if (!Number.isFinite(fit.intercept)
        || !Number.isFinite(fit.slope)
        || !midVoltageRange) {
        return null;
      }

      const color = getRunColor(run);

      return {
        customdata: midVoltageRange.map(() => [
          formatSignedMillivolts(fit.slope, 4),
          formatSignedMillivolts(fit.intercept, 4),
          formatMillivolts(fit.rms),
        ]),
        hovertemplate: [
          "mid voltage %{x:.6f} V",
          "trend residual %{y:.6f} V/count",
          "slope %{customdata[0]}/V",
          "intercept %{customdata[1]}",
          "RMS %{customdata[2]}",
          `<extra>run ${formatWiper(run)} mid-voltage trend</extra>`,
        ].join("<br>"),
        line: {
          color: withAlpha(color, 0.86),
          dash: "dash",
          width: 2,
        },
        mode: "lines",
        name: `run ${formatWiper(run)} ${formatSignedMillivolts(fit.slope, 3)}/V`,
        type: "scatter",
        x: midVoltageRange,
        y: midVoltageRange.map((midVoltage) => fit.intercept + fit.slope * midVoltage),
      };
    })
    .filter(Boolean);
}

function getResidualZeroTrace(rows) {
  const midVoltageRange = getValueRange(rows.map((row) => row.currentMidVoltage));

  if (!midVoltageRange) {
    return null;
  }

  return {
    hoverinfo: "skip",
    line: { color: "rgba(255, 255, 255, 0.52)", dash: "dot", width: 1.6 },
    mode: "lines",
    name: "zero residual",
    showlegend: false,
    type: "scatter",
    x: midVoltageRange,
    y: [0, 0],
  };
}

function getResidualRunTraces(rows) {
  const rowsByRun = new Map();
  const allGains = rows.map((row) => row.gain);

  rows.forEach((row) => {
    if (!rowsByRun.has(row.run)) {
      rowsByRun.set(row.run, []);
    }

    rowsByRun.get(row.run).push(row);
  });

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runRows], index) => {
      const sortedRows = [...runRows].sort((left, right) => (
        left.currentMidVoltage - right.currentMidVoltage
          || left.gain - right.gain
      ));

      return {
        customdata: sortedRows.map((row) => [
          formatWiper(row.gain),
          formatSignedMillivolts(row.residual),
          formatMillivolts(row.measuredDelta),
          formatMillivolts(row.predictedDelta),
          formatVoltage(row.currentMidVoltage),
          formatVoltage(row.nextMidVoltage),
          formatWiper(row.currentMid),
          formatWiper(row.nextMid),
          formatWiper(row.step),
          formatVoltage(row.currentSensor1Estimate),
          formatVoltage(row.nextSensor1Estimate),
          formatSensitivity(row.diffAmpMultiplier),
        ]),
        hovertemplate: [
          "mid voltage %{x:.6f} V",
          "residual %{y:.6f} V/count",
          "gain %{customdata[0]}",
          "residual %{customdata[1]}",
          "measured %{customdata[2]}/step",
          "predicted %{customdata[3]}/step",
          "current mid voltage %{customdata[4]}",
          "next mid voltage %{customdata[5]}",
          "mid %{customdata[6]} to %{customdata[7]}",
          "step %{customdata[8]}",
          "current sensor1_est %{customdata[9]}",
          "next sensor1_est %{customdata[10]}",
          "diffAmp multiplier %{customdata[11]}",
          `<extra>run ${formatWiper(run)}</extra>`,
        ].join("<br>"),
        marker: {
          ...getGainMarker(sortedRows.map((row) => row.gain), allGains, index === 0),
          line: { color: "rgba(255, 255, 255, 0.70)", width: 0.9 },
          symbol: getRunSymbol(run),
        },
        mode: "markers",
        name: `run ${formatWiper(run)}`,
        type: "scatter",
        x: sortedRows.map((row) => row.currentMidVoltage),
        y: sortedRows.map((row) => row.residual),
      };
    });
}

function getSensitivityRows(blocks) {
  return (blocks ?? [])
    .filter((block) => (
      Number.isFinite(block.gain)
        && Number.isFinite(block.run)
        && Number.isFinite(block.sensitivity)
    ))
    .sort((left, right) => (
      left.run - right.run
        || left.gain - right.gain
    ));
}

function getSensitivityRunTraces(rows) {
  const rowsByRun = new Map();

  rows.forEach((row) => {
    if (!rowsByRun.has(row.run)) {
      rowsByRun.set(row.run, []);
    }

    rowsByRun.get(row.run).push(row);
  });

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runRows]) => {
      const sortedRows = [...runRows].sort((left, right) => left.gain - right.gain);
      const color = getRunColor(run);

      return {
        customdata: sortedRows.map((row) => [
          row.samples,
          formatVoltage(row.minSensor1Est),
          formatVoltage(row.maxSensor1Est),
          formatVoltage(row.minSensor2),
          formatVoltage(row.maxSensor2),
          formatSensitivity(row.expectedSensitivity),
          formatSignedNumber(row.sensitivityResidual, 4),
          formatMillivolts(row.sensitivityRms),
        ]),
        hovertemplate: [
          "gain %{x:.0f}",
          "dS2/dS1_est %{y:.4f}",
          "samples %{customdata[0]}",
          "sensor1_est %{customdata[1]} to %{customdata[2]}",
          "sensor2 %{customdata[3]} to %{customdata[4]}",
          "csv diffamp sensitivity %{customdata[5]}",
          "residual %{customdata[6]}",
          "block RMS %{customdata[7]}",
          `<extra>run ${formatWiper(run)}</extra>`,
        ].join("<br>"),
        line: {
          color: withAlpha(color, 0.66),
          dash: "dot",
          width: 1.7,
        },
        marker: {
          color,
          line: { color: "rgba(255, 255, 255, 0.72)", width: 0.9 },
          opacity: 0.92,
          size: 8,
        },
        mode: "lines+markers",
        name: `run ${formatWiper(run)}`,
        type: "scatter",
        x: sortedRows.map((row) => row.gain),
        y: sortedRows.map((row) => row.sensitivity),
      };
    });
}

function getSensitivityFitTrace(rows, fit) {
  if (!Number.isFinite(fit.intercept) || !Number.isFinite(fit.slope)) {
    return null;
  }

  const gainRange = getValueRange(rows.map((row) => row.gain));

  if (!gainRange) {
    return null;
  }

  return {
    hovertemplate: [
      "gain %{x:.0f}",
      "fit sensitivity %{y:.4f}",
      "<extra>overall gain fit</extra>",
    ].join("<br>"),
    line: { color: "rgba(255, 255, 255, 0.84)", width: 2.8 },
    mode: "lines",
    name: "overall gain fit",
    type: "scatter",
    x: gainRange,
    y: gainRange.map((gain) => getSensitivityPrediction(gain, fit)),
  };
}

function getSensitivityFit(rows) {
  return getLinearFit(rows.map((row) => ({
    plot: {
      x: row.gain,
      y: row.sensitivity,
    },
  })));
}

function getSensitivityPrediction(gain, fit) {
  return Number.isFinite(fit.intercept) && Number.isFinite(fit.slope)
    ? fit.intercept + fit.slope * gain
    : null;
}

function getSensitivityResidual(row, fit) {
  const predicted = getSensitivityPrediction(row.gain, fit);

  return Number.isFinite(predicted)
    ? row.sensitivity - predicted
    : null;
}

function getMeasuredResponseStage(blocks) {
  const responseRows = getMeasuredResponseRows(blocks);

  if (!responseRows.length) {
    return {
      description: `
        <p><strong>3: Measured Mid-Step Response</strong></p>
        <p>Run the first stage to reduce the Mid Step CSV into run/gain blocks. This stage then exposes the measured dSensor2 / dMid target.</p>
      `,
      detail: "awaiting stage 1",
      traces: [],
      value: "-",
      xTitle: "Mean calculated mid voltage (V)",
      yTitle: "Measured dSensor2 / dMid (V/count)",
    };
  }

  const absoluteDeltas = responseRows.map((row) => Math.abs(row.meanDelta));
  const meanAbsDelta = getMean(absoluteDeltas);
  const minAbsDelta = Math.min(...absoluteDeltas);
  const maxAbsDelta = Math.max(...absoluteDeltas);

  return {
    description: `
      <p><strong>3: Measured Mid-Step Response</strong></p>
      <p>Shows the measured target that the later finite-difference model must predict: dSensor2 / dMid for each reduced run/gain block.</p>
      <p>X is the calculated mid voltage at the centre of the sweep used for that block. Colour represents gain, while the trace grouping keeps the four light-level runs visible.</p>
    `,
    detail: `${responseRows.length} targets, ${getRunCountFromRows(responseRows)} runs`,
    traces: getMeasuredResponseRunTraces(responseRows),
    value: formatMillivoltRange(minAbsDelta, maxAbsDelta),
    xRange: getPaddedRange(responseRows.map((row) => row.meanMidVoltage), 0.01),
    xTitle: "Mean calculated mid voltage (V)",
    yRange: getPaddedRange(responseRows.map((row) => row.meanDelta), Math.max(meanAbsDelta * 0.08, 0.001)),
    yTitle: "Measured dSensor2 / dMid (V/count)",
    showLegend: true,
  };
}

function getMeasuredResponseRows(blocks) {
  return (blocks ?? [])
    .filter((block) => (
      Number.isFinite(block.run)
        && Number.isFinite(block.gain)
        && Number.isFinite(block.meanMidVoltage)
        && Number.isFinite(block.meanDelta)
    ))
    .sort((left, right) => (
      left.run - right.run
        || left.meanMidVoltage - right.meanMidVoltage
        || left.gain - right.gain
    ));
}

function getMeasuredResponseRunTraces(rows) {
  const rowsByRun = new Map();
  const allGains = rows.map((row) => row.gain);

  rows.forEach((row) => {
    if (!rowsByRun.has(row.run)) {
      rowsByRun.set(row.run, []);
    }

    rowsByRun.get(row.run).push(row);
  });

  return Array.from(rowsByRun.entries())
    .sort(([leftRun], [rightRun]) => leftRun - rightRun)
    .map(([run, runRows], index) => {
      const sortedRows = [...runRows].sort((left, right) => (
        left.meanMidVoltage - right.meanMidVoltage
          || left.gain - right.gain
      ));
      const color = getRunColor(run);

      return {
        customdata: sortedRows.map((row) => [
          row.samples,
          formatWiper(row.gain),
          formatWiper(row.minMid),
          formatWiper(row.maxMid),
          formatVoltage(row.minMidVoltage),
          formatVoltage(row.maxMidVoltage),
          formatMillivolts(row.stdDelta),
          formatMillivolts(row.minDelta),
          formatMillivolts(row.maxDelta),
          formatSensitivity(row.sensitivity),
          formatVoltage(row.minSensor1Est),
          formatVoltage(row.maxSensor1Est),
        ]),
        error_y: {
          array: sortedRows.map((row) => row.stdDelta),
          color: withAlpha(color, 0.34),
          thickness: 1,
          type: "data",
          visible: true,
          width: 2,
        },
        hovertemplate: [
          "mean mid voltage %{x:.6f} V",
          "measured dS2/dMid %{y:.6f} V/count",
          "gain %{customdata[1]}",
          "samples %{customdata[0]}",
          "mid %{customdata[2]} to %{customdata[3]}",
          "mid voltage %{customdata[4]} to %{customdata[5]}",
          "std dev %{customdata[6]}/step",
          "range %{customdata[7]} to %{customdata[8]}/step",
          "dS2/dS1_est %{customdata[9]}",
          "sensor1_est %{customdata[10]} to %{customdata[11]}",
          `<extra>run ${formatWiper(run)}</extra>`,
        ].join("<br>"),
        marker: {
          ...getGainMarker(sortedRows.map((row) => row.gain), allGains, index === 0),
          line: { color: withAlpha(color, 0.95), width: 1.3 },
          symbol: getRunSymbol(run),
        },
        mode: "markers",
        name: `run ${formatWiper(run)}`,
        type: "scatter",
        x: sortedRows.map((row) => row.meanMidVoltage),
        y: sortedRows.map((row) => row.meanDelta),
      };
    });
}

function getRunCountFromRows(rows) {
  return new Set(rows.map((row) => row.run).filter(Number.isFinite)).size;
}

function groupRowsByRun(rows) {
  const rowsByRun = new Map();

  (rows ?? []).forEach((row) => {
    if (!rowsByRun.has(row.run)) {
      rowsByRun.set(row.run, []);
    }

    rowsByRun.get(row.run).push(row);
  });

  return rowsByRun;
}

function getRunColor(run) {
  const index = Number.isFinite(run) ? Math.max(0, Math.round(run) - 1) : 0;

  return RUN_COLORS[index % RUN_COLORS.length];
}

function getRunSymbol(run) {
  const index = Number.isFinite(run) ? Math.max(0, Math.round(run) - 1) : 0;

  return RUN_SYMBOLS[index % RUN_SYMBOLS.length];
}

function getGainMarker(gains, allGains = gains, showscale = true) {
  const domain = getGainColorDomain(allGains);
  const indexByGain = new Map(domain.map((gain, index) => [gain, index]));

  return {
    cmax: Math.max(0.5, domain.length - 0.5),
    cmin: -0.5,
    color: gains.map((gain) => indexByGain.get(gain) ?? null),
    colorbar: {
      outlinewidth: 0,
      thickness: 10,
      tickmode: "array",
      ticktext: domain.map(formatColorbarTick),
      tickvals: domain.map((_, index) => index),
      title: { side: "right", text: "Gain" },
    },
    colorscale: getSteppedColorscale(domain.map(getGainMarkerColor)),
    opacity: 0.92,
    showscale,
    size: 9,
  };
}

function getGainColorDomain(gains) {
  const knownGains = getSortedUniqueNumbers(gains);
  const maxGain = Math.max(0, ...knownGains);
  const baseDomain = maxGain > 64
    ? EXTENDED_GAIN_COLOR_DOMAIN
    : STANDARD_GAIN_COLOR_DOMAIN;

  return getSortedUniqueNumbers([
    ...baseDomain,
    ...knownGains,
  ]);
}

function getGainMarkerColor(gain) {
  const domain = EXTENDED_GAIN_COLOR_DOMAIN;
  const exactIndex = domain.indexOf(gain);

  if (exactIndex >= 0) {
    return GAIN_MARKER_COLORS[exactIndex] ?? "#ffffff";
  }

  const knownGain = Number(gain);

  if (!Number.isFinite(knownGain)) {
    return "#ffffff";
  }

  const lowerIndex = findLowerGainDomainIndex(knownGain, domain);
  const upperIndex = Math.min(lowerIndex + 1, domain.length - 1);
  const lowerGain = domain[lowerIndex];
  const upperGain = domain[upperIndex];
  const lowerColor = GAIN_MARKER_COLORS[lowerIndex] ?? GAIN_MARKER_COLORS[0];
  const upperColor = GAIN_MARKER_COLORS[upperIndex] ?? GAIN_MARKER_COLORS[GAIN_MARKER_COLORS.length - 1];
  const ratio = upperGain === lowerGain
    ? 0
    : (knownGain - lowerGain) / (upperGain - lowerGain);

  return mixHexColors(lowerColor, upperColor, Math.max(0, Math.min(1, ratio)));
}

function findLowerGainDomainIndex(gain, domain) {
  if (gain <= domain[0]) {
    return 0;
  }

  for (let index = 0; index < domain.length - 1; index += 1) {
    if (gain >= domain[index] && gain <= domain[index + 1]) {
      return index;
    }
  }

  return domain.length - 1;
}

function getSortedUniqueNumbers(values) {
  return Array.from(new Set(values.filter(Number.isFinite)))
    .sort((left, right) => left - right);
}

function mixHexColors(left, right, ratio) {
  const leftRgb = parseHexColor(left);
  const rightRgb = parseHexColor(right);

  if (!leftRgb || !rightRgb) {
    return ratio < 0.5 ? left : right;
  }

  return `#${leftRgb.map((leftChannel, index) => (
    Math.round(leftChannel + (rightRgb[index] - leftChannel) * ratio)
      .toString(16)
      .padStart(2, "0")
  )).join("")}`;
}

function parseHexColor(color) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);

  return match
    ? match.slice(1).map((channel) => parseInt(channel, 16))
    : null;
}

function getSteppedColorscale(colors) {
  if (colors.length <= 1) {
    const color = colors[0] ?? "#ffffff";

    return [
      [0, color],
      [1, color],
    ];
  }

  const epsilon = 0.000001;

  return colors.flatMap((color, index) => {
    const start = index / colors.length;
    const end = (index + 1) / colors.length;
    const stops = [
      [start, color],
      [Math.max(start, end - epsilon), color],
    ];

    if (index === colors.length - 1) {
      stops.push([1, color]);
    }

    return stops;
  });
}

function formatColorbarTick(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getMidStepBlockRows(samples) {
  const blocks = [];
  let currentRun = 0;
  let previousElapsed = null;
  let currentBlock = null;

  samples.forEach((sample) => {
    const elapsed = sample.elapsedSeconds;

    if (Number.isFinite(previousElapsed)
      && Number.isFinite(elapsed)
      && elapsed < previousElapsed - 0.001) {
      currentRun += 1;
      currentBlock = null;
    }

    previousElapsed = Number.isFinite(elapsed) ? elapsed : previousElapsed;

    const gain = sample.wipers?.gain;
    const key = [
      currentRun,
      sample.wipers?.top,
      sample.wipers?.bot,
      sample.wipers?.offset,
      gain,
    ].join("|");

    if (!currentBlock || currentBlock.key !== key) {
      currentBlock = {
        gain,
        key,
        offset: sample.wipers?.offset,
        run: currentRun + 1,
        samples: [],
        top: sample.wipers?.top,
        bot: sample.wipers?.bot,
      };
      blocks.push(currentBlock);
    }

    sample.runIndex = currentRun + 1;
    currentBlock.samples.push(sample);
  });

  return blocks
    .map((block) => summariseBlock(block))
    .filter(Boolean);
}

function summariseBlock(block) {
  const deltas = block.samples.map((sample) => sample.sensor2Delta).filter(Number.isFinite);
  const mids = block.samples.map((sample) => sample.wipers?.mid).filter(Number.isFinite);
  const midVoltages = block.samples.map((sample) => sample.midOutputVoltage).filter(Number.isFinite);
  const sensor1Estimates = block.samples.map(getSensor1Estimate).filter(Number.isFinite);
  const sensor2Values = block.samples.map((sample) => sample.sensorActual?.sensor2).filter(Number.isFinite);
  const diffAmpMultipliers = block.samples.map((sample) => sample.diffAmpEffectiveMultiplier).filter(Number.isFinite);
  const midVoltageFit = getMidVoltageToMidFit(block.samples);
  const sensitivityFit = getSensor2ToSensor1EstimateFit(block.samples);
  const sensor1MidFit = getSensor1EstimateToMidFit(block.samples);
  const meanDiffAmpMultiplier = diffAmpMultipliers.length ? getMean(diffAmpMultipliers) : null;
  const expectedSensitivity = diffAmpMultipliers.length
    ? -meanDiffAmpMultiplier
    : null;

  if (!deltas.length || !mids.length) {
    return null;
  }

  return {
    bot: block.bot,
    gain: block.gain,
    maxMid: Math.max(...mids),
    maxDelta: Math.max(...deltas),
    maxMidVoltage: midVoltages.length ? Math.max(...midVoltages) : null,
    maxSensor1Est: sensor1Estimates.length ? Math.max(...sensor1Estimates) : null,
    maxSensor2: sensor2Values.length ? Math.max(...sensor2Values) : null,
    diffAmpMultiplier: meanDiffAmpMultiplier,
    meanDelta: getMean(deltas),
    meanMid: getMean(mids),
    meanMidVoltage: midVoltages.length ? getMean(midVoltages) : getMean(mids),
    meanSensor1Est: sensor1Estimates.length ? getMean(sensor1Estimates) : null,
    minDelta: Math.min(...deltas),
    minMid: Math.min(...mids),
    minMidVoltage: midVoltages.length ? Math.min(...midVoltages) : null,
    minSensor1Est: sensor1Estimates.length ? Math.min(...sensor1Estimates) : null,
    minSensor2: sensor2Values.length ? Math.min(...sensor2Values) : null,
    offset: block.offset,
    rmsDelta: getRms(deltas),
    run: block.run,
    samples: block.samples.length,
    midVoltageIntercept: midVoltageFit.intercept,
    midVoltageSlope: midVoltageFit.slope,
    sensor1MidIntercept: sensor1MidFit.intercept,
    sensor1MidRms: sensor1MidFit.rms,
    sensor1MidSlope: sensor1MidFit.slope,
    sensitivity: sensitivityFit.slope,
    sensitivityIntercept: sensitivityFit.intercept,
    sensitivityResidual: Number.isFinite(sensitivityFit.slope) && Number.isFinite(expectedSensitivity)
      ? sensitivityFit.slope - expectedSensitivity
      : null,
    sensitivityRms: sensitivityFit.rms,
    expectedSensitivity,
    source: "test4",
    stdDelta: getStandardDeviation(deltas),
    top: block.top,
  };
}

function getSensor2ToSensor1EstimateFit(samples) {
  return getLinearFit((samples ?? [])
    .filter((sample) => (
      Number.isFinite(getSensor1Estimate(sample))
        && Number.isFinite(sample.sensorActual?.sensor2)
    ))
    .map((sample) => ({
      plot: {
        x: getSensor1Estimate(sample),
        y: sample.sensorActual.sensor2,
      },
    })));
}

function getSensor1EstimateToMidFit(samples) {
  return getLinearFit((samples ?? [])
    .filter((sample) => (
      Number.isFinite(sample.wipers?.mid)
        && Number.isFinite(getSensor1Estimate(sample))
    ))
    .map((sample) => ({
      plot: {
        x: sample.wipers.mid,
        y: getSensor1Estimate(sample),
      },
    })));
}

function getMidVoltageToMidFit(samples) {
  return getLinearFit((samples ?? [])
    .filter((sample) => (
      Number.isFinite(sample.wipers?.mid)
        && Number.isFinite(sample.midOutputVoltage)
    ))
    .map((sample) => ({
      plot: {
        x: sample.wipers.mid,
        y: sample.midOutputVoltage,
      },
    })));
}

function getSensor1Estimate(sample) {
  return Number.isFinite(sample?.sensorEstimated?.sensor1)
    ? sample.sensorEstimated.sensor1
    : sample?.sensorPredicted?.sensor1;
}

function isMidStepSample(sample) {
  return sample?.source === "test4"
    && sample?.plot?.kind === "test4-delta"
    && Number.isFinite(sample.sensor2Delta)
    && Number.isFinite(sample.wipers?.mid)
    && Number.isFinite(sample.wipers?.gain);
}

function getRunCount(samples) {
  return new Set(samples.map((sample) => sample.runIndex).filter(Number.isFinite)).size
    || getMidStepBlockRows(samples).reduce((count, block) => Math.max(count, block.run), 0);
}

function withAlpha(hexColor, alpha) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);

  if (!match) {
    return hexColor;
  }

  const [red, green, blue] = match.slice(1).map((channel) => parseInt(channel, 16));

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getPaddedRange(values, fallbackPadding = 0.025) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return [0, 1];
  }

  const min = Math.min(...knownValues);
  const max = Math.max(...knownValues);
  const padding = Math.max((max - min) * 0.08, fallbackPadding);

  return [min - padding, max + padding];
}

function getValueRange(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return [Math.min(...knownValues), Math.max(...knownValues)];
}

function getMean(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length;
}

function getSum(values) {
  return values
    .filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
}

function getRms(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return Math.sqrt(knownValues.reduce((sum, value) => sum + value ** 2, 0) / knownValues.length);
}

function getStandardDeviation(values) {
  const knownValues = values.filter(Number.isFinite);

  if (knownValues.length < 2) {
    return 0;
  }

  const mean = getMean(knownValues);

  return Math.sqrt(
    knownValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / knownValues.length,
  );
}

function formatCsvNumber(value, fractionDigits = 9) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "";
}

function formatMillivolts(value) {
  return Number.isFinite(value) ? `${(value * 1000).toFixed(2)} mV` : "-";
}

function formatSignedMillivolts(value, fractionDigits = 3) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : "-"}${Math.abs(value * 1000).toFixed(fractionDigits)} mV`;
}

function formatMillivoltRange(minValue, maxValue) {
  return Number.isFinite(minValue) && Number.isFinite(maxValue)
    ? `${(minValue * 1000).toFixed(2)}-${(maxValue * 1000).toFixed(2)} mV`
    : "-";
}

function formatSensitivity(value, fractionDigits = 3) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

function formatSensitivityRms(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value > 0 && value < 0.00001
    ? "<0.00001"
    : value.toFixed(5);
}

function formatSignedNumber(value, fractionDigits = 3) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(fractionDigits)}`;
}

function formatVoltage(value) {
  return Number.isFinite(value) ? `${value.toFixed(6)} V` : "---";
}

function formatWiper(value) {
  return Number.isFinite(value) ? String(value) : "-";
}
