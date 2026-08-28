export const FLOATING_GRAPH_VIEW = "floating-graph";
export const FLOATING_GRAPH_PROTOCOL = "caldera:floating-graph:v1";
export const FLOATING_GRAPH_CHANNEL_PREFIX = "caldera:floating-graph";

const DEFAULT_POPUP_WIDTH = 1280;
const DEFAULT_POPUP_HEIGHT = 850;
const POPUP_SCREEN_MARGIN = 32;

export function createGraphId(prefix = "graph") {
  const safePrefix = String(prefix).replace(/[^a-z0-9_-]+/gi, "-") || "graph";
  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${safePrefix}-${randomPart}`;
}

export function createGraphPopupUrl(graphId, baseUrl = window.location.href) {
  const id = requireNonEmptyString(graphId, "graphId");
  const url = new URL(baseUrl);

  url.search = "";
  url.hash = "";
  url.searchParams.set("view", FLOATING_GRAPH_VIEW);
  url.searchParams.set("graphId", id);

  return url.href;
}

export function readGraphPopupOptions(search = window.location.search) {
  const params = new URLSearchParams(search);
  const graphId = params.get("graphId")?.trim() ?? "";

  if (!graphId) {
    return null;
  }

  return { graphId };
}

export function createGraphPopupFeatures({
  height = DEFAULT_POPUP_HEIGHT,
  width = DEFAULT_POPUP_WIDTH,
} = {}, screenRef = window.screen) {
  const availableWidth = getPositiveNumber(screenRef?.availWidth, width);
  const availableHeight = getPositiveNumber(screenRef?.availHeight, height);
  const availableLeft = getFiniteNumber(screenRef?.availLeft, 0);
  const availableTop = getFiniteNumber(screenRef?.availTop, 0);
  const popupWidth = clampDimension(width, availableWidth);
  const popupHeight = clampDimension(height, availableHeight);
  const left = Math.round(availableLeft + (availableWidth - popupWidth) / 2);
  const top = Math.round(availableTop + (availableHeight - popupHeight) / 2);

  return [
    "popup=yes",
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=no",
  ].join(",");
}

export function getGraphPopupWindowName(graphId) {
  return `caldera-floating-graph-${String(graphId).replace(/[^a-z0-9_-]+/gi, "-")}`;
}

export function cloneGraphValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

export function normaliseGraphPoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.flatMap((point) => {
    if (!isRecord(point) || !isCoordinate(point.x) || !isCoordinate(point.y)) {
      return [];
    }

    const normalised = {
      text: String(point.text ?? point.label ?? ""),
      x: point.x,
      y: point.y,
    };

    if (point.seriesId !== undefined && point.seriesId !== null) {
      normalised.seriesId = String(point.seriesId);
    }

    return [normalised];
  });
}

export function normaliseGraphSeries(series, fallbackSeries = null) {
  const fallback = Array.isArray(fallbackSeries) && fallbackSeries.length > 0
    ? fallbackSeries
    : [{ color: "#8fc7ff", id: "output", name: "Output" }];
  const definitions = Array.isArray(series) && series.length > 0
    ? series
    : fallback;
  const seenIds = new Set();

  return definitions.map((definition, index) => {
    const source = isRecord(definition) ? definition : {};
    const id = String(source.id ?? `series-${index}`);

    if (seenIds.has(id)) {
      throw new Error(`Duplicate floating-graph series id: ${id}`);
    }

    seenIds.add(id);

    return {
      color: String(source.color ?? "#8fc7ff"),
      hoverTemplate: String(
        source.hoverTemplate
          ?? source.hovertemplate
          ?? "%{text}<br>x %{x}<br>y %{y}<extra></extra>",
      ),
      id,
      lineWidth: getPositiveNumber(source.lineWidth, 2.5),
      markerSize: getPositiveNumber(source.markerSize, 7),
      mode: String(source.mode ?? "lines"),
      name: String(source.name ?? `Series ${index + 1}`),
      text: Array.isArray(source.text) ? [...source.text] : [],
      trace: isRecord(source.trace) ? cloneGraphValue(source.trace) : {},
      x: Array.isArray(source.x) ? [...source.x] : [],
      y: Array.isArray(source.y) ? [...source.y] : [],
    };
  });
}

export function makeSeriesIndex(series) {
  return new Map(series.map((definition, index) => [definition.id, index]));
}

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function requireElement(value, name = "element") {
  if (!value || typeof value.append !== "function") {
    throw new Error(`A ${name} element is required.`);
  }

  return value;
}

export function requireNonEmptyString(value, name) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(`${name} is required.`);
  }

  return text;
}

function isCoordinate(value) {
  return typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

function clampDimension(value, available) {
  const maximum = Math.max(Math.floor(available - POPUP_SCREEN_MARGIN), 320);
  const requested = Math.round(getPositiveNumber(value, maximum));

  return Math.min(Math.max(requested, Math.min(640, maximum)), maximum);
}

function getPositiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getFiniteNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}
