import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeLine } from "../drawing.js";
import { isKnownVoltage } from "../voltage.js";
import { Resistor, parseResistance } from "./Resistor.js";

export class VariableResistor extends Resistor {
  constructor({
    color = COMPONENT_BLUE,
    inputSide = "left",
    maxWiperValue = 255,
    position = [0, 0, 0],
    value = 1000,
  } = {}) {
    super({ color, inputSide, position, value });

    const controlTopY = 0.40;
    const controlBodyY = 0.12;

    this.name = "VariableResistor";
    this.maxResistanceOhms = parseResistance(value);
    this.maxWiperValue = maxWiperValue;
    this.valueLabel.position.set(0, -0.22, 0);
    this.topInputPort = this.addPort("topInput", [0, controlTopY], {
      direction: [0, 1, 0],
      kind: "input",
      signal: "wiper",
    });
    this.ports.set("control", this.topInputPort);

    this.add(makeLine([
      [0, controlTopY],
      [0, controlBodyY],
    ], { color, width: COMPONENT_STROKE_WIDTH }));
  }

  updateResistanceFromControl() {
    const controlValue = this.topInputPort.voltage;

    if (isKnownVoltage(controlValue)) {
      this.setResistance(this.getResistanceForWiperValue(controlValue));
    }
  }

  getResistanceForWiperValue(value) {
    const wiperValue = clamp(value, 0, this.maxWiperValue);
    return this.maxResistanceOhms * (wiperValue / this.maxWiperValue);
  }

  evaluateVoltage() {
    this.updateResistanceFromControl();
    super.evaluateVoltage();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
