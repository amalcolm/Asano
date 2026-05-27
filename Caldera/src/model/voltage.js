import { Constants } from "./Constants.js";

export const GROUND_VOLTAGE = Constants.GROUND_VOLTAGE;
export const SUPPLY_VOLTAGE = Constants.SUPPLY_VOLTAGE;
export const MID_RAIL_VOLTAGE = Constants.MID_RAIL_VOLTAGE;
export const SENSOR_RAIL_MARGIN_V = Constants.SENSOR_RAIL_MARGIN_V;
export const VALID_SENSOR_MIN_V = Constants.VALID_SENSOR_MIN_V;
export const VALID_SENSOR_MAX_V = Constants.VALID_SENSOR_MAX_V;

export function clampVoltage(value, min = GROUND_VOLTAGE, max = SUPPLY_VOLTAGE) {
  if (!isKnownVoltage(value)) {
    return null;
  }

  return Math.min(Math.max(value, min), max);
}

export function formatVoltage(value) {  if (!isKnownVoltage(value)) return "? V";
  
  return `${value.toFixed(3)} V`;
}

export function isKnownVoltage(value) { return Number.isFinite(value); }

export function isValidSensorVoltage(value) {
  return isKnownVoltage(value)
    && value >= VALID_SENSOR_MIN_V
    && value <= VALID_SENSOR_MAX_V;
}
