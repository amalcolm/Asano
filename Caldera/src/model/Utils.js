export function clampInt(value, min, max) {
  return Math.min(Math.max(Math.round(value), min), max);
}
