import Plotly from "plotly.js-dist-min";

export class SimulationVoltageGraph {
  constructor(root) {
    if (!root) {
      throw new Error("A graph element is required for the Simulation voltage graph.");
    }

    this.root = root;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.started) {
        Plotly.Plots.resize(this.root);
      }
    });
    this.presentation = {
      ariaLabel: "ThreePot voltage sweep graph",
      title: "ThreePot voltage sweep",
      xAxisTitle: "Sweep position",
    };
    this.series = normaliseSeries();
    this.seriesIndexById = makeSeriesIndex(this.series);
    this.started = false;
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    const renderPromise = this.render();

    this.resizeObserver.observe(this.root);
    return renderPromise;
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.resizeObserver.disconnect();
    Plotly.purge(this.root);
  }

  clear() {
    if (!this.started) {
      return Promise.resolve();
    }

    const traceIndices = this.series.map((_, index) => index);

    return Plotly.restyle(this.root, {
      text: traceIndices.map(() => []),
      x: traceIndices.map(() => []),
      y: traceIndices.map(() => []),
    }, traceIndices);
  }

  prepareSweep({ ariaLabel, series, title, xAxisTitle } = {}) {
    this.presentation = {
      ariaLabel: ariaLabel ?? "ThreePot voltage sweep graph",
      title: title ?? "ThreePot voltage sweep",
      xAxisTitle: xAxisTitle ?? "Sweep position",
    };
    this.series = normaliseSeries(series);
    this.seriesIndexById = makeSeriesIndex(this.series);
    this.root.setAttribute("aria-label", this.presentation.ariaLabel);

    if (!this.started) {
      return Promise.resolve();
    }

    return this.render();
  }

  setPresentation({ ariaLabel, title, xAxisTitle } = {}) {
    this.presentation = {
      ariaLabel: ariaLabel ?? this.presentation.ariaLabel,
      title: title ?? this.presentation.title,
      xAxisTitle: xAxisTitle ?? this.presentation.xAxisTitle,
    };
    this.root.setAttribute("aria-label", this.presentation.ariaLabel);

    if (!this.started) {
      return Promise.resolve();
    }

    return Plotly.relayout(this.root, {
      "title.text": this.presentation.title,
      "xaxis.title.text": this.presentation.xAxisTitle,
    });
  }

  appendSamples(samples) {
    if (!this.started || !Array.isArray(samples) || samples.length === 0) {
      return Promise.resolve();
    }

    const samplesByTrace = new Map();

    samples.forEach((sample) => {
      if (!Number.isFinite(sample?.wiper) || !Number.isFinite(sample?.voltage)) {
        return;
      }

      const seriesId = String(sample.seriesId ?? this.series[0]?.id);
      const traceIndex = this.seriesIndexById.get(seriesId);

      if (traceIndex === undefined) {
        return;
      }

      if (!samplesByTrace.has(traceIndex)) {
        samplesByTrace.set(traceIndex, []);
      }

      samplesByTrace.get(traceIndex).push(sample);
    });

    if (samplesByTrace.size === 0) {
      return Promise.resolve();
    }

    const traceIndices = [...samplesByTrace.keys()].sort((left, right) => left - right);
    const groupedSamples = traceIndices.map((traceIndex) => (
      samplesByTrace.get(traceIndex)
    ));

    return Plotly.extendTraces(this.root, {
      text: groupedSamples.map((traceSamples) => traceSamples.map((sample) => (
        sample.label ?? `Sweep ${sample.wiper}`
      ))),
      x: groupedSamples.map((traceSamples) => (
        traceSamples.map((sample) => sample.wiper)
      )),
      y: groupedSamples.map((traceSamples) => (
        traceSamples.map((sample) => sample.voltage)
      )),
    }, traceIndices);
  }

  render() {
    const showLegend = this.series.length > 1;

    return Plotly.react(
      this.root,
      this.series.map((series) => ({
        hovertemplate: "%{text}<br>Voltage %{y:.3f} V<extra></extra>",
        line: {
          color: series.color,
          width: showLegend ? 2 : 2.5,
        },
        marker: {
          color: series.color,
          size: 7,
        },
        mode: series.mode,
        name: series.name,
        text: [],
        type: "scatter",
        x: [],
        y: [],
      })),
      {
        autosize: true,
        dragmode: false,
        legend: {
          bgcolor: "rgba(8, 20, 28, 0.78)",
          bordercolor: "rgba(184, 194, 214, 0.18)",
          borderwidth: 1,
          font: { color: "#d7dde8", size: 10 },
          traceorder: "normal",
          x: 1.01,
          xanchor: "left",
          y: 1,
          yanchor: "top",
        },
        margin: { b: 60, l: 70, r: showLegend ? 112 : 34, t: 48 },
        paper_bgcolor: "rgba(0, 0, 0, 0)",
        plot_bgcolor: "rgba(8, 20, 28, 0.72)",
        showlegend: showLegend,
        title: {
          font: { color: "#edf4ff", size: 14 },
          text: this.presentation.title,
          x: 0.02,
          xanchor: "left",
        },
        xaxis: {
          color: "#b8c2d6",
          fixedrange: true,
          gridcolor: "rgba(184, 194, 214, 0.14)",
          range: [0, 255],
          title: {
            font: { color: "#d7dde8" },
            text: this.presentation.xAxisTitle,
          },
          zeroline: false,
        },
        yaxis: {
          autorange: false,
          color: "#b8c2d6",
          dtick: 0.1,
          fixedrange: true,
          gridcolor: "rgba(184, 194, 214, 0.14)",
          range: [0, 0.62],
          tickformat: ".2f",
          ticksuffix: " V",
          title: { font: { color: "#d7dde8" }, text: "Voltage" },
          zeroline: false,
        },
      },
      {
        displaylogo: false,
        displayModeBar: false,
        responsive: true,
        scrollZoom: false,
      },
    );
  }
}

function normaliseSeries(series) {
  const definitions = Array.isArray(series) && series.length > 0
    ? series
    : [{ color: "#8fc7ff", id: "output", name: "Mid output voltage" }];
  const seenIds = new Set();

  return definitions.map((definition, index) => {
    const id = String(definition?.id ?? `series-${index}`);

    if (seenIds.has(id)) {
      throw new Error(`Duplicate Simulation graph series id: ${id}`);
    }

    seenIds.add(id);

    return {
      color: definition?.color ?? "#8fc7ff",
      id,
      mode: definition?.mode ?? "lines",
      name: definition?.name ?? `Series ${index + 1}`,
    };
  });
}

function makeSeriesIndex(series) {
  return new Map(series.map((definition, index) => [definition.id, index]));
}
