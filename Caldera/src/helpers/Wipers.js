export const WIPER_IDS = Object.freeze(["top", "bot", "mid", "offset", "gain"]);

export function normaliseWipers(wipers) {
  return Object.fromEntries(
    WIPER_IDS.map((id) => [id, clampWiper(wipers?.[id])]),
  );
}

export function getModelWipers(model) {
  return Object.fromEntries(
    WIPER_IDS.map((id) => [id, clampWiper(model?.[id]?.wiper)]),
  );
}

export function clampWiper(value) {
  const wiper = Math.round(Number(value));

  if (!Number.isFinite(wiper)) {
    return 0;
  }

  return Math.min(Math.max(wiper, 0), 255);
}
