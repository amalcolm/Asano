import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, circlePoints, makeLineLoop } from "../drawing.js";
import { SUPPLY_VOLTAGE } from "../voltage.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export class VoltageSource extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    label = "3.3 V",
    outputDirection = [1, 0, 0],
    position = [0, 0, 0],
    scale = 1,
    voltage = SUPPLY_VOLTAGE,
  } = {}) {
    super({ name: "VoltageSource", position, scale });

    const radius = 0.14;
    const [outputX, outputY] = outputDirection;

    this.outputVoltage = voltage;
    this.outputPort = this.addPort("output", [outputX * radius, outputY * radius], {
      direction: outputDirection,
      kind: "output",
      signal: { voltage },
    });

    this.add(makeLineLoop(circlePoints(0.14), { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(new TextLabel(label, { color, position: [0.02, 0.30, 0], width: 0.52, height: 0.25 }));
  }

  evaluateVoltage() {
    this.outputPort.voltage = this.outputVoltage;
  }
}
