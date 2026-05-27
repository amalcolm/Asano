import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeFilledPolygon, makeLine } from "../drawing.js";
import { isKnownVoltage } from "../voltage.js";
import { Shape } from "./Shape.js";

export class PhotoDiode extends Shape {
  constructor({ color = COMPONENT_BLUE, position = [0, 0, 0], voltage = 1.65 } = {}) {
    super({ name: "PhotoDiode", position });

    const leftTerminalX = -0.62;
    const rightTerminalX = 0.72;
    const diodeLeftX = -0.24;
    const diodeRightX = 0.18;
    const diodeHalfHeight = 0.25;

    this.outputVoltage = voltage;
    this.outputPort = this.addPort("output", [rightTerminalX, 0], {
      kind: "output",
      signal: "light",
      voltage,
    });

    this.add(makeLine([[leftTerminalX, 0], [diodeLeftX, 0]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(makeLine([[diodeRightX, 0], [rightTerminalX, 0]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(makeFilledPolygon([
      [diodeLeftX, diodeHalfHeight],
      [diodeRightX, 0],
      [diodeLeftX, -diodeHalfHeight],
    ], { color }));
    this.add(makeLine([[diodeRightX, diodeHalfHeight], [diodeRightX, -diodeHalfHeight]], {
      color,
      width: COMPONENT_STROKE_WIDTH,
    }));

    this.addLightArrow(-0.52, 0.55, -0.2, 0.25, color);
    this.addLightArrow(-0.25, 0.62, 0.05, 0.32, color);
  }

  evaluateVoltage() {
    this.outputPort.voltage = this.outputVoltage;
  }

  setOutputVoltage(voltage) {
    if (!isKnownVoltage(voltage)) {
      return false;
    }

    this.outputVoltage = voltage;
    this.outputPort.voltage = voltage;
    return true;
  }

  addLightArrow(startX, startY, endX, endY, color) {
    const headSize = 0.08;

    this.add(makeLine([[startX, startY], [endX, endY]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(makeLine([[endX, endY], [endX - headSize, endY + 0.02]], {
      color,
      width: COMPONENT_STROKE_WIDTH,
    }));
    this.add(makeLine([[endX, endY], [endX + 0.02, endY + headSize]], {
      color,
      width: COMPONENT_STROKE_WIDTH,
    }));
  }
}
