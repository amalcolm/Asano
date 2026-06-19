export const COMMAND_FLAGS = Object.freeze({
  NONE: 0,
  HOLD_WIPERS: 0x02,
  RUN_DEBUG: 0x80,
  RUN_FIND_SIGNAL: 0x100,
  RUN_GET_NOISE_SAMPLE: 0x200,
});

export function normaliseCommandFlags(flags) {
  const value = Number(flags);

  return Number.isFinite(value) && value >= 0
    ? Math.trunc(value) >>> 0
    : COMMAND_FLAGS.NONE;
}

export function hasCommandFlag(flags, flag) {
  return (normaliseCommandFlags(flags) & normaliseCommandFlags(flag)) !== 0;
}

export function setCommandFlag(flags, flag, enabled) {
  const currentFlags = normaliseCommandFlags(flags);
  const flagValue = normaliseCommandFlags(flag);

  return enabled
    ? (currentFlags | flagValue) >>> 0
    : (currentFlags & ~flagValue) >>> 0;
}

export function formatCommandFlags(flags) {
  return `0x${normaliseCommandFlags(flags).toString(16).toUpperCase().padStart(8, "0")}`;
}
