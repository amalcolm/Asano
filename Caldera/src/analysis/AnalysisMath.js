export const FIT_LINE_COLORS = Object.freeze([
  "rgba(255, 255, 255, 0.10)",
  "rgba(53, 194, 255, 0.10)",
  "rgba(126, 231, 135, 0.10)",
  "rgba(255, 207, 90, 0.10)",
  "rgba(255, 123, 114, 0.10)",
]);

export function getLinearFit(samples) {
  if (samples.length < 2) {
    return getEmptyFit();
  }

  const points = samples.map((sample) => ({
    x: sample.plot.x,
    y: sample.plot.y,
  }));
  const meanX = getMean(points.map((point) => point.x));
  const meanY = getMean(points.map((point) => point.y));
  const varianceX = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);

  if (!Number.isFinite(varianceX) || varianceX === 0) {
    return getEmptyFit();
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

export function getStageMarker(values, colorbarTitle, size, colorscale = [
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

export function formatMillivolts(value) {
  return Number.isFinite(value)
    ? `${(value * 1000).toFixed(1)} mV`
    : "-";
}

export function formatWiper(value) {
  const wiper = Number(value);

  return Number.isFinite(wiper) ? String(wiper) : "-";
}

export function formatMultiplier(value) {
  return Number.isFinite(value) ? `x${value.toFixed(3)}` : "-";
}

function getEmptyFit() {
  return {
    intercept: null,
    lineX: [],
    lineY: [],
    rms: null,
    slope: null,
  };
}

function getMean(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length;
}

function getPaddedRange(values) {
  const knownValues = values.filter(Number.isFinite);
  const min = Math.min(...knownValues);
  const max = Math.max(...knownValues);
  const padding = Math.max((max - min) * 0.08, 0.025);

  return [min - padding, max + padding];
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
