import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeLine, makeLineLoop } from "../drawing.js";
import { SUPPLY_VOLTAGE, clampVoltage, isKnownVoltage } from "../voltage.js";
import { addPowerRailMarkers } from "./PowerRailMarkers.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export class TIA extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    hasMultiplierInput = false,
    multiplier = 1,
    position = [0, 0, 0],
    scale = 1,
  } = {}) {
    super({ name: "TIA", position, scale });

    const height = 2.0;
    const width = height * Math.sqrt(3) / 2;

    const leftX = -width / 2;
    const signX = leftX * 0.75;
    const rightX = width / 2;
    const inputY = height / 2 * 0.6;
    const multiplierInputX = 0;
    const multiplierInputStartY = height / 4;
    const multiplierInputEndY = height / 2 + 0.16;

    this.hasMultiplierInput = hasMultiplierInput;
    this.multiplier = multiplier;
    this.invertingPort = this.addPort("inverting", [leftX, inputY], { kind: "input", signal: "negative" });
    this.nonInvertingPort = this.addPort("nonInverting", [leftX, -inputY], { kind: "input", signal: "positive" });
    this.outputPort = this.addPort("output", [rightX, 0], { kind: "output" });
    this.multiplierInputPort = hasMultiplierInput
      ? this.addPort("multiplier", [multiplierInputX, multiplierInputEndY], {
        direction: [0, 1, 0],
        kind: "input",
        signal: "multiplier",
      })
      : null;

    this.add(makeLineLoop([[leftX, height/2.0], [rightX, 0], [leftX, -height/2.0]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.addPlusSign(signX, -inputY, color);
    this.addMinusSign(signX, inputY, color);
    if (hasMultiplierInput) {
      this.add(makeLine([
        [multiplierInputX, multiplierInputStartY],
        [multiplierInputX, multiplierInputEndY],
      ], { color, width: COMPONENT_STROKE_WIDTH }));
    }
    this.multiplierLabel = new TextLabel(this.formatMultiplierLabel(multiplier), {
      color,
      height: 0.18,
      position: [0.02, 0, 0],
      width: 0.48,
    });
    this.powerRailMarkers = addPowerRailMarkers(this, {
      bottomY: -height / 4,
      color,
      topY: height / 4,
    });
    this.add(this.multiplierLabel);
  }

  addPlusSign(x, y, color) {
    const size = 0.13;

    this.add(makeLine([[x - size, y], [x + size, y]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(makeLine([[x, y - size], [x, y + size]], { color, width: COMPONENT_STROKE_WIDTH }));
  }

  addMinusSign(x, y, color) {
    const size = 0.13;

    this.add(makeLine([[x - size, y], [x + size, y]], { color, width: COMPONENT_STROKE_WIDTH }));
  }

  evaluateVoltage() {
    const nonInvertingVoltage = this.nonInvertingPort.voltage;
    const invertingVoltage = this.invertingPort.voltage;
    const secondaryMultiplier = this.multiplierInputPort?.voltage ?? 1;

    this.updateMultiplierLabel(secondaryMultiplier);

    if (
      !isKnownVoltage(nonInvertingVoltage)
      || !isKnownVoltage(invertingVoltage)
      || !isKnownVoltage(secondaryMultiplier)
    ) {
      this.outputPort.voltage = null;
      return;
    }

    this.outputPort.voltage = clampVoltage(
      (nonInvertingVoltage - invertingVoltage) * this.multiplier * secondaryMultiplier
        + SUPPLY_VOLTAGE / 2,
    );
  }

  updateMultiplierLabel(secondaryMultiplier) {
    if (!isKnownVoltage(secondaryMultiplier)) {
      this.multiplierLabel.setText("x?");
      return;
    }

    this.multiplierLabel.setText(this.formatMultiplierLabel(this.multiplier * secondaryMultiplier));
  }

  formatMultiplierLabel(value) {
    if (!isKnownVoltage(value)) {
      return "x?";
    }

    return this.hasMultiplierInput ? `x${value.toFixed(2)}` : `x${value}`;
  }
}
