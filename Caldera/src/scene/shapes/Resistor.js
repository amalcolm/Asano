import { CALIBRATED_RED, COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeLine } from "../drawing.js";
import { isKnownVoltage } from "../voltage.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export const RESISTOR_LEAD_HALF_WIDTH = 0.31;

export class Resistor extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    inputSide = "left",
    label = null,
    labelPosition = "bottom",
    position = [0, 0, 0],
    secondaryLabel = null,
    secondaryLabelColor = CALIBRATED_RED,
    value = 1000,
  } = {}) {
    super({ name: "Resistor", position });

    const leadLeftX = -RESISTOR_LEAD_HALF_WIDTH;
    const leadRightX = RESISTOR_LEAD_HALF_WIDTH;
    const bodyLeftX = -0.19;
    const bodyRightX = 0.19;
    const halfHeight = 0.07;

    this.ohms = parseResistance(value);
    this.label = label;
    this.labelPosition = labelPosition === "bottom" ? "bottom" : "top";
    this.value = value;
    this.inputSide = inputSide === "right" ? "right" : "left";
    this.leftPort = this.addPort("left", [leadLeftX, 0], {
      direction: [-1, 0, 0],
      kind: this.inputSide === "left" ? "input" : "output",
    });
    this.rightPort = this.addPort("right", [leadRightX, 0], {
      direction: [1, 0, 0],
      kind: this.inputSide === "right" ? "input" : "output",
    });

    this.ports.set("input", this.inputSide === "left" ? this.leftPort : this.rightPort);
    this.ports.set("output", this.inputSide === "left" ? this.rightPort : this.leftPort);

    this.add(makeLine([
      [leadLeftX, 0],
      [bodyLeftX, 0],
      [bodyLeftX + 0.04, halfHeight],
      [bodyLeftX + 0.11, -halfHeight],
      [bodyLeftX + 0.18, halfHeight],
      [bodyLeftX + 0.24, -halfHeight],
      [bodyLeftX + 0.31, halfHeight],
      [bodyRightX, 0],
      [leadRightX, 0],
    ], { color, width: COMPONENT_STROKE_WIDTH }));
    this.valueLabel = new TextLabel(label ?? formatResistance(value), {
      color,
      height: 0.2,
      position: [0, this.labelPosition === "bottom" ? -0.2 : 0.2, 0],
      width: 0.62,
    });
    this.add(this.valueLabel);

    if (secondaryLabel) {
      this.secondaryValueLabel = new TextLabel(secondaryLabel, {
        color: secondaryLabelColor,
        height: 0.16,
        position: [0, this.labelPosition === "bottom" ? -0.39 : -0.2, 0],
        width: 0.62,
      });
      this.add(this.secondaryValueLabel);
    }
  }

  setResistance(value) {
    this.ohms = parseResistance(value);
    this.value = value;
    this.valueLabel.setText(this.label ?? formatResistance(value));
  }

  evaluateVoltage() {
    const inputPort = this.port("input");
    const outputPort = this.port("output");

    outputPort.voltage = isKnownVoltage(inputPort.voltage) ? inputPort.voltage : null;
  }
}

export function formatResistance(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!Number.isFinite(value)) {
    return "?";
  }

  if (value === 0) {
    return "0";
  }

  if (Math.abs(value) >= 1_000_000) {
    return formatWithMultiplier(value / 1_000_000, "M");
  }

  if (Math.abs(value) >= 1_000) {
    return formatWithMultiplier(value / 1_000, "K");
  }

  return `${value.toFixed(0)}R`;
}

function formatWithMultiplier(value, multiplier) {
  const precision = Math.abs(value) < 10 ? 2 : 1;
  const scale = 10 ** precision;
  const rounded = Math.round(value * scale) / scale;

  if (Number.isInteger(rounded)) {
    return `${rounded}${multiplier}`;
  }

  return rounded.toFixed(precision).replace(/0+$/, "").replace(".", multiplier);
}

export function parseResistance(value) {
  if (Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const match = value.trim().match(/^([0-9]*\.?[0-9]+)\s*([rRkKmM])?\s*([0-9]+)?/);

  if (!match) {
    return 0;
  }

  const [, wholeAmount, suffix = "", suffixDecimal = ""] = match;
  const amount = suffixDecimal ? `${wholeAmount}.${suffixDecimal}` : wholeAmount;
  const multiplier = suffix.toLowerCase() === "m"
    ? 1_000_000
    : suffix.toLowerCase() === "k"
      ? 1_000
      : 1;

  return Number(amount) * multiplier;
}
