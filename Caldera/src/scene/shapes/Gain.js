import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeLine, makeLineLoop } from "../drawing.js";
import { SUPPLY_VOLTAGE, clampVoltage, isKnownVoltage } from "../voltage.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export class Gain extends Shape {
  constructor({ color = COMPONENT_BLUE, label = "gain", position = [0, 0, 0] } = {}) {
    super({ name: "Gain", position });

    const leftX = -0.62;
    const rightX = 0.62;
    const topY = 0.42;
    const bottomY = -0.42;
    const controlY = 0.72;

    this.inputPort = this.addPort("input", [leftX, 0], { kind: "input", signal: "audio" });
    this.controlPort = this.addPort("control", [0, controlY], {
      direction: [0, 1, 0],
      kind: "input",
      signal: "gain",
    });
    this.outputPort = this.addPort("output", [rightX, 0], { kind: "output", signal: "audio" });

    this.add(makeLineLoop([
      [leftX, topY],
      [rightX, topY],
      [rightX, bottomY],
      [leftX, bottomY],
    ], { color, width: COMPONENT_STROKE_WIDTH }));

    this.add(makeLine([[0, controlY], [0, topY]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(new TextLabel(label, {
      color,
      height: 0.16,
      position: [0, 0.08, 0],
      width: 0.48,
    }));
    this.add(new TextLabel("x", {
      color,
      height: 0.18,
      position: [0, -0.16, 0],
      width: 0.18,
    }));
  }

  evaluateVoltage() {
    const inputVoltage = this.inputPort.voltage;
    const controlVoltage = this.controlPort.voltage;

    if (!isKnownVoltage(inputVoltage) || !isKnownVoltage(controlVoltage)) {
      this.outputPort.voltage = null;
      return;
    }

    const gain = 1 + (controlVoltage / SUPPLY_VOLTAGE) * 4;
    this.outputPort.voltage = clampVoltage(inputVoltage * gain);
  }
}
