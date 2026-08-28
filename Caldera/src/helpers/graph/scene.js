import Plotly from "plotly.js-dist-min";
import {
  applyGraphViewToAxis,
  createGraphViewRelayoutUpdate,
  createGraphInteractionConfig,
  createInteractiveAxis,
  normaliseGraphViewState,
  updateGraphViewState,
} from "./interaction.js";
import {
  cloneGraphValue,
  isRecord,
  makeSeriesIndex,
  normaliseGraphPoints,
  normaliseGraphSeries,
  requireElement,
} from "./utilities.js";

const DEFAULT_PRESENTATION = Object.freeze({
  ariaLabel: "Interactive graph",
  title: "Graph",
  xAxisTitle: "x",
  yAxisTitle: "y",
});

export class FloatingGraphScene {
  constructor(root, {
    ariaLabel = DEFAULT_PRESENTATION.ariaLabel,
    config = {},
    layout = {},
    onRender = null,
    series = null,
    title = DEFAULT_PRESENTATION.title,
    onViewStateChange = null,
    xAxis = {},
    xAxisTitle = DEFAULT_PRESENTATION.xAxisTitle,
    yAxis = {},
    yAxisTitle = DEFAULT_PRESENTATION.yAxisTitle,
  } = {}) {
    this.root = requireElement(root, "floating-graph scene");
    this.onRender = onRender;
    this.onViewStateChange = onViewStateChange;
    this.defaults = {
      config: isRecord(config) ? cloneGraphValue(config) : {},
      layout: isRecord(layout) ? cloneGraphValue(layout) : {},
      presentation: {
        ariaLabel: String(ariaLabel),
        title: String(title),
        xAxisTitle: String(xAxisTitle),
        yAxisTitle: String(yAxisTitle),
      },
      series: normaliseGraphSeries(series),
      xAxis: normaliseAxis(xAxis, xAxisTitle),
      yAxis: normaliseAxis(yAxis, yAxisTitle),
    };
    this.state = this.createInitialState();
    this.seriesIndexById = makeSeriesIndex(this.state.series);
    this.plotQueue = Promise.resolve();
    this.started = false;
    this.handleRelayout = this.handleRelayout.bind(this);
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.resize())
      : null;

    this.syncAriaLabel();
  }

  start() {
    if (this.started) {
      return this.plotQueue;
    }

    this.started = true;
    this.resizeObserver?.observe(this.root);
    return this.render();
  }

  stop() {
    if (!this.started) {
      return this.plotQueue;
    }

    this.started = false;
    this.resizeObserver?.disconnect();
    this.plotQueue = this.plotQueue
      .catch(() => undefined)
      .then(() => {
        this.unbindRelayout();
        return Plotly.purge(this.root);
      });

    return this.plotQueue;
  }

  prepare({
    ariaLabel,
    config,
    layout,
    series,
    title,
    xAxis,
    xAxisTitle,
    yAxis,
    yAxisTitle,
  } = {}) {
    const nextXAxisTitle = xAxisTitle ?? this.defaults.presentation.xAxisTitle;
    const nextYAxisTitle = yAxisTitle ?? this.defaults.presentation.yAxisTitle;

    this.state = {
      config: mergeRecords(this.defaults.config, config),
      layout: mergeRecords(this.defaults.layout, layout),
      presentation: {
        ariaLabel: String(ariaLabel ?? this.defaults.presentation.ariaLabel),
        title: String(title ?? this.defaults.presentation.title),
        xAxisTitle: String(nextXAxisTitle),
        yAxisTitle: String(nextYAxisTitle),
      },
      series: normaliseGraphSeries(series, this.defaults.series),
      version: 1,
      view: normaliseGraphViewState(),
      viewRevision: this.state.viewRevision + 1,
      xAxis: normaliseAxis(
        mergeRecords(this.defaults.xAxis, xAxis),
        nextXAxisTitle,
      ),
      yAxis: normaliseAxis(
        mergeRecords(this.defaults.yAxis, yAxis),
        nextYAxisTitle,
      ),
    };
    this.seriesIndexById = makeSeriesIndex(this.state.series);
    this.syncAriaLabel();

    return this.render();
  }

  clear() {
    this.state.series.forEach((series) => {
      series.text = [];
      series.x = [];
      series.y = [];
    });

    if (!this.started) {
      return Promise.resolve();
    }

    const traceIndices = this.state.series.map((_, index) => index);
    const update = {
      text: traceIndices.map(() => []),
      x: traceIndices.map(() => []),
      y: traceIndices.map(() => []),
    };

    return this.queuePlot(() => Plotly.restyle(this.root, update, traceIndices));
  }

  setPresentation({ ariaLabel, title, xAxisTitle, yAxisTitle } = {}) {
    this.state.presentation = {
      ariaLabel: String(ariaLabel ?? this.state.presentation.ariaLabel),
      title: String(title ?? this.state.presentation.title),
      xAxisTitle: String(xAxisTitle ?? this.state.presentation.xAxisTitle),
      yAxisTitle: String(yAxisTitle ?? this.state.presentation.yAxisTitle),
    };
    this.state.xAxis = normaliseAxis(
      this.state.xAxis,
      this.state.presentation.xAxisTitle,
    );
    this.state.yAxis = normaliseAxis(
      this.state.yAxis,
      this.state.presentation.yAxisTitle,
    );
    this.syncAriaLabel();

    if (!this.started) {
      return Promise.resolve();
    }

    return this.queuePlot(() => Plotly.relayout(this.root, {
      "title.text": this.state.presentation.title,
      "xaxis.title.text": this.state.presentation.xAxisTitle,
      "yaxis.title.text": this.state.presentation.yAxisTitle,
    }));
  }

  appendPoints(points, { normalised = false } = {}) {
    const knownPoints = normalised ? points : normaliseGraphPoints(points);
    const pointsByTrace = new Map();

    knownPoints.forEach((point) => {
      const seriesId = String(point.seriesId ?? this.state.series[0]?.id);
      const traceIndex = this.seriesIndexById.get(seriesId);

      if (traceIndex === undefined) {
        return;
      }

      if (!pointsByTrace.has(traceIndex)) {
        pointsByTrace.set(traceIndex, []);
      }

      pointsByTrace.get(traceIndex).push(point);

      const trace = this.state.series[traceIndex];

      trace.text.push(point.text ?? "");
      trace.x.push(point.x);
      trace.y.push(point.y);
    });

    if (pointsByTrace.size === 0 || !this.started) {
      return Promise.resolve();
    }

    const traceIndices = [...pointsByTrace.keys()].sort((left, right) => left - right);
    const groupedPoints = traceIndices.map((traceIndex) => pointsByTrace.get(traceIndex));
    const update = {
      text: groupedPoints.map((tracePoints) => tracePoints.map((point) => point.text)),
      x: groupedPoints.map((tracePoints) => tracePoints.map((point) => point.x)),
      y: groupedPoints.map((tracePoints) => tracePoints.map((point) => point.y)),
    };

    return this.queuePlot(() => Plotly.extendTraces(this.root, update, traceIndices));
  }

  getSnapshot() {
    return cloneGraphValue(this.state);
  }

  getViewState() {
    return cloneGraphValue(this.state.view);
  }

  setViewState(viewState) {
    this.state.view = normaliseGraphViewState(viewState);

    if (!this.started) {
      return Promise.resolve();
    }

    const update = createGraphViewRelayoutUpdate(this.state.view);

    if (Object.keys(update).length === 0) {
      return Promise.resolve();
    }

    return this.queuePlot(() => Plotly.relayout(this.root, update));
  }

  restoreSnapshot(snapshot) {
    if (!isRecord(snapshot)) {
      throw new TypeError("A floating-graph snapshot is required.");
    }

    const presentation = isRecord(snapshot.presentation)
      ? snapshot.presentation
      : {};

    this.state = {
      config: mergeRecords(this.defaults.config, snapshot.config),
      layout: mergeRecords(this.defaults.layout, snapshot.layout),
      presentation: {
        ariaLabel: String(
          presentation.ariaLabel ?? this.defaults.presentation.ariaLabel,
        ),
        title: String(presentation.title ?? this.defaults.presentation.title),
        xAxisTitle: String(
          presentation.xAxisTitle ?? this.defaults.presentation.xAxisTitle,
        ),
        yAxisTitle: String(
          presentation.yAxisTitle ?? this.defaults.presentation.yAxisTitle,
        ),
      },
      series: normaliseGraphSeries(snapshot.series, this.defaults.series),
      version: 1,
      view: normaliseGraphViewState(snapshot.view),
      viewRevision: Number.isInteger(snapshot.viewRevision)
        ? snapshot.viewRevision
        : this.state.viewRevision + 1,
      xAxis: normaliseAxis(
        mergeRecords(this.defaults.xAxis, snapshot.xAxis),
        presentation.xAxisTitle ?? this.defaults.presentation.xAxisTitle,
      ),
      yAxis: normaliseAxis(
        mergeRecords(this.defaults.yAxis, snapshot.yAxis),
        presentation.yAxisTitle ?? this.defaults.presentation.yAxisTitle,
      ),
    };
    this.seriesIndexById = makeSeriesIndex(this.state.series);
    this.syncAriaLabel();

    return this.render();
  }

  render() {
    if (!this.started) {
      return Promise.resolve();
    }

    const traces = this.state.series.map((series) => buildTrace(series));
    const layout = this.buildLayout();
    const config = createGraphInteractionConfig(this.state.config);

    return this.queuePlot(async () => {
      const result = await Plotly.react(this.root, traces, layout, config);

      this.bindRelayout();

      if (typeof this.onRender === "function") {
        this.onRender(this);
      }

      return result;
    });
  }

  resize() {
    if (!this.started) {
      return Promise.resolve();
    }

    return this.queuePlot(() => Plotly.Plots.resize(this.root));
  }

  buildLayout() {
    const showLegend = this.state.series.length > 1;
    const layout = this.state.layout;
    const margin = {
      b: 60,
      l: 70,
      r: showLegend ? 112 : 34,
      t: 48,
      ...(isRecord(layout.margin) ? layout.margin : {}),
    };
    const title = {
      font: { color: "#edf4ff", size: 14 },
      x: 0.02,
      xanchor: "left",
      ...normaliseTitle(layout.title),
      text: this.state.presentation.title,
    };
    const xAxis = applyGraphViewToAxis(createInteractiveAxis(
      mergeRecords(this.state.xAxis, layout.xaxis),
      {
        color: "#b8c2d6",
        gridcolor: "rgba(184, 194, 214, 0.14)",
        zeroline: false,
      },
    ), this.state.view.xaxis);
    const yAxis = applyGraphViewToAxis(createInteractiveAxis(
      mergeRecords(this.state.yAxis, layout.yaxis),
      {
        color: "#b8c2d6",
        gridcolor: "rgba(184, 194, 214, 0.14)",
        zeroline: false,
      },
    ), this.state.view.yaxis);

    return {
      autosize: true,
      dragmode: "zoom",
      paper_bgcolor: "rgba(0, 0, 0, 0)",
      plot_bgcolor: "rgba(8, 20, 28, 0.72)",
      ...layout,
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
        ...(isRecord(layout.legend) ? layout.legend : {}),
      },
      margin,
      showlegend: layout.showlegend ?? showLegend,
      title,
      uirevision: `floating-graph-${this.state.viewRevision}`,
      xaxis: withAxisTitle(xAxis, this.state.presentation.xAxisTitle),
      yaxis: withAxisTitle(yAxis, this.state.presentation.yAxisTitle),
    };
  }

  createInitialState() {
    return {
      config: cloneGraphValue(this.defaults.config),
      layout: cloneGraphValue(this.defaults.layout),
      presentation: cloneGraphValue(this.defaults.presentation),
      series: normaliseGraphSeries(this.defaults.series),
      version: 1,
      view: normaliseGraphViewState(),
      viewRevision: 0,
      xAxis: cloneGraphValue(this.defaults.xAxis),
      yAxis: cloneGraphValue(this.defaults.yAxis),
    };
  }

  syncAriaLabel() {
    this.root.setAttribute("aria-label", this.state.presentation.ariaLabel);
    this.root.setAttribute("role", "group");
  }

  handleRelayout(update) {
    this.state.view = updateGraphViewState(this.state.view, update);

    if (typeof this.onViewStateChange === "function") {
      this.onViewStateChange(this.getViewState());
    }
  }

  bindRelayout() {
    if (typeof this.root.on !== "function") {
      return;
    }

    this.unbindRelayout();
    this.root.on("plotly_relayout", this.handleRelayout);
  }

  unbindRelayout() {
    this.root.removeListener?.("plotly_relayout", this.handleRelayout);
  }

  queuePlot(operation) {
    this.plotQueue = this.plotQueue
      .catch(() => undefined)
      .then(() => {
        if (!this.started) {
          return undefined;
        }

        return operation();
      });

    return this.plotQueue;
  }
}

function buildTrace(series) {
  const trace = isRecord(series.trace) ? cloneGraphValue(series.trace) : {};

  return {
    ...trace,
    hovertemplate: series.hoverTemplate,
    line: {
      ...(isRecord(trace.line) ? trace.line : {}),
      color: series.color,
      width: series.lineWidth,
    },
    marker: {
      ...(isRecord(trace.marker) ? trace.marker : {}),
      color: series.color,
      size: series.markerSize,
    },
    mode: series.mode,
    name: series.name,
    text: [...series.text],
    type: trace.type ?? "scatter",
    x: [...series.x],
    y: [...series.y],
  };
}

function normaliseAxis(axis, title) {
  const source = isRecord(axis) ? cloneGraphValue(axis) : {};

  return withAxisTitle(source, title);
}

function withAxisTitle(axis, title) {
  return {
    ...axis,
    title: {
      font: { color: "#d7dde8" },
      ...normaliseTitle(axis.title),
      text: String(title),
    },
  };
}

function normaliseTitle(title) {
  if (typeof title === "string") {
    return { text: title };
  }

  return isRecord(title) ? cloneGraphValue(title) : {};
}

function mergeRecords(base, override) {
  return {
    ...(isRecord(base) ? cloneGraphValue(base) : {}),
    ...(isRecord(override) ? cloneGraphValue(override) : {}),
  };
}
