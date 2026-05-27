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
  } = {}) {
    this.dataset = dataset;
    this.root = root;
    this.badge = root?.querySelector("[data-analysis-badge]");
    this.chartRoot = root?.querySelector("[data-analysis-chart]");
    this.copyAnalysisButton = root?.querySelector("[data-analysis-copy-analysis]");
    this.copyButton = root?.querySelector("[data-analysis-copy-csv]");
    this.activeBreakdownPanel = null;
    this.gainBreakdown = root?.querySelector("[data-analysis-gain-breakdown]");
    this.test1Breakdown = root?.querySelector("[data-analysis-test1-breakdown]");
    this.rmsMetric = root?.querySelector("[data-analysis-rms]");
    this.samplesMetric = root?.querySelector("[data-analysis-samples]");
    this.slopeMetric = root?.querySelector("[data-analysis-slope]");
    this.slopeRatioMetric = root?.querySelector("[data-analysis-slope-ratio]");
    this.resizeObserver = null;

    this.copyAnalysisButton?.addEventListener("click", () => this.copyAnalysis());
    this.copyButton?.addEventListener("click", () => this.copyCsv());
    this.render();
  }

  addSampleFromModel(sampleContext) {
    const sample = this.dataset.addSampleFromModel(sampleContext);

    this.render();

    return sample;
  }

  clear({ label = null, panel = null } = {}) {
    this.dataset.clear({ label });
    this.activeBreakdownPanel = panel;
    this.render();
  }

  async copyCsv() {
    const csv = this.dataset.toCsv();

    try {
      await copyText(csv);
      this.setBadge(this.dataset.samples.length ? "CSV copied" : "CSV header copied");
    } catch {
      this.setBadge("copy failed");
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
    const plottableSamples = samples.filter((sample) => sample.isPlottable);
    const predictedSamples = plottableSamples.filter((sample) => (
      sample.plot?.kind === "sensor-comparison"
        && Number.isFinite(sample.sensorPredicted.sensor2)
    ));
    const fit = getLinearFit(plottableSamples);
    const fitLines = getSweepFitLines(plottableSamples);
    const axisRanges = getAxisRanges({ fitLines, plottableSamples, predictedSamples });

    this.updateMetrics({ fit, plottableSamples, samples });
    this.renderGainBreakdown(
      this.activeBreakdownPanel === "gain"
        ? getGainBreakdownRows(this.dataset, plottableSamples)
        : null,
    );
    this.renderTest1Breakdown(
      this.activeBreakdownPanel === "test1"
        ? getTest1BreakdownRows(plottableSamples)
        : null,
    );
    this.renderChart({ axisRanges, fitLines, plottableSamples, predictedSamples });
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

  setBadge(text) {
    if (this.badge) {
      this.badge.textContent = text;
    }
  }

  renderGainBreakdown(rows) {
    if (!this.gainBreakdown) {
      return;
    }

    if (!rows) {
      this.gainBreakdown.hidden = true;
      this.gainBreakdown.replaceChildren();
      return;
    }

    this.gainBreakdown.hidden = false;

    const title = document.createElement("span");
    title.className = "analysis-breakdown__title";
    title.textContent = "By gain";

    const grid = document.createElement("div");
    grid.className = "analysis-gain-table";

    ["wiper", "model x", "slope/gain", "n"].forEach((label) => {
      const cell = document.createElement("span");
      cell.className = "analysis-gain-table__head";
      cell.textContent = label;
      grid.append(cell);
    });

    if (rows.length) {
      rows.forEach((row) => {
        [
          formatGainWiper(row.gain),
          formatMultiplier(row.multiplier),
          formatRatio(row.slopeMultiplierRatio),
          String(row.samples),
        ].forEach((value) => {
          const cell = document.createElement("span");
          cell.textContent = value;
          grid.append(cell);
        });
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "analysis-gain-table__empty";
      empty.textContent = "-";
      grid.append(empty);
    }

    this.gainBreakdown.replaceChildren(title, grid);
  }

  renderTest1Breakdown(rows) {
    if (!this.test1Breakdown) {
      return;
    }

    if (!rows) {
      this.test1Breakdown.hidden = true;
      this.test1Breakdown.replaceChildren();
      return;
    }

    this.test1Breakdown.hidden = false;

    const title = document.createElement("span");
    title.className = "analysis-breakdown__title";
    title.textContent = "Test1";

    const grid = document.createElement("div");
    grid.className = "analysis-test1-table";

    ["LEDs", "slope", "RMS", "err", "n"].forEach((label) => {
      const cell = document.createElement("span");
      cell.className = "analysis-test1-table__head";
      cell.textContent = label;
      grid.append(cell);
    });

    if (rows.length) {
      rows.forEach((row) => {
        [
          row.ledLabel,
          formatRatio(row.slope),
          formatMillivolts(row.rms),
          formatMillivolts(row.meanResidual),
          String(row.samples),
        ].forEach((value) => {
          const cell = document.createElement("span");
          cell.textContent = value;
          grid.append(cell);
        });
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "analysis-test1-table__empty";
      empty.textContent = "-";
      grid.append(empty);
    }

    this.test1Breakdown.replaceChildren(title, grid);
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

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => Plotly.Plots.resize(this.chartRoot));
      this.resizeObserver.observe(this.chartRoot);
    }
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

      return {
        bot: firstSample?.wipers.bot,
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
    legend: {
      font: { color: "#d7dde8", size: 12 },
      orientation: "h",
      x: 0,
      y: 1.08,
    },
    margin: { b: 54, l: 64, r: 28, t: 42 },
    paper_bgcolor: "rgba(0, 0, 0, 0)",
    plot_bgcolor: "rgba(8, 20, 28, 0.72)",
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

function getGainBreakdownRows(dataset, samples) {
  const samplesByGain = new Map();

  samples.forEach((sample) => {
    if (sample.source !== "gain-mid-sweep") {
      return;
    }

    const gain = Number(sample.wipers.gain);

    if (!Number.isFinite(gain)) {
      return;
    }

    if (!samplesByGain.has(gain)) {
      samplesByGain.set(gain, []);
    }

    samplesByGain.get(gain).push(sample);
  });

  return Array.from(samplesByGain, ([gain, gainSamples]) => {
    const fit = getLinearFit(gainSamples);
    const multipliers = gainSamples
      .map((sample) => dataset.sensorModel.gainRatioFromWiper(sample.wipers.gain))
      .filter(Number.isFinite);

    return {
      gain,
      multiplier: getMean(multipliers),
      samples: gainSamples.length,
      slopeMultiplierRatio: getSlopeMultiplierRatio(dataset, fit, gainSamples),
    };
  }).sort((a, b) => a.gain - b.gain);
}

function getTest1BreakdownRows(samples) {
  const samplesByLedLabel = new Map();

  samples.forEach((sample) => {
    if (sample.source !== "test1") {
      return;
    }

    const ledLabel = sample.ledLabel || "off";

    if (!samplesByLedLabel.has(ledLabel)) {
      samplesByLedLabel.set(ledLabel, []);
    }

    samplesByLedLabel.get(ledLabel).push(sample);
  });

  return Array.from(samplesByLedLabel, ([ledLabel, ledSamples]) => {
    const fit = getLinearFit(ledSamples);

    return {
      ledLabel,
      meanResidual: getMean(ledSamples.map((sample) => sample.residuals.sensor2)),
      rms: fit.rms,
      samples: ledSamples.length,
      slope: fit.slope,
    };
  });
}

function getMean(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length;
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

function formatRatio(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "-";
}

function formatGainWiper(value) {
  return Number.isFinite(value) ? String(value) : "-";
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
