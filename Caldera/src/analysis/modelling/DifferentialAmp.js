import {
  FIT_LINE_COLORS,
  formatMillivolts,
  formatMultiplier,
  formatWiper,
  getLinearFit,
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

export class DifferentialAmp {
  constructor() {
    this.cachedFitLines = null;
    this.cachedFitRows = null;
  }

  getStages() {
    return [
      { id: "samples", label: "1: Linear reduction", defaultDetail: "raw rows", isPrimary: true },
      { id: "fits", label: "2: Fit Multiplier", defaultDetail: "config rows" },
      { id: "gain", label: "3: Fit Centre", defaultDetail: "awaiting fits" },
      { id: "offset", label: "4: Final Validation", defaultDetail: "awaiting fits" },
    ];
  }

  clearCache() {
    this.cachedFitLines = null;
    this.cachedFitRows = null;
  }

  getAnalysis(stageId, plottableSamples, unlockedStages, completedStages = new Set()) {
    const summaryStageIds = new Set(completedStages);

    if (stageId) {
      summaryStageIds.add(stageId);
    }

    const needsFitRows = summaryStageIds.size > 0 || unlockedStages.has("fits");
    const fitRows = needsFitRows ? this.getCachedFitRows(plottableSamples) : [];
    const fitLines = unlockedStages.has("fits")
      ? this.getCachedFitLines(plottableSamples)
      : [];
    const stages = this.getStageSummaries(fitRows, summaryStageIds);

    return {
      fitLines,
      fitRows,
      stage: stageId ? stages.get(stageId) ?? null : null,
      stages,
    };
  }

  getStageSummaries(fitRows, unlockedStages) {
    return new Map(
      this.getStages()
        .filter((stage) => unlockedStages.has(stage.id))
        .map((stage) => [stage.id, this.getStage(stage.id, fitRows)]),
    );
  }

  getStage(stageId, fitRows) {
    switch (stageId) {
      case "samples":
        return this.getInputSamplesStage(fitRows);
      case "fits":
        return this.getLineFitsStage(fitRows);
      case "gain":
        return this.getGainTermStage(fitRows);
      case "offset":
        return this.getOffsetTermStage(fitRows);
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

    const avgMultiplier = validRows.length
      ? validRows.reduce((sum, row) => sum + row.computedMultiplier, 0) / validRows.length
      : null;

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

  getLineFitsStage(fitRows) {
    return {
      description: `
        <p><strong>2: Fit Multiplier from Gain</strong></p>
        <p>Pending implementation...</p>
      `,
      detail: fitRows.length ? `${fitRows.length} reduced blocks ready` : "awaiting stage 1",
      traces: [],
      value: fitRows.length ? String(fitRows.length) : "-",
      xTitle: "Gain Wiper",
      yTitle: "Effective Multiplier",
    };
  }

  getGainTermStage(fitRows) {
    return {
      description: `
        <p><strong>3: Fit Centre from Offset</strong></p>
        <p>Pending implementation...</p>
      `,
      detail: fitRows.length ? "awaiting implementation" : "awaiting stage 1",
      traces: [],
      value: "-",
      xTitle: "Offset Wiper",
      yTitle: "Centre (V)",
    };
  }

  getOffsetTermStage(fitRows) {
    return {
      description: `
        <p><strong>4: Final Validation</strong></p>
        <p>Pending implementation...</p>
      `,
      detail: fitRows.length ? "awaiting implementation" : "awaiting stage 1",
      traces: [],
      value: "-",
      xTitle: "-",
      yTitle: "-",
    };
  }

  // --- Modelling Logic ---

  getSweepFitLines(samples) {
    return this.getSweepFitGroups(samples)
      .map((group, index) => ({
        ...getLinearFit(group.samples),
        color: FIT_LINE_COLORS[index % FIT_LINE_COLORS.length],
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
