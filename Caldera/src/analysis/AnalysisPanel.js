import Plotly from "plotly.js-dist-min";
import { AnalysisDataset } from "./AnalysisDataset.js";

const EMPTY_AXIS_RANGE = [0, 3.3];
const FIT_LINE_COLORS = Object.freeze([
  "rgba(255, 255, 255, 0.10)",
  "rgba(53, 194, 255, 0.10)",
  "rgba(126, 231, 135, 0.10)",
  "rgba(255, 207, 90, 0.10)",
  "rgba(255, 123, 114, 0.10)",
]);
const ANALYSIS_STAGE_SAMPLES = "samples";
const ANALYSIS_STAGE_FITS = "fits";
const ANALYSIS_STAGE_GAIN = "gain";
const ANALYSIS_STAGE_OFFSET = "offset";
const ANALYSIS_STAGE_IDS = Object.freeze([
  ANALYSIS_STAGE_SAMPLES,
  ANALYSIS_STAGE_FITS,
  ANALYSIS_STAGE_GAIN,
  ANALYSIS_STAGE_OFFSET,
]);
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

export class AnalysisPanel {
  constructor({
    dataset = new AnalysisDataset(),
    root,
    webView = null,
  } = {}) {
    this.dataset = dataset;
    this.root = root;
    this.webView = webView;
    this.badge = root?.querySelector("[data-analysis-badge]");
    this.chartRoot = root?.querySelector("[data-analysis-chart]");
    this.stageChartRoot = root?.querySelector("[data-analysis-stage-chart]");
    this.stageDescription = root?.querySelector("[data-analysis-stage-description]");
    this.copyAnalysisButton = root?.querySelector("[data-analysis-copy-analysis]");
    this.loadButton = root?.querySelector("[data-analysis-load-csv]");
    this.loadInput = root?.querySelector("[data-analysis-load-csv-input]");
    this.saveButton = root?.querySelector("[data-analysis-save-csv]");
    this.rangeCheckBadge = root?.querySelector("[data-analysis-range-check]");
    this.testStatus = root?.querySelector("[data-analysis-test-status]");
    this.stageButtons = getElementsByDataValue(root, "analysisStageButton");
    this.stageDetails = getElementsByDataValue(root, "analysisStageDetail");
    this.stageValues = getElementsByDataValue(root, "analysisStageValue");
    this.rmsMetric = root?.querySelector("[data-analysis-rms]");
    this.samplesMetric = root?.querySelector("[data-analysis-samples]");
    this.slopeMetric = root?.querySelector("[data-analysis-slope]");
    this.slopeRatioMetric = root?.querySelector("[data-analysis-slope-ratio]");
    this.resizeObserver = null;
    this.observedChartRoots = new Set();
    this.activeAnalysisStage = null;
    this.unlockedStages = new Set();
    this.cachedFitLines = null;
    this.cachedFitRows = null;
    this.isProcessing = false;

    this.copyAnalysisButton?.addEventListener("click", () => this.copyAnalysis());
    this.loadButton?.addEventListener("click", () => this.loadInput?.click());
    this.loadInput?.addEventListener("change", () => this.loadCsvFile());
    this.saveButton?.addEventListener("click", () => this.saveCsv());
    this.stageButtons.forEach((button, stageId) => {
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.selectAnalysisStage(stageId);
      });
      button.addEventListener("click", (event) => {
        if (event.detail === 0) {
          this.selectAnalysisStage(stageId);
        }
      });
    });
    this.render();
  }

  addSampleFromModel(sampleContext) {
    const sample = this.dataset.addSampleFromModel(sampleContext);

    this.render();

    return sample;
  }

  addSample(sample) {
    const addedSample = this.dataset.addSample(sample);

    if (addedSample) {
      this.cachedFitLines = null;
      this.cachedFitRows = null;
      this.render();
    }

    return addedSample;
  }

  clear({ label = null } = {}) {
    this.dataset.clear({ label });
    this.cachedFitLines = null;
    this.cachedFitRows = null;
    this.render();
  }

  selectAnalysisStage(stageId) {
    if (this.isProcessing) return;
    if (!ANALYSIS_STAGE_IDS.includes(stageId) || stageId === this.activeAnalysisStage || !this.unlockedStages.has(stageId)) {
      return;
    }

    this.isProcessing = true;
    this.activeAnalysisStage = stageId;
    
    // Fast render to update the button and info text immediately
    const quickAnalysis = getDifferentialAmpModelAnalysis({
      dataset: this.dataset,
      fitRows: [],
      plottableSamples: [],
    });
    this.updateStageButtons(quickAnalysis);
    
    // Add processing state to the active button
    const button = this.stageButtons.get(stageId);
    if (button) {
      button.dataset.processing = "true";
    }

    const stageIndex = ANALYSIS_STAGE_IDS.indexOf(stageId);
    const nextStageId = stageIndex >= 0 && stageIndex < ANALYSIS_STAGE_IDS.length - 1 
      ? ANALYSIS_STAGE_IDS[stageIndex + 1] 
      : null;

    requestAnimationFrame(() => {
      setTimeout(() => {
        if (nextStageId && !this.unlockedStages.has(nextStageId)) {
          this.unlockedStages.add(nextStageId);
        }
        this.render();
        if (button) {
          button.dataset.processing = "false";
        }
        this.isProcessing = false;
      }, 10);
    });
  }

  setTestStatus({
    rangeCheck = false,
    running = false,
    status = "idle",
    test = null,
  } = {}) {
    const statusText = String(status ?? "idle");
    const testText = test ? `${test}: ${statusText}` : statusText;

    if (this.testStatus) {
      this.testStatus.textContent = testText;
      this.testStatus.dataset.running = String(Boolean(running));
    }

    if (this.rangeCheckBadge) {
      this.rangeCheckBadge.hidden = !rangeCheck;
    }
  }

  saveCsv() {
    const csv = this.dataset.toCsv();
    const posted = this.webView?.postSaveCsv?.({
      content: csv,
      filename: this.dataset.getCsvFilename(),
    }) ?? false;

    this.setBadge(posted
      ? (this.dataset.samples.length ? "CSV save requested" : "CSV header requested")
      : "save unavailable");
  }

  async loadCsvFile() {
    const file = this.loadInput?.files?.[0] ?? null;

    if (!file) {
      return;
    }

    try {
      const result = this.dataset.loadCsv({
        content: await file.text(),
        filename: file.name,
      });

      this.render();
      this.setBadge(`${result.imported} loaded${result.skipped ? `, ${result.skipped} skipped` : ""}`);
    } catch (error) {
      this.setBadge(error?.message || "load failed");
    } finally {
      if (this.loadInput) {
        this.loadInput.value = "";
      }
    }
  }

  async copyAnalysis() {
    const analysisCsv = this.getAnalysisCsv();
    const rows = getAnalysisFitRows(
      this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable),
    );

    try {
      await copyText(analysisCsv);
      this.setBadge(rows.length ? "analysis copied" : "analysis header copied");
    } catch {
      this.setBadge("copy failed");
    }
  }

  getAnalysisCsv() {
    return [
      ANALYSIS_CSV_HEADER,
      ...getAnalysisFitRows(
        this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable),
      ).map(formatAnalysisFitCsvRow),
    ].join("\n");
  }

  render() {
    const samples = this.dataset.getAnalysisSamples();
    
    if (samples.length > 0 && this.unlockedStages.size === 0) {
      this.unlockedStages.add(ANALYSIS_STAGE_SAMPLES);
    } else if (samples.length === 0) {
      this.unlockedStages.clear();
      this.activeAnalysisStage = null;
    }

    const plottableSamples = samples.filter((sample) => sample.isPlottable);
    const predictedSamples = plottableSamples.filter((sample) => (
      sample.plot?.kind === "sensor-comparison"
        && Number.isFinite(sample.sensorPredicted.sensor2)
    ));
    
    let fitLines = [];
    let fitRows = [];

    if (this.unlockedStages.has(ANALYSIS_STAGE_FITS)) {
      if (!this.cachedFitLines || !this.cachedFitRows) {
        this.cachedFitLines = getSweepFitLines(plottableSamples);
        this.cachedFitRows = getAnalysisFitRows(plottableSamples);
      }
      fitLines = this.cachedFitLines;
      fitRows = this.cachedFitRows;
    }

    const fit = getLinearFit(plottableSamples);
    const modelAnalysis = getDifferentialAmpModelAnalysis({
      dataset: this.dataset,
      fitRows,
      plottableSamples,
    });
    const axisRanges = getAxisRanges({ fitLines, plottableSamples, predictedSamples });

    this.updateMetrics({ fit, plottableSamples, samples });
    this.updateStageButtons(modelAnalysis);
    this.renderChart({ axisRanges, fitLines, plottableSamples, predictedSamples });
    this.renderStageChart(modelAnalysis);
  }

  updateMetrics({ fit, plottableSamples, samples }) {
    if (this.samplesMetric) {
      this.samplesMetric.textContent = String(samples.length);
    }

    if (this.slopeMetric) {
      this.slopeMetric.textContent = Number.isFinite(fit.slope)
        ? fit.slope.toFixed(3)
        : "-";
    }

    if (this.rmsMetric) {
      this.rmsMetric.textContent = formatMillivolts(fit.rms);
    }

    if (this.slopeRatioMetric) {
      this.slopeRatioMetric.textContent = formatRatio(
        getSlopeMultiplierRatio(this.dataset, fit, plottableSamples),
      );
    }

    this.setBadge(samples.length
      ? `${plottableSamples.length}/${samples.length} plotted`
      : "empty dataset");
  }

  updateStageButtons(modelAnalysis) {
    ANALYSIS_STAGE_IDS.forEach((stageId) => {
      const stage = modelAnalysis.stages.get(stageId);
      const button = this.stageButtons.get(stageId);
      const value = this.stageValues.get(stageId);
      const detail = this.stageDetails.get(stageId);
      const isUnlocked = this.unlockedStages.has(stageId);
      const active = stageId === this.activeAnalysisStage;

      if (button) {
        button.hidden = !isUnlocked;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }

      if (value) {
        value.textContent = stage?.value ?? "-";
      }

      if (detail) {
        detail.textContent = stage?.detail ?? "";
      }
    });

    const activeStage = this.activeAnalysisStage ? modelAnalysis.stages.get(this.activeAnalysisStage) : null;
    if (this.stageDescription) {
      this.stageDescription.hidden = !activeStage;
      this.stageDescription.innerHTML = activeStage?.description ?? "";
    }
  }

  setBadge(text) {
    if (this.badge) {
      this.badge.textContent = text;
    }
  }

  renderChart({ axisRanges, fitLines, plottableSamples, predictedSamples }) {
    if (!this.chartRoot) {
      return;
    }

    const plotLabels = getPlotLabels(plottableSamples);
    const predictionArrows = getPredictionArrowAnnotations(predictedSamples);
    const useSampleOrderColors = shouldColorBySampleOrder(plottableSamples);
    const traces = [
      {
        customdata: plottableSamples.map((sample) => [
          sample.wipers.top,
          sample.wipers.bot,
          sample.wipers.mid,
          sample.wipers.offset,
          sample.wipers.gain,
          formatHoverVoltage(sample.sensorPredicted.sensor2),
          formatHoverVoltage(sample.residuals.sensor2),
          formatSampleIndex(sample),
          formatHoverValue(sample.sensor2Previous),
          formatHoverValue(sample.sensor2Average),
          formatHoverValue(sample.samplesIgnored, 0),
          formatHoverValue(sample.samplesAveraged, 0),
          formatHoverValue(sample.sensor2RawDelta),
          formatHoverValue(sample.sensor2Step, 0),
        ]),
        hovertemplate: getHoverTemplate(plotLabels, plottableSamples),
        marker: {
          ...getMarkerColorSettings(plottableSamples, useSampleOrderColors),
          line: { color: "rgba(255, 255, 255, 0.72)", width: 0.8 },
          opacity: 0.86,
          size: 3,
        },
        mode: "markers",
        name: plotLabels.traceName,
        type: "scatter",
        x: plottableSamples.map((sample) => sample.plot.x),
        y: plottableSamples.map((sample) => sample.plot.y),
      },
      ...fitLines.map((fitLine) => ({
        hoverinfo: "skip",
        line: { color: fitLine.color, dash: "dot", width: 2 },
        mode: "lines",
        name: fitLine.name,
        type: "scatter",
        x: fitLine.lineX,
        y: fitLine.lineY,
      })),
    ];

    Plotly.react(this.chartRoot, traces, getChartLayout(axisRanges, predictionArrows, plotLabels), {
      displaylogo: false,
      responsive: true,
    });

    this.observeChartRoot(this.chartRoot);
  }

  renderStageChart(modelAnalysis) {
    if (!this.stageChartRoot) {
      return;
    }

    const stage = this.activeAnalysisStage ? modelAnalysis.stages.get(this.activeAnalysisStage) : null;

    if (!stage) {
      Plotly.purge(this.stageChartRoot);
      return;
    }

    Plotly.react(
      this.stageChartRoot,
      stage.traces ?? [],
      getStageChartLayout(stage),
      {
        displaylogo: false,
        responsive: true,
      },
    );

    this.observeChartRoot(this.stageChartRoot);
  }

  observeChartRoot(root) {
    if (!root || this.observedChartRoots.has(root)) {
      return;
    }

    this.resizeObserver ??= new ResizeObserver((entries) => {
      entries.forEach((entry) => Plotly.Plots.resize(entry.target));
    });
    this.resizeObserver.observe(root);
    this.observedChartRoots.add(root);
  }
}

function getElementsByDataValue(root, datasetKey) {
  const selector = `[data-${datasetKey.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}]`;

  return new Map(
    Array.from(root?.querySelectorAll(selector) ?? [])
      .map((element) => [element.dataset[datasetKey], element])
      .filter(([value]) => value),
  );
}

function getDifferentialAmpModelAnalysis({
  fitRows,
  plottableSamples,
}) {
  return {
    stages: new Map([
      [ANALYSIS_STAGE_SAMPLES, getInputSamplesStage(plottableSamples, fitRows)],
      [ANALYSIS_STAGE_FITS, getLineFitsStage(fitRows)],
      [ANALYSIS_STAGE_GAIN, getGainTermStage(fitRows)],
      [ANALYSIS_STAGE_OFFSET, getOffsetTermStage(fitRows)],
    ]),
  };
}

function getInputSamplesStage(samples, fitRows) {
  if (!fitRows || fitRows.length === 0) {
    return {
      detail: "No fits available",
      traces: [],
      value: "0",
      xTitle: "Effective Multiplier",
      yTitle: "Centre (V)",
    };
  }

  const validRows = fitRows.filter((row) => 
    Number.isFinite(row.computedMultiplier) && Number.isFinite(row.computedCentre)
  );

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
      marker: getStageMarker(validRows.map((row) => row.rms), "RMS", 7, [
        [0, "#7ee787"],
        [0.5, "#ffcf5a"],
        [1, "#ff7b72"],
      ]),
      mode: "markers",
      name: "reduced blocks",
      type: "scatter",
      x: validRows.map((row) => row.computedMultiplier),
      y: validRows.map((row) => row.computedCentre),
    },
  ];

  const avgMultiplier = validRows.length ? (validRows.reduce((a, b) => a + b.computedMultiplier, 0) / validRows.length) : null;

  return {
    description: `
      <p><strong>1: Linear Reduction</strong></p>
      <p>Reduces thousands of raw sensor samples into a single multiplier and centre voltage for each fixed Gain & Offset block.</p>
      <ul>
        <li><strong>Multiplier:</strong> derived from the negative slope (-m) of Sensor2 vs Sensor1.</li>
        <li><strong>Centre:</strong> derived from the intercept where Sensor1 equals Sensor2.</li>
      </ul>
      <p>Visualizing these blocks immediately flags bad hardware configurations with noisy or inactive linear fits (such as gains 0 and 1).</p>
    `,
    detail: `${validRows.length} reduced blocks`,
    traces,
    value: avgMultiplier !== null ? formatMultiplier(avgMultiplier) : "0",
    xTitle: "Effective Multiplier",
    yTitle: "Centre (V)",
  };
}

function getLineFitsStage(fitRows) {
  return {
    description: `
      <p><strong>2: Fit Multiplier from Gain</strong></p>
      <p>Pending implementation...</p>
    `,
    detail: "awaiting implementation",
    traces: [],
    value: "-",
    xTitle: "Gain Wiper",
    yTitle: "Effective Multiplier",
  };
}

function getGainTermStage(fitRows) {
  return {
    description: `
      <p><strong>3: Fit Centre from Offset</strong></p>
      <p>Pending implementation...</p>
    `,
    detail: "awaiting implementation",
    traces: [],
    value: "-",
    xTitle: "Offset Wiper",
    yTitle: "Centre (V)",
  };
}

function getOffsetTermStage(fitRows) {
  return {
    description: `
      <p><strong>4: Final Validation</strong></p>
      <p>Pending implementation...</p>
    `,
    detail: "awaiting implementation",
    traces: [],
    value: "-",
    xTitle: "-",
    yTitle: "-",
  };
}

function getStageMarker(values, colorbarTitle, size, colorscale = [
  [0, "#35c2ff"],
  [0.5, "#7ee787"],
  [1, "#ffcf5a"],
]) {
  const hasColorValues = values.some(Number.isFinite);

  return {
    color: values.map((value) => (Number.isFinite(value) ? value : 0)),
    colorbar: { outlinewidth: 0, thickness: 10, title: { side: "right", text: colorbarTitle } },
    colorscale,
    line: { color: "rgba(255, 255, 255, 0.72)", width: 0.8 },
    opacity: 0.88,
    showscale: hasColorValues,
    size,
  };
}

function getUniqueConfigCount(samples) {
  return new Set(samples.map((sample) => [
    sample.source,
    sample.ledLabel,
    sample.wipers?.gain,
    sample.wipers?.offset,
    sample.wipers?.top,
    sample.wipers?.bot,
  ].map((value) => String(value ?? "")).join("|"))).size;
}

function getAxisRanges({ fitLines, plottableSamples, predictedSamples }) {
  if (!plottableSamples.length) {
    return {
      x: EMPTY_AXIS_RANGE,
      y: EMPTY_AXIS_RANGE,
    };
  }

  return {
    x: getPaddedRange(plottableSamples.map((sample) => sample.plot.x)),
    y: getPaddedRange([
      ...plottableSamples.map((sample) => sample.plot.y),
      ...predictedSamples.map((sample) => sample.sensorPredicted.sensor2),
      ...fitLines.flatMap((fitLine) => fitLine.lineY),
    ]),
  };
}

function getPaddedRange(values) {
  const knownValues = values.filter(Number.isFinite);
  const min = Math.min(...knownValues);
  const max = Math.max(...knownValues);
  const padding = Math.max((max - min) * 0.08, 0.025);

  return [min - padding, max + padding];
}

function shouldColorBySampleOrder(samples) {
  return samples.length > 0
    && samples.every((sample) => sample.source === "mid-sweep")
    && samples.some((sample) => Number.isFinite(sample.sampleIndex));
}

function getMarkerColorSettings(samples, useSampleOrderColors) {
  if (!useSampleOrderColors) {
    const useGainColors = samples.length > 0
      && samples.every((sample) => sample.source === "test4");

    return {
      color: samples.map((sample) => (useGainColors ? sample.wipers.gain : sample.wipers.mid)),
      ...(useGainColors
        ? {
          colorbar: {
            len: 0.64,
            outlinewidth: 0,
            thickness: 10,
            title: { side: "right", text: "gain" },
          },
          showscale: true,
        }
        : {}),
      colorscale: [
        [0, "#35c2ff"],
        [0.5, "#7ee787"],
        [1, "#ffcf5a"],
      ],
    };
  }

  const sampleCounts = samples
    .map((sample) => sample.sampleCount)
    .filter(Number.isFinite);
  const maxSampleCount = Math.max(1, ...sampleCounts);

  return {
    cmax: maxSampleCount,
    cmin: 1,
    color: samples.map((sample) => sample.sampleIndex ?? 1),
    colorbar: {
      len: 0.64,
      outlinewidth: 0,
      thickness: 10,
      title: { side: "right", text: "sample" },
    },
    colorscale: [
      [0, "#35c2ff"],
      [0.5, "#7ee787"],
      [1, "#ffcf5a"],
    ],
    showscale: true,
  };
}

function getLinearFit(samples) {
  if (samples.length < 2) {
    return {
      intercept: null,
      lineX: [],
      lineY: [],
      rms: null,
      slope: null,
    };
  }

  const points = samples.map((sample) => ({
    x: sample.plot.x,
    y: sample.plot.y,
  }));
  const meanX = getMean(points.map((point) => point.x));
  const meanY = getMean(points.map((point) => point.y));
  const varianceX = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);

  if (!Number.isFinite(varianceX) || varianceX === 0) {
    return {
      intercept: null,
      lineX: [],
      lineY: [],
      rms: null,
      slope: null,
    };
  }

  const covariance = points.reduce(
    (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
    0,
  );
  const slope = covariance / varianceX;
  const intercept = meanY - slope * meanX;
  const residuals = points.map((point) => point.y - (slope * point.x + intercept));
  const lineX = getPaddedRange(points.map((point) => point.x));
  const lineY = lineX.map((x) => slope * x + intercept);

  return {
    intercept,
    lineX,
    lineY,
    rms: getRms(residuals),
    slope,
  };
}

function getSweepFitLines(samples) {
  return getSweepFitGroups(samples)
    .map((group, index) => ({
      ...getLinearFit(group.samples),
      color: FIT_LINE_COLORS[index % FIT_LINE_COLORS.length],
      name: group.name,
    }))
    .filter((fitLine) => fitLine.lineX.length && fitLine.lineY.length);
}

function getAnalysisFitRows(samples) {
  return getSweepFitGroups(samples)
    .map((group) => {
      const fit = getLinearFit(group.samples);
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

function getSweepFitGroups(samples) {
  const groupsByKey = new Map();

  samples.forEach((sample) => {
    const group = getSweepFitGroup(sample);

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

function getSweepFitGroup(sample) {
  const { wipers } = sample;

  if (sample.source === "mid-sweep") {
    return {
      key: getSweepFitKey(["mid", wipers.top, wipers.bot, wipers.offset, wipers.gain]),
      name: `mid fit offset ${formatWiper(wipers.offset)} gain ${formatWiper(wipers.gain)}`,
    };
  }

  if (sample.source === "gain-mid-sweep") {
    return {
      key: getSweepFitKey([
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
      key: getSweepFitKey(["offset", wipers.top, wipers.bot, wipers.offset, wipers.gain]),
      name: `offset ${formatWiper(wipers.offset)} fit`,
    };
  }

  if (sample.source === "test1") {
    return {
      key: getSweepFitKey([
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
      key: getSweepFitKey([
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
      key: getSweepFitKey([
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
      key: getSweepFitKey([
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

function getSweepFitKey(parts) {
  return parts.map((part) => String(part)).join("|");
}

function formatAnalysisFitCsvRow(row) {
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

function getPredictionArrowAnnotations(samples) {
  return samples.map((sample) => ({
    arrowcolor: "rgba(255, 123, 114, 0.72)",
    arrowhead: 2,
    arrowsize: 1,
    arrowwidth: 1.2,
    ax: sample.plot.x,
    axref: "x",
    ay: sample.plot.y,
    ayref: "y",
    captureevents: false,
    opacity: 0.72,
    showarrow: true,
    standoff: 1,
    text: "",
    x: sample.plot.x,
    xref: "x",
    y: sample.sensorPredicted.sensor2,
    yref: "y",
  }));
}

function getPlotLabels(samples) {
  const plot = samples.find((sample) => sample.plot)?.plot;

  return {
    hoverX: plot?.hoverXLabel ?? "Sensor1",
    hoverY: plot?.hoverYLabel ?? "actual Sensor2",
    kind: plot?.kind ?? "sensor-comparison",
    traceName: plot?.hoverYLabel ?? "Sensor2 actual",
    xAxis: plot?.xLabel ?? "Sensor1 (V)",
    yAxis: plot?.yLabel ?? "Sensor2 (V)",
  };
}

function getHoverTemplate(plotLabels, samples) {
  const hasDeltaDetails = samples.some((sample) => (
    sample.source === "test2" || sample.source === "test3" || sample.source === "test4"
  ));
  const lines = plotLabels.kind === "test2-delta"
    || plotLabels.kind === "test3-delta"
    || plotLabels.kind === "test4-delta"
    ? [
      `${plotLabels.hoverX} %{x:.0f}`,
      `${plotLabels.hoverY} %{y:.6f} V/count`,
    ]
    : [
      `${plotLabels.hoverX} %{x:.4f} V`,
      `${plotLabels.hoverY} %{y:.4f} V`,
    ];

  if (hasDeltaDetails) {
    lines.push(
      "previous Sensor2 %{customdata[8]} V",
      "average Sensor2 %{customdata[9]} V",
      "ignored samples %{customdata[10]}",
      "averaged samples %{customdata[11]}",
      "raw delta %{customdata[12]} V",
      "step %{customdata[13]}",
    );
  } else {
    lines.push(
      "predicted Sensor2 %{customdata[5]}",
      "residual %{customdata[6]}",
    );
  }

  lines.push(
    "mid %{customdata[2]}",
    "offset %{customdata[3]}",
    "gain %{customdata[4]}",
    "sample %{customdata[7]}",
    "<extra></extra>",
  );

  return lines.join("<br>");
}

function getChartLayout(axisRanges, annotations = [], plotLabels = getPlotLabels([])) {
  return {
    annotations,
    autosize: true,
    margin: { b: 54, l: 64, r: 28, t: 26 },
    paper_bgcolor: "rgba(0, 0, 0, 0)",
    plot_bgcolor: "rgba(8, 20, 28, 0.72)",
    showlegend: false,
    xaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: axisRanges.x,
      title: { font: { color: "#d7dde8" }, text: plotLabels.xAxis },
      zeroline: false,
    },
    yaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: axisRanges.y,
      title: { font: { color: "#d7dde8" }, text: plotLabels.yAxis },
      zeroline: false,
    },
  };
}

function getStageChartLayout(stage) {
  const traces = stage?.traces ?? [];

  return {
    autosize: true,
    margin: { b: 54, l: 64, r: 28, t: 26 },
    paper_bgcolor: "rgba(0, 0, 0, 0)",
    plot_bgcolor: "rgba(8, 20, 28, 0.72)",
    showlegend: false,
    xaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: getPaddedRangeOrDefault(getTraceNumbers(traces, "x"), [0, 1]),
      title: { font: { color: "#d7dde8" }, text: stage?.xTitle ?? "" },
      zeroline: false,
    },
    yaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: getPaddedRangeOrDefault(getTraceNumbers(traces, "y"), [0, 1]),
      title: { font: { color: "#d7dde8" }, text: stage?.yTitle ?? "" },
      zeroline: false,
    },
  };
}

function getFitRowsXAxis(rows) {
  if (rows.some((row) => Number.isFinite(row.diffAmpEffectiveMultiplier))) {
    return {
      getValue: (row) => row.diffAmpEffectiveMultiplier,
      label: "Diff amp multiplier",
    };
  }

  if (rows.some((row) => Number.isFinite(row.gain))) {
    return {
      getValue: (row) => row.gain,
      label: "Gain wiper",
    };
  }

  if (rows.some((row) => Number.isFinite(row.offset))) {
    return {
      getValue: (row) => row.offset,
      label: "Offset wiper",
    };
  }

  return {
    getValue: (_row, index) => index + 1,
    label: "Fit row",
  };
}

function getTraceNumbers(traces, key) {
  return traces.flatMap((trace) => Array.isArray(trace?.[key]) ? trace[key] : [])
    .filter(Number.isFinite);
}

function getPaddedRangeOrDefault(values, fallback) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return fallback;
  }

  return getPaddedRange(knownValues);
}

function getSlopeMultiplierRatio(dataset, fit, samples) {
  if (!Number.isFinite(fit.slope)) {
    return null;
  }

  if (samples.some((sample) => (
    sample.source === "test2" || sample.source === "test3" || sample.source === "test4"
  ))) {
    return null;
  }

  const multipliers = samples
    .map((sample) => dataset.sensorModel.gainRatioFromWiper(sample.wipers.gain))
    .filter(Number.isFinite);
  const multiplier = getMean(multipliers);

  return Number.isFinite(multiplier) && multiplier !== 0
    ? fit.slope / multiplier
    : null;
}

function getMean(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length;
}

function getKnownFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function getMinimum(values) {
  const knownValues = values.filter(Number.isFinite);

  return knownValues.length ? Math.min(...knownValues) : null;
}

function getSpan(values) {
  const knownValues = values.filter(Number.isFinite);

  return knownValues.length
    ? Math.max(...knownValues) - Math.min(...knownValues)
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

function formatMillivolts(value) {
  return Number.isFinite(value)
    ? `${(value * 1000).toFixed(1)} mV`
    : "-";
}

function formatVolts(value) {
  return Number.isFinite(value)
    ? `${value.toFixed(4)} V`
    : "-";
}

function formatRatio(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "-";
}

function formatHoverVoltage(value) {
  return Number.isFinite(value) ? `${value.toFixed(4)} V` : "---";
}

function formatHoverValue(value, fractionDigits = 6) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "---";
}

function formatSampleIndex(sample) {
  if (!Number.isFinite(sample?.sampleIndex)) {
    return "-";
  }

  return Number.isFinite(sample.sampleCount)
    ? `${sample.sampleIndex}/${sample.sampleCount}`
    : String(sample.sampleIndex);
}

function formatWiper(value) {
  const wiper = Number(value);

  return Number.isFinite(wiper) ? String(wiper) : "-";
}

function formatMultiplier(value) {
  return Number.isFinite(value) ? `x${value.toFixed(3)}` : "-";
}

function formatCsvNumber(value, fractionDigits = 9) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const number = Number(value);

  return Number.isFinite(number) ? number.toFixed(fractionDigits) : "";
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n\r]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    textarea.remove();
  }
}
