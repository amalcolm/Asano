import { INK } from "../drawing.js";
import { formatVoltage } from "../voltage.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export class VoltageReadout extends Shape {
  constructor({
    color = INK,
    formatValue = formatVoltage,
    label = "OUT",
    position = [0, 0, 0],
  } = {}) {
    super({ name: "VoltageReadout", position });

    this.displayVoltage = null;
    this.hasDisplayVoltage = false;
    this.formatValue = formatValue;
    this.label = label;
    this.inputPort = this.addPort("input", [-0.48, 0], {
      direction: [-1, 0, 0],
      kind: "input",
    });
    this.readout = new TextLabel(this.formatReadout(null), {
      color,
      height: 0.38,
      renderOrder: 5,
      width: 1.65,
    });

    this.add(this.readout);
  }

  evaluateVoltage() {
    const voltage = this.hasDisplayVoltage ? this.displayVoltage : this.inputPort.voltage;

    this.readout.setText(this.formatReadout(voltage));
  }

  setDisplayVoltage(voltage) {
    this.hasDisplayVoltage = true;
    this.displayVoltage = getDisplayVoltageValue(voltage);
    this.readout.setText(this.formatReadout(this.displayVoltage));
  }

  clearDisplayVoltage() {
    this.displayVoltage = null;
    this.hasDisplayVoltage = false;
    this.evaluateVoltage();
  }

  formatReadout(voltage) {
    return this.formatValue(voltage);
  }
}

function getDisplayVoltageValue(voltage) {
  if (voltage === null || voltage === undefined || voltage === "") {
    return null;
  }

  const value = Number(voltage);

  return Number.isFinite(value) ? value : null;
}
