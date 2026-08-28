import { DigiPot } from "../../DigiPot-sim.js";
import { Constants } from "../../Constants.js";

export const THREE_POT_WIPER_IDS = Object.freeze(["top", "bot", "mid"]);

// Each outer pot has its own 22 kOhm feed. The measured 0.601 V high
// terminal implies about 4.899 kOhm for a nominal 5 kOhm pot, so keep the
// practical calibrated value at 4.9 kOhm until the fitted part is measured.
export const DEFAULT_THREE_POT_OPTIONS = Object.freeze({
  digipotResistanceOhms: 4900,
  groundVoltage: Constants.GROUND_VOLTAGE,
  supplyResistanceOhms: 22000,
  supplyVoltage: Constants.SUPPLY_VOLTAGE,
  wiperResistanceOhms: 0,
});

const NODE_SUPPLY = "supply";
const NODE_GROUND = "ground";
const NODE_TOP_HIGH = "topHigh";
const NODE_BOT_HIGH = "botHigh";
const NODE_TOP_TAP = "topTap";
const NODE_BOT_TAP = "botTap";
const NETWORK_NODES = Object.freeze([
  NODE_SUPPLY,
  NODE_GROUND,
  NODE_TOP_HIGH,
  NODE_BOT_HIGH,
  NODE_TOP_TAP,
  NODE_BOT_TAP,
]);
const COMMON_VOLTAGE_EPSILON = 1e-12;
const LINEAR_SOLVER_EPSILON = 1e-15;

export class ThreePotModel {
  constructor({
    digipotResistanceOhms = DEFAULT_THREE_POT_OPTIONS.digipotResistanceOhms,
    groundVoltage = DEFAULT_THREE_POT_OPTIONS.groundVoltage,
    onChange = null,
    supplyResistanceOhms = DEFAULT_THREE_POT_OPTIONS.supplyResistanceOhms,
    supplyVoltage = DEFAULT_THREE_POT_OPTIONS.supplyVoltage,
    wiperResistanceOhms = DEFAULT_THREE_POT_OPTIONS.wiperResistanceOhms,
    wipers = {},
  } = {}) {
    this.digipotResistanceOhms = requirePositiveNumber(
      digipotResistanceOhms,
      "digipotResistanceOhms",
    );
    this.groundVoltage = requireFiniteNumber(groundVoltage, "groundVoltage");
    this.onChange = onChange;
    this.supplyResistanceOhms = requirePositiveNumber(
      supplyResistanceOhms,
      "supplyResistanceOhms",
    );
    this.supplyVoltage = requireFiniteNumber(supplyVoltage, "supplyVoltage");
    this.wiperResistanceOhms = requireNonNegativeNumber(
      wiperResistanceOhms,
      "wiperResistanceOhms",
    );
    this.state = null;

    const initialWipers = wipers && typeof wipers === "object" ? wipers : {};

    this.top = this.makeDigiPot("top", initialWipers.top);
    this.bot = this.makeDigiPot("bot", initialWipers.bot);
    this.mid = this.makeDigiPot("mid", initialWipers.mid);

    this.evaluate();
  }

  get outputVoltage() {
    return this.mid.wiperVoltage;
  }

  // Compatibility alias: the revised circuit has two physical high nodes,
  // so this is only known while both happen to be at the same voltage.
  get highNodeVoltage() {
    return this.state?.nodes.high ?? null;
  }

  get topHighNodeVoltage() {
    return this.state?.nodes.topHigh ?? null;
  }

  get botHighNodeVoltage() {
    return this.state?.nodes.botHigh ?? null;
  }

  makeDigiPot(id, wiper) {
    return new DigiPot({
      onChange: (event) => this.handleComponentChange(id, event),
      wiper,
    });
  }

  applyWiperValues(wipers) {
    if (!wipers || typeof wipers !== "object") {
      return false;
    }

    let applied = false;

    THREE_POT_WIPER_IDS.forEach((id) => {
      const wiper = Number(wipers[id]);

      if (wipers[id] !== undefined && Number.isFinite(wiper)) {
        this[id].setWiper(wiper, { emit: false });
        applied = true;
      }
    });

    if (applied) {
      this.evaluate();
    }

    return applied;
  }

  evaluate() {
    // The outer taps load one another through the middle pot's fixed resistor string.
    // Its wiper is assumed to feed a high-impedance TIA input, so the mid code does
    // not alter this network; it only selects the final voltage along that string.
    const topFraction = getWiperFraction(this.top);
    const botFraction = getWiperFraction(this.bot);
    const midFraction = getWiperFraction(this.mid);
    const topLowResistanceOhms = this.digipotResistanceOhms * topFraction;
    const topHighResistanceOhms = Math.max(
      this.digipotResistanceOhms - topLowResistanceOhms,
      0,
    );
    const botLowResistanceOhms = this.digipotResistanceOhms * botFraction;
    const botHighResistanceOhms = Math.max(
      this.digipotResistanceOhms - botLowResistanceOhms,
      0,
    );
    const couplingResistanceOhms = this.digipotResistanceOhms
      + this.wiperResistanceOhms * 2;
    const networkNodes = solveResistorNetwork({
      fixedVoltages: {
        [NODE_GROUND]: this.groundVoltage,
        [NODE_SUPPLY]: this.supplyVoltage,
      },
      nodes: NETWORK_NODES,
      resistors: [
        [NODE_SUPPLY, NODE_TOP_HIGH, this.supplyResistanceOhms],
        [NODE_SUPPLY, NODE_BOT_HIGH, this.supplyResistanceOhms],
        [NODE_TOP_HIGH, NODE_TOP_TAP, topHighResistanceOhms],
        [NODE_TOP_TAP, NODE_GROUND, topLowResistanceOhms],
        [NODE_BOT_HIGH, NODE_BOT_TAP, botHighResistanceOhms],
        [NODE_BOT_TAP, NODE_GROUND, botLowResistanceOhms],
        [NODE_TOP_TAP, NODE_BOT_TAP, couplingResistanceOhms],
      ],
    });
    const couplingCurrentAmps = (
      networkNodes[NODE_TOP_TAP] - networkNodes[NODE_BOT_TAP]
    ) / couplingResistanceOhms;
    const topWiperVoltage = networkNodes[NODE_TOP_TAP]
      - couplingCurrentAmps * this.wiperResistanceOhms;
    const botWiperVoltage = networkNodes[NODE_BOT_TAP]
      + couplingCurrentAmps * this.wiperResistanceOhms;

    this.top.setInputVoltages({
      bottom: this.groundVoltage,
      top: networkNodes[NODE_TOP_HIGH],
    });
    this.top.setOutputVoltage(topWiperVoltage);
    this.bot.setInputVoltages({
      bottom: this.groundVoltage,
      top: networkNodes[NODE_BOT_HIGH],
    });
    this.bot.setOutputVoltage(botWiperVoltage);
    this.mid.setInputVoltages({
      bottom: botWiperVoltage,
      top: topWiperVoltage,
    });
    this.mid.evaluateVoltage();

    const topSupplyCurrentAmps = (
      this.supplyVoltage - networkNodes[NODE_TOP_HIGH]
    ) / this.supplyResistanceOhms;
    const botSupplyCurrentAmps = (
      this.supplyVoltage - networkNodes[NODE_BOT_HIGH]
    ) / this.supplyResistanceOhms;
    const supplyCurrentAmps = topSupplyCurrentAmps + botSupplyCurrentAmps;
    const commonHighVoltage = getCommonVoltage(
      networkNodes[NODE_TOP_HIGH],
      networkNodes[NODE_BOT_HIGH],
    );

    this.state = {
      currents: {
        botSupplyCurrentAmps,
        couplingCurrentAmps,
        midWiperCurrentAmps: 0,
        supplyCurrentAmps,
        topSupplyCurrentAmps,
      },
      nodes: {
        botHigh: networkNodes[NODE_BOT_HIGH],
        botTap: networkNodes[NODE_BOT_TAP],
        botWiper: botWiperVoltage,
        ground: this.groundVoltage,
        high: commonHighVoltage,
        midWiper: this.mid.wiperVoltage,
        supply: this.supplyVoltage,
        topHigh: networkNodes[NODE_TOP_HIGH],
        topTap: networkNodes[NODE_TOP_TAP],
        topWiper: topWiperVoltage,
      },
      resistances: {
        botHighResistanceOhms,
        botLowResistanceOhms,
        couplingResistanceOhms,
        digipotResistanceOhms: this.digipotResistanceOhms,
        midResistanceOhms: this.digipotResistanceOhms,
        supplyResistanceOhms: this.supplyResistanceOhms,
        topHighResistanceOhms,
        topLowResistanceOhms,
        wiperResistanceOhms: this.wiperResistanceOhms,
      },
      wiperFractions: {
        bot: botFraction,
        mid: midFraction,
        top: topFraction,
      },
    };

    return this.snapshot();
  }

  snapshot() {
    return {
      bot: this.bot.snapshot(),
      circuit: this.state
        ? {
          currents: { ...this.state.currents },
          nodes: { ...this.state.nodes },
          resistances: { ...this.state.resistances },
          wiperFractions: { ...this.state.wiperFractions },
        }
        : null,
      mid: this.mid.snapshot(),
      top: this.top.snapshot(),
    };
  }

  handleComponentChange(id, event) {
    const snapshot = this.evaluate();

    this.onChange?.({
      ...event,
      component: event.model,
      id,
      model: this,
      snapshot,
    });
  }
}

function getWiperFraction(digipot) {
  const travel = digipot.max - digipot.min;

  if (travel <= 0) {
    return 0;
  }

  return (digipot.value - digipot.min) / travel;
}

function getCommonVoltage(left, right) {
  if (
    !Number.isFinite(left)
    || !Number.isFinite(right)
    || Math.abs(left - right) > COMMON_VOLTAGE_EPSILON
  ) {
    return null;
  }

  return (left + right) / 2;
}

function solveResistorNetwork({ fixedVoltages, nodes, resistors }) {
  // Endpoint codes create zero-ohm string sections. Merge those nodes before
  // nodal analysis rather than approximating the endpoints with tiny resistors.
  const parentByNode = new Map(nodes.map((node) => [node, node]));
  const findRoot = (node) => {
    const parent = parentByNode.get(node);

    if (parent === undefined) {
      throw new Error(`Unknown resistor-network node: ${node}`);
    }

    if (parent === node) {
      return node;
    }

    const root = findRoot(parent);
    parentByNode.set(node, root);
    return root;
  };
  const mergeNodes = (left, right) => {
    const leftRoot = findRoot(left);
    const rightRoot = findRoot(right);

    if (leftRoot !== rightRoot) {
      parentByNode.set(rightRoot, leftRoot);
    }
  };

  resistors.forEach(([left, right, resistanceOhms]) => {
    requireNonNegativeNumber(resistanceOhms, "resistanceOhms");

    if (resistanceOhms === 0) {
      mergeNodes(left, right);
    }
  });

  const fixedVoltageByRoot = new Map();

  Object.entries(fixedVoltages).forEach(([node, voltage]) => {
    const root = findRoot(node);
    const knownVoltage = requireFiniteNumber(voltage, `${node}Voltage`);
    const existingVoltage = fixedVoltageByRoot.get(root);

    if (
      existingVoltage !== undefined
      && Math.abs(existingVoltage - knownVoltage) > LINEAR_SOLVER_EPSILON
    ) {
      throw new Error(`Conflicting fixed voltages are shorted together at node ${node}.`);
    }

    fixedVoltageByRoot.set(root, knownVoltage);
  });

  const roots = Array.from(new Set(nodes.map(findRoot)));
  const unknownRoots = roots.filter((root) => !fixedVoltageByRoot.has(root));
  const unknownIndexByRoot = new Map(
    unknownRoots.map((root, index) => [root, index]),
  );
  const matrix = unknownRoots.map(() => unknownRoots.map(() => 0));
  const rightHandSide = unknownRoots.map(() => 0);
  const stampNode = (nodeRoot, otherRoot, conductance) => {
    const nodeIndex = unknownIndexByRoot.get(nodeRoot);

    if (nodeIndex === undefined) {
      return;
    }

    matrix[nodeIndex][nodeIndex] += conductance;

    const otherIndex = unknownIndexByRoot.get(otherRoot);

    if (otherIndex === undefined) {
      rightHandSide[nodeIndex] += conductance * fixedVoltageByRoot.get(otherRoot);
    } else {
      matrix[nodeIndex][otherIndex] -= conductance;
    }
  };

  resistors.forEach(([left, right, resistanceOhms]) => {
    if (resistanceOhms === 0) {
      return;
    }

    const leftRoot = findRoot(left);
    const rightRoot = findRoot(right);

    if (leftRoot === rightRoot) {
      return;
    }

    const conductance = 1 / resistanceOhms;

    stampNode(leftRoot, rightRoot, conductance);
    stampNode(rightRoot, leftRoot, conductance);
  });

  const solvedUnknownVoltages = solveLinearSystem(matrix, rightHandSide);
  const voltageByRoot = new Map(fixedVoltageByRoot);

  unknownRoots.forEach((root, index) => {
    voltageByRoot.set(root, solvedUnknownVoltages[index]);
  });

  return Object.fromEntries(
    nodes.map((node) => [node, voltageByRoot.get(findRoot(node))]),
  );
}

function solveLinearSystem(matrix, rightHandSide) {
  const size = matrix.length;

  if (size === 0) {
    return [];
  }

  const augmented = matrix.map((row, index) => [
    ...row,
    rightHandSide[index],
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    const pivot = augmented[pivotRow][column];

    if (Math.abs(pivot) <= LINEAR_SOLVER_EPSILON) {
      throw new Error("The three-pot resistor network is singular.");
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];

    for (let index = column; index <= size; index += 1) {
      augmented[column][index] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];

      if (factor === 0) {
        continue;
      }

      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function requireFiniteNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number.`);
  }

  return number;
}

function requirePositiveNumber(value, name) {
  const number = requireFiniteNumber(value, name);

  if (number <= 0) {
    throw new RangeError(`${name} must be greater than zero.`);
  }

  return number;
}

function requireNonNegativeNumber(value, name) {
  const number = requireFiniteNumber(value, name);

  if (number < 0) {
    throw new RangeError(`${name} must be zero or greater.`);
  }

  return number;
}
