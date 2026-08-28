export function createGraphInteractionConfig(overrides = {}) {
  return {
    displaylogo: false,
    displayModeBar: true,
    doubleClick: "reset",
    modeBarButtonsToRemove: ["lasso2d", "select2d", "toggleSpikelines"],
    responsive: true,
    scrollZoom: true,
    ...overrides,
  };
}

export function createInteractiveAxis(axis = {}, defaults = {}) {
  return {
    fixedrange: false,
    ...defaults,
    ...axis,
  };
}

export function normaliseGraphViewState(viewState = {}) {
  return {
    xaxis: normaliseAxisView(viewState?.xaxis),
    yaxis: normaliseAxisView(viewState?.yaxis),
  };
}

export function updateGraphViewState(viewState, relayoutUpdate) {
  const next = normaliseGraphViewState(viewState);

  if (!relayoutUpdate || typeof relayoutUpdate !== "object") {
    return next;
  }

  ["xaxis", "yaxis"].forEach((axisName) => {
    const range = readRelayoutRange(relayoutUpdate, axisName);
    const autorange = relayoutUpdate[`${axisName}.autorange`];

    if (range) {
      next[axisName] = { autorange: false, range };
    } else if (autorange === true) {
      next[axisName] = { autorange: true };
    } else if (autorange === false) {
      next[axisName].autorange = false;
    }
  });

  return next;
}

export function applyGraphViewToAxis(axis = {}, view = {}) {
  const result = { ...axis };
  const normalisedView = normaliseAxisView(view);

  if (normalisedView.autorange === true) {
    delete result.range;
    result.autorange = true;
  } else if (normalisedView.range) {
    result.autorange = false;
    result.range = [...normalisedView.range];
  }

  return result;
}

export function createGraphViewRelayoutUpdate(viewState = {}) {
  const view = normaliseGraphViewState(viewState);
  const update = {};

  ["xaxis", "yaxis"].forEach((axisName) => {
    const axis = view[axisName];

    if (axis.autorange === true) {
      update[`${axisName}.autorange`] = true;
    } else if (axis.range) {
      update[`${axisName}.autorange`] = false;
      update[`${axisName}.range`] = [...axis.range];
    }
  });

  return update;
}

function normaliseAxisView(axisView) {
  if (!axisView || typeof axisView !== "object") {
    return {};
  }

  if (axisView.autorange === true) {
    return { autorange: true };
  }

  if (isRange(axisView.range)) {
    return {
      autorange: false,
      range: [...axisView.range],
    };
  }

  return axisView.autorange === false ? { autorange: false } : {};
}

function readRelayoutRange(update, axisName) {
  const combinedRange = update[`${axisName}.range`];

  if (isRange(combinedRange)) {
    return [...combinedRange];
  }

  const start = update[`${axisName}.range[0]`];
  const end = update[`${axisName}.range[1]`];

  return isRange([start, end]) ? [start, end] : null;
}

function isRange(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => (
      typeof coordinate === "string"
      || (typeof coordinate === "number" && Number.isFinite(coordinate))
    ));
}
