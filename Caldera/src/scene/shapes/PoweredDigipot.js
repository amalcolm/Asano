import { COMPONENT_BLUE } from "../drawing.js";
import { SUPPLY_VOLTAGE, isKnownVoltage } from "../voltage.js";
import { Digipot } from "./Digipot.js";
import { GroundSymbol } from "./GroundSymbol.js";
import { Resistor, parseResistance } from "./Resistor.js";
import { Shape } from "./Shape.js";
import { VoltageSource } from "./VoltageSource.js";
import { STANDARD_OUTPUT_LEAD_LENGTH, Wire } from "./Wire.js";

const RAIL_CENTER_X = -0.18;
const RAIL_WITH_RESISTOR_SOURCE_X = 0.14;
const RAIL_RESISTOR_X = -0.38;
const SUPPLY_Y = 1.28;
const GROUND_X = -0.88;
const GROUND_Y = -1.4;
const GROUND_WITH_RESISTOR_Y = -1.59;
const GROUND_NODE_Y = -1.10;
const DEFAULT_RAIL_RESISTANCE = "0";
const DEFAULT_DIGIPOT_RESISTANCE = "5K";

export class PoweredDigipot extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    digipotResistance = DEFAULT_DIGIPOT_RESISTANCE,
    groundResistance = DEFAULT_RAIL_RESISTANCE,
    groundSecondaryLabel = null,
    label = "",
    model = null,
    position = [0, 0, 0],
    supplyResistance = DEFAULT_RAIL_RESISTANCE,
    supplySecondaryLabel = null,
    voltage = SUPPLY_VOLTAGE,
    voltageLabelStyle = null,
  } = {}) {
    super({ name: "PoweredDigipot", position });

    this.digipotOhms = parseResistance(digipotResistance);

    const hasSupplyResistor = isPresentResistance(supplyResistance);
    const hasGroundResistor = isPresentResistance(groundResistance);

    this.supply = new VoltageSource({
      color,
      label: "3.3 V",
      outputDirection: [-1, 0, 0],
      position: [hasSupplyResistor ? RAIL_WITH_RESISTOR_SOURCE_X : RAIL_CENTER_X, SUPPLY_Y, 0],
      voltage,
    });
    this.ground = new GroundSymbol({
      color,
      position: [hasGroundResistor ? RAIL_WITH_RESISTOR_SOURCE_X : GROUND_X,
                 hasGroundResistor ? GROUND_WITH_RESISTOR_Y : GROUND_Y, 0],
    });
    this.digipot = new Digipot({ color, label, model });
    this.supplyResistor = this.makeRailResistor({
      color,
      resistance: supplyResistance,
      position: [RAIL_RESISTOR_X, SUPPLY_Y, 0],
      secondaryLabel: supplySecondaryLabel,
    });
    this.groundResistor = this.makeRailResistor({
      color,
      labelPosition: "bottom",
      resistance: groundResistance,
      position: [RAIL_RESISTOR_X,  GROUND_NODE_Y - 0.04, 0],
      secondaryLabel: groundSecondaryLabel,
    });

    const leftStandoffRoute = ({ end, start }) => {
      const standoffX = end.x - STANDARD_OUTPUT_LEAD_LENGTH;
      return [start, [standoffX, start.y, 0], [standoffX, end.y, 0], end];
    };
    const shortRoute = ({ end, start }) => [start, end];
    const supplyWires = this.makeRailWires({
      from: this.supply.port("output"),
      hideResistorOutputLabel: true,
      resistor: this.supplyResistor,
      route: leftStandoffRoute,
      shortRoute,
      to: this.digipot.port("topInput"),
      voltageLabelStyle,
    });
    const groundWires = this.makeRailWires({
      from: this.ground.port("node"),
      hideResistorOutputLabel: true,
      resistor: this.groundResistor,
      route: leftStandoffRoute,
      shortRoute,
      to: this.digipot.port("bottomInput"),
      voltageLabelStyle,
    });

    this.internalWires = [...supplyWires, ...groundWires];

    this.ports.set("output", this.digipot.port("wiper"));
    this.add(
      this.supply,
      this.ground,
      this.digipot,
      ...[this.supplyResistor, this.groundResistor].filter(Boolean),
      ...this.internalWires,
    );
  }

  update() {
    this.internalWires.forEach((wire) => wire.update());
  }

  evaluateVoltage() {
    this.supply.evaluateVoltage();
    this.ground.evaluateVoltage();
    const terminalVoltages = this.getDigipotTerminalVoltages();

    this.evaluateRail(this.supply.port("output"), this.supplyResistor, terminalVoltages.top);
    this.evaluateRail(this.ground.port("node"), this.groundResistor, terminalVoltages.bottom);
    this.digipot.evaluateVoltage();
  }

  makeRailResistor({ color, labelPosition = "top", position, resistance, secondaryLabel }) {
    if (!isPresentResistance(resistance)) {
      return null;
    }

    const resistor = new Resistor({
      color,
      inputSide: "right",
      labelPosition,
      position,
      secondaryLabel,
      value: resistance,
    });

    return resistor;
  }

  makeRailWires({
    from,
    hideResistorOutputLabel = false,
    resistor,
    route,
    shortRoute,
    to,
    voltageLabelStyle,
  }) {
    if (!resistor) {
      return [
        new Wire({
          from,
          hideVoltageLabels: "start",
          route,
          to,
          voltageLabelStyle,
        }),
      ];
    }

    return [
      new Wire({
        from,
        hideVoltageLabel: true,
        route: shortRoute,
        to: resistor.port("input"),
        voltageLabelStyle,
      }),
      new Wire({
        from: resistor.port("output"),
        hideVoltageLabels: hideResistorOutputLabel ? "start" : [],
        route,
        to,
        voltageLabelStyle,
      }),
    ];
  }

  evaluateRail(from, resistor, resistorOutputVoltage) {
    const wire = this.internalWires.find((candidate) => candidate.from === from);

    wire?.setVoltage(from.voltage);

    if (!resistor) {
      return;
    }

    resistor.port("output").voltage = resistorOutputVoltage;

    this.internalWires
      .find((candidate) => candidate.from === resistor.port("output"))
      ?.setVoltage(resistorOutputVoltage);
  }

  getDigipotTerminalVoltages() {
    const supplyVoltage = this.supply.port("output").voltage;
    const groundVoltage = this.ground.port("node").voltage;
    const supplyResistance = this.supplyResistor?.ohms ?? 0;
    const groundResistance = this.groundResistor?.ohms ?? 0;
    const totalResistance = supplyResistance + this.digipotOhms + groundResistance;

    if (!isKnownVoltage(supplyVoltage) || !isKnownVoltage(groundVoltage) || totalResistance <= 0) {
      return { bottom: null, top: null };
    }

    const current = (supplyVoltage - groundVoltage) / totalResistance;
    const bottom = groundVoltage + current * groundResistance;
    const top = bottom + current * this.digipotOhms;

    return { bottom, top };
  }
}

function isPresentResistance(resistance) {
  return resistance !== null && resistance !== false;
}
