import { DifferentialAmpSensorModel } from "../helpers/DifferentialAmpSensorModel.js";
import { SensorErrorReadouts } from "../helpers/SensorErrorReadouts.js";
import { TickSound } from "../helpers/TickSound.js";
import { Constants } from "../model/Constants.js";
import { CALIBRATED_RED } from "./drawing.js";
import { DifferentialAmp } from "./shapes/DifferentialAmp.js";
import { TIA } from "./shapes/TIA.js";
import { PhotoDiode } from "./shapes/PhotoDiode.js";
import { PoweredDigipot } from "./shapes/PoweredDigipot.js";
import { formatResistance } from "./shapes/Resistor.js";
import { DIGIPOT_OUTPUT_LEAD_LENGTH, ThreePot } from "./shapes/ThreePot.js";
import { VoltageReadout } from "./shapes/VoltageReadout.js";
import { STANDARD_OUTPUT_LEAD_LENGTH, Wire } from "./shapes/Wire.js";
import { Renderer } from "./Renderer.js";
import { clampVoltage } from "./voltage.js";

export class CircuitScene {
  constructor(mount, model, {
    onManualWiperInput = null,
    onPointerMoveRequest = null,
    onSettingsChange = null,
  } = {}) {
    this.mount = mount;
    this.model = model;
    this.onManualWiperInput = onManualWiperInput;
    this.onPointerMoveRequest = onPointerMoveRequest;
    this.onSettingsChange = onSettingsChange;
    this.renderer = new Renderer(mount, { onResize: () => this.render() });
    this.shapes = [];
    this.dragControls = [];
    this.controlById = new Map();
    this.differentialAmp = null;
    this.photoDiode = null;
    this.sensorModel = new DifferentialAmpSensorModel();
    this.sensorErrorReadouts = new SensorErrorReadouts();
    this.wiperTickSound = new TickSound();
    this.voltageReadoutById = new Map();
    this.wireById = new Map();
    this.wires = [];
    this.dragTarget = null;
    this.dragOffsetY = 0;
    this.physicalVoltagesFrozen = false;

    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleModelWiperChange = this.handleModelWiperChange.bind(this);
    this.model.onChange = this.handleModelWiperChange;

    this.setupCircuit();
  }

  start() {
    this.addMouseHandlers();
    this.renderer.start();
  }

  stop() {
    this.removeMouseHandlers();
    this.renderer.stop();
  }

  add(shape) {
    this.renderer.addShape(shape);
    this.shapes.push(shape);

    if (shape instanceof Wire) {
      this.wires.push(shape);
    }

    return shape;
  }

  render() {
    this.renderer.updateMatrixWorld();
    this.evaluateVoltages();
    this.applyEstimatedVoltagesWhenFrozen();
    this.applyModelVoltageOverrides();
    this.shapes.forEach((shape) => shape.update(0, 0));
    this.renderer.render();
  }

  evaluateVoltages() {
    for (let pass = 0; pass < 6; pass += 1) {
      this.model.evaluate();

      this.shapes.forEach((shape) => {
        if (!(shape instanceof Wire) && shape !== this.differentialAmp) {
          shape.evaluateVoltage?.();
        }
      });

      this.wires.forEach((wire) => {
        wire.setVoltage(wire.from?.voltage ?? null);
      });
    }
  }

  addMouseHandlers() {
    this.renderer.addCanvasEventListener("mousedown", this.handleMouseDown);
    this.renderer.addCanvasEventListener("mousemove", this.handleMouseMove);
    this.renderer.addCanvasEventListener("mouseleave", this.handleMouseLeave);
    window.addEventListener("mouseup", this.handleMouseUp);
  }

  removeMouseHandlers() {
    this.renderer.removeCanvasEventListener("mousedown", this.handleMouseDown);
    this.renderer.removeCanvasEventListener("mousemove", this.handleMouseMove);
    this.renderer.removeCanvasEventListener("mouseleave", this.handleMouseLeave);
    window.removeEventListener("mousemove", this.handleDragMove);
    window.removeEventListener("mouseup", this.handleMouseUp);
  }

  handleMouseDown(event) {
    if (event.button !== 0) {
      return;
    }

    const worldPoint = this.getWorldPoint(event);
    const stepControl = this.findWiperStepControlAt(worldPoint);

    if (stepControl) {
      event.preventDefault();
      this.applyWiperStep(stepControl, event);
      return;
    }

    const dragControl = this.findDragControlAt(worldPoint);

    if (!dragControl) {
      return;
    }

    event.preventDefault();
    this.dragTarget = dragControl;
    this.dragOffsetY = this.dragTarget.getWiperDragOffset(worldPoint);
    this.wiperTickSound.init();
    this.notifyManualWiperInput("start");
    this.renderer.setCursor("grabbing");
    window.addEventListener("mousemove", this.handleDragMove);
  }

  handleMouseMove(event) {
    if (this.dragTarget) {
      return;
    }

    const worldPoint = this.getWorldPoint(event);
    let cursor = "default";

    if (this.findWiperStepControlAt(worldPoint)) {
      cursor = "pointer";
    } else if (this.findDragControlAt(worldPoint)) {
      cursor = "grab";
    }

    this.renderer.setCursor(cursor);
  }

  handleMouseLeave() {
    if (!this.dragTarget) {
      this.renderer.setCursor("default");
    }
  }

  handleDragMove(event) {
    if (!this.dragTarget) {
      return;
    }

    if ((event.buttons & 1) !== 1) {
      this.endDrag();
      return;
    }

    event.preventDefault();
    const previousValue = this.dragTarget.value;

    this.dragTarget.dragWiperTo(
      this.getWorldPoint(event),
      this.dragOffsetY,
      { emit: false },
    );

    if (this.dragTarget.value !== previousValue) {
      this.wiperTickSound.play();
      this.notifyManualWiperInput("change");
    }

    this.render();
  }

  handleMouseUp(event) {
    if (event.button === 0) {
      this.endDrag();
    }
  }

  endDrag() {
    if (!this.dragTarget) {
      return;
    }

    const previousValue = this.dragTarget.value;
    this.dragTarget.snapWiper({ emit: false });

    if (this.dragTarget.value !== previousValue) {
      this.wiperTickSound.play();
      this.notifyManualWiperInput("change");
    }

    this.notifyManualWiperInput("end");
    this.dragTarget = null;
    this.dragOffsetY = 0;
    this.renderer.setCursor("default");
    window.removeEventListener("mousemove", this.handleDragMove);
    this.render();
    this.notifySettingsChange();
  }

  getWorldPoint(event) {
    return this.renderer.getWorldPoint(event);
  }

  findWiperStepControlAt(worldPoint) {
    for (const control of this.dragControls) {
      const direction = control.getWiperStepDirectionAt?.(worldPoint) ?? 0;

      if (direction !== 0) {
        return { control, direction };
      }
    }

    return null;
  }

  findDragControlAt(worldPoint) {
    return this.dragControls.find((control) => control.containsWiperPoint(worldPoint));
  }

  applyWiperStep({ control, direction }, event = null) {
    const previousValue = control.value;

    control.stepWiper(direction, { emit: false });

    if (control.value === previousValue) {
      return;
    }

    this.notifyManualWiperInput("start");
    this.wiperTickSound.play();
    this.notifyManualWiperInput("change");
    this.notifyManualWiperInput("end");
    this.render();
    this.requestPointerMoveForStep(control, direction, event);
    this.notifySettingsChange();
  }

  requestPointerMoveForStep(control, direction, event) {
    if (!this.onPointerMoveRequest) {
      return;
    }

    const worldPoint = control.getWiperStepAnchorWorldPoint?.(direction);

    if (!worldPoint) {
      return;
    }

    const clientPoint = this.renderer.getClientPoint(worldPoint);
    const screenPoint = getScreenPointForClientPoint(clientPoint, event);

    if (!screenPoint) {
      return;
    }

    this.onPointerMoveRequest({
      clientX: Math.round(clientPoint.x),
      clientY: Math.round(clientPoint.y),
      devicePixelRatio: window.devicePixelRatio || 1,
      reason: "wiper-step",
      screenX: Math.round(screenPoint.x),
      screenY: Math.round(screenPoint.y),
    });
  }

  getSettings() {
    return {
      photodiodeVoltage: this.getPhotoDiodeVoltage(),
      wipers: this.getWiperValues(),
    };
  }

  getWiperValues() {
    return Object.fromEntries(
      Array.from(this.controlById, ([id, control]) => [id, control.value]),
    );
  }

  applySettings(settings) {
    if (!settings) {
      return;
    }

    this.model.applyWiperValues?.(settings.wipers);

    if (settings.photodiodeVoltage !== undefined) {
      this.setPhotoDiodeVoltage(settings.photodiodeVoltage, { notify: false, render: false });
    }
  }

  getPhotoDiodeVoltage() {
    return this.photoDiode?.outputVoltage ?? null;
  }

  setPhotoDiodeVoltage(voltage, { notify = true, render = true } = {}) {
    const clampedVoltage = clampVoltage(Number(voltage));

    if (clampedVoltage === null || !this.photoDiode?.setOutputVoltage(clampedVoltage)) {
      return false;
    }

    if (render) {
      this.render();
    }

    if (notify) {
      this.notifySettingsChange();
    }

    return true;
  }

  applyPhysicalVoltages(voltages) {
    if (this.physicalVoltagesFrozen) {
      return false;
    }

    if (!voltages || typeof voltages !== "object") {
      return false;
    }

    const appliedToModel = this.model.applyPhysicalVoltages?.(voltages) ?? false;

    this.applyModelVoltageOverrides();

    return appliedToModel;
  }

  setPhysicalVoltagesFrozen(isFrozen) {
    this.physicalVoltagesFrozen = isFrozen;
  }

  applyEstimatedVoltagesWhenFrozen() {
    if (!this.physicalVoltagesFrozen) {
      return false;
    }

    return this.model.applyEstimatedVoltages?.({
      sensor1: this.getSceneSensor1Voltage(),
    }) ?? false;
  }

  getSceneSensor1Voltage() {
    const sensor1Wire = this.wireById.get("sensor1");

    return sensor1Wire?.voltage ?? sensor1Wire?.from?.voltage ?? null;
  }

  applyModelVoltageOverrides() {
    const sensorModelErrorReadings = this.sensorModel.getSensorErrorReadings(this.model);
    const circuitMathErrorReadings = this.sensorModel.getCircuitMathErrorReadings(this.model);

    this.setReadoutVoltage("sensor1", this.model.sensor1Voltage);
    this.setReadoutVoltage("sensor2", this.model.sensor2Voltage);
    this.sensorErrorReadouts.setVoltage(
      "sensor1Error",
      sensorModelErrorReadings.sensor1.errorVoltage,
      sensorModelErrorReadings.sensor1,
    );
    this.sensorErrorReadouts.setVoltage(
      "sensor2Error",
      sensorModelErrorReadings.sensor2.errorVoltage,
      sensorModelErrorReadings.sensor2,
    );
    this.sensorErrorReadouts.setVoltage(
      "sensor1CircuitError",
      circuitMathErrorReadings.sensor1.errorVoltage,
      circuitMathErrorReadings.sensor1,
    );
    this.sensorErrorReadouts.setVoltage(
      "sensor2CircuitError",
      circuitMathErrorReadings.sensor2.errorVoltage,
      circuitMathErrorReadings.sensor2,
    );
    this.applyDifferentialAmpModelVoltages();
  }

  setReadoutVoltage(id, voltage) {
    this.voltageReadoutById.get(id)?.setDisplayVoltage(voltage);
  }

  applyDifferentialAmpModelVoltages() {
    const differentialAmp = this.differentialAmp;
    const diffAmpModel = this.model.diffAmp;

    if (!differentialAmp || !diffAmpModel) {
      return;
    }

    const {
      feedbackJoinVoltage,
      nonInvertingVoltage,
      outputVoltage,
      summingNodeVoltage,
    } = diffAmpModel.snapshot();

    differentialAmp.updateVariableResistance();
    differentialAmp.updateMultiplierLabel(1);

    if (Number.isFinite(this.model.sensor1Voltage)) {
      this.wireById.get("sensor1")?.setVoltage(this.model.sensor1Voltage);
      this.wireById.get("diffAmpInput")?.setVoltage(this.model.sensor1Voltage);
    }

    if (Number.isFinite(nonInvertingVoltage)) {
      differentialAmp.nonInvertingPort.voltage = nonInvertingVoltage;
      this.wireById.get("offset")?.setVoltage(nonInvertingVoltage);
    }

    if (Number.isFinite(summingNodeVoltage)) {
      differentialAmp.sourceResistor.port("output").voltage = summingNodeVoltage;
      differentialAmp.opAmpInvertingPort.voltage = summingNodeVoltage;
      differentialAmp.feedbackResistor.port("output").voltage = summingNodeVoltage;
      differentialAmp.sourceJoinWire.setVoltage(summingNodeVoltage);
      differentialAmp.feedbackReturnWire.setVoltage(summingNodeVoltage);
    }

    if (Number.isFinite(outputVoltage)) {
      differentialAmp.outputPort.voltage = outputVoltage;
      this.wireById.get("sensor2")?.setVoltage(outputVoltage);
      differentialAmp.feedbackOutputWire.setVoltage(outputVoltage);
    }

    if (Number.isFinite(feedbackJoinVoltage)) {
      differentialAmp.variableResistor.port("output").voltage = feedbackJoinVoltage;
      differentialAmp.feedbackResistor.port("input").voltage = feedbackJoinVoltage;
      differentialAmp.feedbackJoinWire.setVoltage(feedbackJoinVoltage);
    }
  }

  notifySettingsChange() {
    this.onSettingsChange?.(this.getSettings());
  }

  notifyManualWiperInput(phase) {
    this.onManualWiperInput?.({
      phase,
      wipers: this.getWiperValues(),
    });
  }

  handleModelWiperChange() {
    this.render();
    this.notifySettingsChange();
  }

  setupCircuit() {
    const photoDiode = this.add(new PhotoDiode({ position: [-4.8, 4.2, 0] }));
    this.photoDiode = photoDiode;

    const threePot = this.add(new ThreePot({
      model: this.model,
      position: [-4.8, -1.0, 0],
    }));
    
    const tia = this.add(new TIA({ multiplier: 200, position: [-1.6, 0.605, 0] }));

    const offsetRails = Constants.OFFSET_RAILS;
    const calibratedOffsetRails = Constants.DIFFERENTIAL_AMP.calibratedOffsetRails;
    const differentialAmpValues = Constants.DIFFERENTIAL_AMP;
    const offsetPot = this.add(new PoweredDigipot({
      digipotResistance: offsetRails.digipotResistanceOhms,
      groundSecondaryLabel: getSecondaryResistanceLabel(
        offsetRails.groundResistanceOhms,
        calibratedOffsetRails.groundResistanceOhms,
      ),
      groundResistance: offsetRails.groundResistanceOhms,
      label: "offset",
      model: this.model.offset,
      position: [0.5, -2.1, 0],
      supplySecondaryLabel: getSecondaryResistanceLabel(
        offsetRails.supplyResistanceOhms,
        calibratedOffsetRails.supplyResistanceOhms,
      ),
      supplyResistance: offsetRails.supplyResistanceOhms,
    }));
    const differentialAmp = this.add(new DifferentialAmp({
      feedbackResistance: differentialAmpValues.variableFeedbackResistanceOhms,
      feedbackSecondaryLabel: getSecondaryResistanceLabel(
        differentialAmpValues.variableFeedbackResistanceOhms,
        differentialAmpValues.calibratedVariableFeedbackResistanceOhms,
      ),
      fixedFeedbackResistance: differentialAmpValues.fixedFeedbackResistanceOhms,
      fixedFeedbackSecondaryLabel: getSecondaryResistanceLabel(
        differentialAmpValues.fixedFeedbackResistanceOhms,
        differentialAmpValues.calibratedFixedFeedbackResistanceOhms,
      ),
      multiplier: 1,
      position: [3.0, 0.0, 0],
      sourceSecondaryLabel: getSecondaryResistanceLabel(
        differentialAmpValues.sourceResistanceOhms,
        differentialAmpValues.calibratedSourceResistanceOhms,
      ),
      sourceResistance: differentialAmpValues.sourceResistanceOhms,
    }));
    this.differentialAmp = differentialAmp;
    this.model.gain?.connectShape?.(differentialAmp.gainSlider);

    const sensor1ErrorReadoutX = 0.1;
    const sensor2ErrorReadoutX = 5.2;
    const sensor1Readout = this.add(new VoltageReadout({ position: [0.1, 0.75, 0] }));
    const sensor1ErrorReadout = this.add(new VoltageReadout({
      formatValue: this.sensorErrorReadouts.formatSignedVoltage,
      position: this.sensorErrorReadouts.getPosition(sensor1ErrorReadoutX, 0.3),
    }));
    const sensor1CircuitErrorReadout = this.add(new VoltageReadout({
      color: CALIBRATED_RED,
      formatValue: this.sensorErrorReadouts.formatSignedVoltage,
      position: this.sensorErrorReadouts.getPosition(sensor1ErrorReadoutX, 0.05),
    }));
    const sensor2Readout = this.add(new VoltageReadout({ position: [5.2, 0.0, 0] }));
    const sensor2ErrorReadout = this.add(new VoltageReadout({
      formatValue: this.sensorErrorReadouts.formatSignedVoltage,
      position: this.sensorErrorReadouts.getPosition(sensor2ErrorReadoutX, -0.45),
    }));
    const sensor2CircuitErrorReadout = this.add(new VoltageReadout({
      color: CALIBRATED_RED,
      formatValue: this.sensorErrorReadouts.formatSignedVoltage,
      position: this.sensorErrorReadouts.getPosition(sensor2ErrorReadoutX, -0.7),
    }));
    this.sensorErrorReadouts.register("sensor1Error", sensor1ErrorReadout, sensor1ErrorReadoutX);
    this.sensorErrorReadouts.register("sensor2Error", sensor2ErrorReadout, sensor2ErrorReadoutX);
    this.sensorErrorReadouts.register(
      "sensor1CircuitError",
      sensor1CircuitErrorReadout,
      sensor1ErrorReadoutX,
    );
    this.sensorErrorReadouts.register(
      "sensor2CircuitError",
      sensor2CircuitErrorReadout,
      sensor2ErrorReadoutX,
    );
    this.voltageReadoutById = new Map([
      ["sensor1", sensor1Readout],
      ["sensor1Error", sensor1ErrorReadout],
      ["sensor1CircuitError", sensor1CircuitErrorReadout],
      ["sensor2", sensor2Readout],
      ["sensor2Error", sensor2ErrorReadout],
      ["sensor2CircuitError", sensor2CircuitErrorReadout],
    ]);

    this.controlById = new Map([
      ["top", threePot.topDigipot],
      ["bot", threePot.botDigipot],
      ["mid", threePot.midDigipot],
      ["offset", offsetPot.digipot],
      ["gain", differentialAmp.gainSlider],
    ]);
    this.dragControls = [
      ...this.controlById.values(),
      threePot.linkedWiperControl,
    ];

    this.add(new Wire({
      from: threePot.port("output"),
      hideVoltageLabels: "start",
      outputLeadLength: DIGIPOT_OUTPUT_LEAD_LENGTH,
      to: tia.port("nonInverting"),
    }));
    this.add(new Wire({ 
      from: photoDiode.port("output"), 
      to: tia.port("inverting"),
      hideVoltageLabel: true,
    }));
    const diffAmpInputWire = this.add(new Wire({
      from: tia.port("output"),
      singleVoltageLabel: "end",
      hideVoltageLabel: true,
      outputLeadLength: DIGIPOT_OUTPUT_LEAD_LENGTH,
      to: differentialAmp.port("inverting"),
    }));
    const sensor1Wire = this.add(new Wire({
      from: tia.port("output"),
      singleVoltageLabel: "sensor",
      hideVoltageLabel: true,
      outputLeadLength: DIGIPOT_OUTPUT_LEAD_LENGTH,
      to: sensor1Readout.port("input"),
    }));
    const offsetWire = this.add(new Wire({
      from: offsetPot.port("output"),
      to: differentialAmp.port("nonInverting"),
      outputLeadLength: STANDARD_OUTPUT_LEAD_LENGTH * 1.3,

    }));
    const sensor2Wire = this.add(new Wire({
      from: differentialAmp.port("output"),
      hideVoltageLabel: true,
      to: sensor2Readout.port("input"),
    }));
    this.wireById = new Map([
      ["diffAmpInput", diffAmpInputWire],
      ["offset", offsetWire],
      ["sensor1", sensor1Wire],
      ["sensor2", sensor2Wire],
    ]);
  }

  alignGroundNode(ground, port) {
    this.renderer.updateMatrixWorld();
    ground.setNodeWorldY(port.getWorldPosition().y);
    this.renderer.updateMatrixWorld();
  }
}

function getSecondaryResistanceLabel(primaryOhms, secondaryOhms) {
  return Number(secondaryOhms) === Number(primaryOhms)
    ? null
    : formatResistance(secondaryOhms);
}

function getScreenPointForClientPoint(clientPoint, event) {
  if (!Number.isFinite(clientPoint?.x) || !Number.isFinite(clientPoint?.y)) {
    return null;
  }

  if (
    event
    && Number.isFinite(event.screenX)
    && Number.isFinite(event.screenY)
    && Number.isFinite(event.clientX)
    && Number.isFinite(event.clientY)
  ) {
    return {
      x: event.screenX + clientPoint.x - event.clientX,
      y: event.screenY + clientPoint.y - event.clientY,
    };
  }

  const screenX = Number.isFinite(window.screenX) ? window.screenX : window.screenLeft;
  const screenY = Number.isFinite(window.screenY) ? window.screenY : window.screenTop;

  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    return null;
  }

  return {
    x: screenX + clientPoint.x,
    y: screenY + clientPoint.y,
  };
}
