import Plotly from "plotly.js-dist-min";
import { AnalysisDataset } from "./AnalysisDataset.js";
import { formatMillivolts, getLinearFit } from "./AnalysisMath.js";
import { DifferentialAmp } from "./modelling/DifferentialAmp.js";

const EMPTY_AXIS_RANGE = [0, 3.3];

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
    this.stagesContainer = root?.querySelector("[data-analysis-stages-container]");
    this.stageButtons = new Map();
    this.stageDetails = new Map();
    this.stageValues = new Map();
    this.rmsMetric = root?.querySelector("[data-analysis-rms]");
    this.samplesMetric = root?.querySelector("[data-analysis-samples]");
    this.slopeMetric = root?.querySelector("[data-analysis-slope]");
    this.slopeRatioMetric = root?.querySelector("[data-analysis-slope-ratio]");

    this.model = new DifferentialAmp();
    this.resizeObserver = null;
    this.observedChartRoots = new Set();
    this.activeAnalysisStage = null;
    this.completedAnalysisStages = new Set();
    this.unlockedStages = new Set();
    this.isProcessing = false;

    this.loadButton?.addEventListener("click", () => {
      if (this.webView?.postRequestLoadCsv?.("")) {
        return;
      }

      this.loadInput?.click();
    });
    this.loadInput?.addEventListener("change", () => this.loadCsvFile());
    this.saveButton?.addEventListener("click", () => this.saveCsv());
    this.copyAnalysisButton?.addEventListener("click", () => this.copyAnalysis());
    this.renderStageButtons();
    this.render();
  }

  addSampleFromModel(sampleContext) {
    const sample = this.dataset.addSampleFromModel(sampleContext);

    this.model.clearCache();
    this.render();

    return sample;
  }

  addSample(sample) {
    const addedSample = this.dataset.addSample(sample);

    if (addedSample) {
      this.model.clearCache();
      this.render();
    }

    return addedSample;
  }

  clear({ label = null } = {}) {
    this.dataset.clear({ label });
    this.resetAnalysisState();
    this.render();
  }

  loadCsv({
    content,
    filename = "Dataset.csv",
  } = {}) {
    const result = this.dataset.loadCsv({ content, filename });

    this.resetAnalysisState();
    this.render();

    return result;
  }

  resetAnalysisState() {
    this.model.clearCache();
    this.activeAnalysisStage = null;
    this.completedAnalysisStages.clear();
    this.unlockedStages.clear();
    this.isProcessing = false;
    this.resetStageButtonSummaries();
  }

  resetStageButtonSummaries() {
    this.model.getStages().forEach((stage) => {
      const button = this.stageButtons.get(stage.id);
      const value = this.stageValues.get(stage.id);
      const detail = this.stageDetails.get(stage.id);

      if (button) {
        button.hidden = true;
        button.dataset.active = "false";
        button.dataset.processing = "false";
        button.setAttribute("aria-pressed", "false");
      }

      if (value) {
        value.textContent = "-";
      }

      if (detail) {
        detail.textContent = stage.defaultDetail;
      }
    });

    if (this.stageDescription) {
      this.stageDescription.hidden = true;
      this.stageDescription.innerHTML = "";
    }
  }

  selectAnalysisStage(stageId) {
    if (this.isProcessing) return;

    const stages = this.model.getStages();
    const stageIds = stages.map((stage) => stage.id);
    if (!stageIds.includes(stageId) || stageId === this.activeAnalysisStage || !this.unlockedStages.has(stageId)) {
      return;
    }

    this.isProcessing = true;
    this.activeAnalysisStage = stageId;
    if (this.completedAnalysisStages.has(stageId)) {
      this.render();
      this.isProcessing = false;
      return;
    }

    const button = this.stageButtons.get(stageId);
    if (button) {
      button.hidden = false;
      button.dataset.active = "true";
      button.dataset.processing = "true";
      button.setAttribute("aria-pressed", "true");
    }

    const stageIndex = stageIds.indexOf(stageId);
    const nextStageId = stageIndex >= 0 && stageIndex < stageIds.length - 1
      ? stageIds[stageIndex + 1]
      : null;

    requestAnimationFrame(() => {
      setTimeout(() => this.finishAnalysisStageSelection({ button, nextStageId, stageId }), 10);
    });
  }

  finishAnalysisStageSelection({ button, nextStageId, stageId }) {
    let renderResult = null;

    try {
      if (nextStageId && !this.unlockedStages.has(nextStageId)) {
        this.unlockedStages.add(nextStageId);
      }

      renderResult = this.render({ updateStageButtons: false });
    } catch (error) {
      this.setBadge(error?.message || "analysis failed");
      this.finishStageProcessing(button);
      return;
    }

    Promise.resolve(renderResult?.stageRender)
      .catch((error) => {
        this.setBadge(error?.message || "analysis failed");
      })
      .finally(() => {
        this.completedAnalysisStages.add(stageId);
        this.updateStageButtons(renderResult?.analysis?.stages);
        this.finishStageProcessing(button);
      });
  }

  finishStageProcessing(button) {
    if (button) {
      button.dataset.processing = "false";
    }

    this.isProcessing = false;
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
      const result = this.loadCsv({
        content: await file.text(),
        filename: file.name,
      });

      this.setBadge(`${result.imported} loaded${result.skipped ? `, ${result.skipped} skipped` : ""}`);
    } catch (error) {
      this.setBadge(error?.message || "load failed");
    } finally {
      this.loadInput.value = "";
    }
  }

  async copyAnalysis() {
    const analysisCsv = this.getAnalysisCsv();
    const rows = this.model.getAnalysisFitRows(
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
    return this.model.getAnalysisCsv(this.dataset.getAnalysisSamples());
  }

  render({ updateStageButtons = true } = {}) {
    const samples = this.dataset.getAnalysisSamples();

    const stageIds = this.model.getStages().map((stage) => stage.id);
    if (samples.length > 0 && this.unlockedStages.size === 0) {
      this.unlockedStages.add(stageIds[0]);
    } else if (samples.length === 0) {
      this.unlockedStages.clear();
      this.completedAnalysisStages.clear();
      this.activeAnalysisStage = null;
    }

    const plottableSamples = samples.filter((sample) => sample.isPlottable);
    const predictedSamples = plottableSamples.filter((sample) => (
      sample.plot?.kind === "sensor-comparison"
        && Number.isFinite(sample.sensorPredicted.sensor2)
    ));

    const analysis = this.model.getAnalysis(
      this.activeAnalysisStage,
      plottableSamples,
      this.unlockedStages,
      this.completedAnalysisStages,
    );
    const fit = getLinearFit(plottableSamples);
    const axisRanges = getAxisRanges({ fitLines: analysis.fitLines, plottableSamples, predictedSamples });

    this.updateMetrics({ fit, plottableSamples, samples });
    if (updateStageButtons) {
      this.updateStageButtons(analysis.stages);
    }
    const chartRender = this.renderChart({ axisRanges, fitLines: analysis.fitLines, plottableSamples, predictedSamples });
    const stageRender = this.renderStageChart(analysis.stage);

    return { analysis, chartRender, stageRender };
  }

  renderStageButtons() {
    if (!this.stagesContainer) return;

    // Keep the description element if it exists
    const descriptionEl = this.stagesContainer.querySelector("[data-analysis-stage-description]");
    this.stagesContainer.innerHTML = "";

    this.stageButtons.clear();
    this.stageValues.clear();
    this.stageDetails.clear();

    const stages = this.model.getStages();
    stages.forEach((stage) => {
      const button = document.createElement("button");
      button.className = `analysis-stage-button ${stage.isPrimary ? "analysis-stage-button--primary" : ""}`;
      button.type = "button";
      button.dataset.analysisStageButton = stage.id;

      const labelSpan = document.createElement("span");
      labelSpan.className = "analysis-stage-button__label";
      labelSpan.textContent = stage.label;

      const valueStrong = document.createElement("strong");
      valueStrong.dataset.analysisStageValue = stage.id;
      valueStrong.textContent = "-";

      const detailSpan = document.createElement("span");
      detailSpan.dataset.analysisStageDetail = stage.id;
      detailSpan.textContent = stage.defaultDetail;

      button.appendChild(labelSpan);
      button.appendChild(valueStrong);
      button.appendChild(detailSpan);

      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.selectAnalysisStage(stage.id);
      });
      button.addEventListener("click", (event) => {
        if (event.detail === 0) {
          this.selectAnalysisStage(stage.id);
        }
      });

      this.stagesContainer.appendChild(button);

      this.stageButtons.set(stage.id, button);
      this.stageValues.set(stage.id, valueStrong);
      this.stageDetails.set(stage.id, detailSpan);
    });

    if (descriptionEl) {
      this.stagesContainer.appendChild(descriptionEl);
      this.stageDescription = descriptionEl;
    }
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

  updateStageButtons(stageDataById) {
    const stages = this.model.getStages();
    const activeStageData = this.activeAnalysisStage
      ? stageDataById?.get(this.activeAnalysisStage) ?? null
      : null;

    stages.forEach((stage) => {
      const stageId = stage.id;
      const button = this.stageButtons.get(stageId);
      const value = this.stageValues.get(stageId);
      const detail = this.stageDetails.get(stageId);
      const isUnlocked = this.unlockedStages.has(stageId);
      const isCompleted = this.completedAnalysisStages.has(stageId);
      const active = stageId === this.activeAnalysisStage;
      const stageData = stageDataById?.get(stageId) ?? null;

      if (button) {
        button.hidden = !isUnlocked;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }

      if (value) {
        value.textContent = isUnlocked && isCompleted ? stageData?.value ?? "-" : "-";
      }

      if (detail) {
        detail.textContent = isUnlocked && isCompleted
          ? stageData?.detail ?? stage.defaultDetail
          : stage.defaultDetail;
      }
    });

    if (this.stageDescription) {
      this.stageDescription.hidden = !this.activeAnalysisStage;
      this.stageDescription.innerHTML = activeStageData?.description ?? "";
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

    const renderPromise = Plotly.react(this.chartRoot, traces, getChartLayout(axisRanges, predictionArrows, plotLabels), {
      displaylogo: false,
      responsive: true,
    });

    this.observeChartRoot(this.chartRoot);

    return renderPromise;
  }

  renderStageChart(activeStageData) {
    if (!this.stageChartRoot) {
      return;
    }

    if (!activeStageData) {
      return Plotly.purge(this.stageChartRoot);
    }

    const renderPromise = Plotly.react(
      this.stageChartRoot,
      activeStageData.traces ?? [],
      getStageChartLayout(activeStageData),
      {
        displaylogo: false,
        responsive: true,
      },
    );

    this.observeChartRoot(this.stageChartRoot);

    return renderPromise;
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
