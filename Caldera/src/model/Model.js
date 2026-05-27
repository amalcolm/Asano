import { DigiPot, Slider, getPoweredDigipotTerminalVoltages } from "./components/DigiPot.js";
import { Constants } from "./Constants.js";
import { DifferentialAmp } from "./components/DifferentialAmp.js";
import { isValidSensorVoltage } from "./voltage.js";

const THREE_POT_RAILS = Constants.THREE_POT_RAILS;
export const OFFSET_RAILS = Constants.OFFSET_RAILS;

export class Model {
  constructor({ onChange = null } = {}) {
    this.onChange = onChange;

    this.top = this.makeDigiPot("top");
    this.bot = this.makeDigiPot("bot");
    this.mid = this.makeDigiPot("mid");

    this.TIA = null;

    this.offset = this.makeDigiPot("offset");
    this.gain = this.makeSlider("gain");

    this.sensor1Voltage = null;
    this.sensor2Voltage = null;
    this.diffAmp = new DifferentialAmp({
      gain: this.gain,
      offset: this.offset,
    });

    const threePotTerminals = getPoweredDigipotTerminalVoltages(THREE_POT_RAILS);
    const offsetTerminals = getPoweredDigipotTerminalVoltages(OFFSET_RAILS);

    this.top.setInputVoltages(threePotTerminals);
    this.bot.setInputVoltages(threePotTerminals);

    this.offset.setInputVoltages(offsetTerminals);

    this.evaluate();
  }

  evaluate() {
    this.top.evaluateVoltage();
    this.bot.evaluateVoltage();

    this.mid.setInputVoltages({
      bottom: this.bot.wiperVoltage,
      top   : this.top.wiperVoltage,
    });
    this.mid.evaluateVoltage();

    this.offset.evaluateVoltage();
    this.gain.evaluateSlider();
    this.diffAmp.evaluate();

    return this.snapshot();
  }

  snapshot() {
    return {
      top: this.top.snapshot(),
      bot: this.bot.snapshot(),
      mid: this.mid.snapshot(),
      offset: this.offset.snapshot(),
      gain: this.gain.snapshot(),
      sensor1Voltage: this.sensor1Voltage,
      sensor2Voltage: this.sensor2Voltage,
      diffAmp: this.diffAmp.snapshot(),
    };
  }

  makeDigiPot(id) {
    return new DigiPot({
      onChange: (event) => this.handleComponentChange(id, event),
    });
  }

  makeSlider(id) {
    return new Slider({ 
      value: 0,
      onChange: (event) => this.handleComponentChange(id, event),
    });
  }

  applyWiperValues(wipers) {
    if (!wipers || typeof wipers !== "object") {
      return false;
    }

    let applied = false;

    Object.entries(wipers).forEach(([id, value]) => {
      const component = this[id];
      const wiper = Number(value);

      if (component?.setWiper && Number.isFinite(wiper)) {
        component.setWiper(wiper, { emit: false });
        applied = true;
      }
    });

    if (applied) {
      this.evaluate();
    }

    return applied;
  }

  applyPhysicalVoltages(voltages) {
    if (!voltages || typeof voltages !== "object") {
      return false;
    }

    let applied = false;

    if (voltages.sensor1 !== undefined) {
      this.sensor1Voltage = normaliseVoltage(voltages.sensor1);
      this.diffAmp.setSourceInputVoltage(this.sensor1Voltage);
      applied = true;
    }

    if (voltages.sensor2 !== undefined) {
      this.sensor2Voltage = normaliseVoltage(voltages.sensor2);
      this.diffAmp.setOutputVoltage(this.sensor2Voltage);
      applied = true;
    }

    if (applied) {
      this.evaluate();
    }

    return applied;
  }

  applyEstimatedVoltages({ sensor1 } = {}) {
    if (sensor1 === undefined) {
      return false;
    }

    this.sensor1Voltage = normaliseVoltage(sensor1);
    this.diffAmp.setSourceInputVoltage(this.sensor1Voltage);
    this.diffAmp.setOutputVoltage(null);
    this.evaluate();

    this.sensor2Voltage = isValidSensorVoltage(this.diffAmp.expectedOutputVoltage)
      ? normaliseVoltage(this.diffAmp.expectedOutputVoltage)
      : null;
    this.diffAmp.setOutputVoltage(this.sensor2Voltage);
    this.evaluate();

    return true;
  }

  handleComponentChange(id, event) {
    this.evaluate();
    this.onChange?.({
      ...event,
      component: event.model,
      id,
      model: this,
    });
  }
}

function normaliseVoltage(value) {
  const voltage = Number(value);

  return Number.isFinite(voltage) ? voltage : null;
}
