import * as THREE from "three";
import { TickSound } from "../helpers/TickSound.js";
import { ThreePotModel } from "../model/components/three-pot/model.js";
import { Renderer } from "../scene/Renderer.js";
import { ThreePot } from "../scene/shapes/ThreePot.js";
import { VoltageReadout } from "../scene/shapes/VoltageReadout.js";
import { Wire } from "../scene/shapes/Wire.js";

const CAMERA_PADDING_PX = 28;
const OUTPUT_READOUT_X = 2.75;
const SIMULATION_VOLTAGE_LABEL_STYLE = Object.freeze({
  color: "#f4f7f2",
  height: 0.23,
  width: 0.736,
});

export class ThreePotSimulationScene {
  constructor(mount, { model = null, onLayout = null } = {}) {
    if (!mount) {
      throw new Error("A mount element is required for the ThreePot simulation scene.");
    }

    this.mount = mount;
    this.model = model ?? new ThreePotModel();
    this.onLayout = onLayout;
    this.renderer = new Renderer(mount, { onResize: () => this.handleResize() });
    this.renderer.domElement.setAttribute(
      "aria-label",
      "An interactive ThreePot simulation with a modelled voltage output.",
    );
    this.threePot = new ThreePot({
      model: this.model,
      showLinkedWiperControl: false,
      voltageLabelStyle: SIMULATION_VOLTAGE_LABEL_STYLE,
    });
    this.outputReadout = new VoltageReadout({ position: [OUTPUT_READOUT_X, 0, 0] });
    this.outputWire = new Wire({
      from: this.threePot.port("output"),
      hideVoltageLabel: true,
      to: this.outputReadout.port("input"),
    });
    this.dragControls = [
      this.threePot.topDigipot,
      this.threePot.botDigipot,
      this.threePot.midDigipot,
      this.threePot.linkedWiperControl,
    ].filter(Boolean);
    this.dragTarget = null;
    this.dragOffsetY = 0;
    this.started = false;
    this.wiperTickSound = new TickSound();

    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);

    this.renderer.addShape(this.threePot);
    this.renderer.addShape(this.outputWire);
    this.renderer.addShape(this.outputReadout);
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.addMouseHandlers();
    this.renderer.start();
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.removeMouseHandlers();
    this.dragTarget = null;
    this.dragOffsetY = 0;
    this.renderer.setCursor("default");
    this.renderer.stop();
  }

  render(snapshot = null) {
    this.evaluateAndSyncModelVoltages(snapshot);
    this.renderer.updateMatrixWorld();
    this.threePot.update();
    this.renderer.updateMatrixWorld();
    this.outputWire.update();
    this.renderer.render();
  }

  setMidWiper(value, options = {}) {
    return this.setWipers({ mid: value }, options);
  }

  getWiperValues() {
    return {
      bot: this.model.bot.value,
      mid: this.model.mid.value,
      top: this.model.top.value,
    };
  }

  setOuterWipers({ bot, top }, options = {}) {
    return this.setWipers({ bot, top }, options);
  }

  setWipers(wipers, { render = true } = {}) {
    ["bot", "mid", "top"].forEach((id) => {
      if (wipers[id] !== undefined) {
        this.model[id].setWiper(wipers[id], { emit: false });
      }
    });

    const snapshot = this.model.evaluate();

    if (render) {
      this.render(snapshot);
    }

    return snapshot.circuit?.nodes.midWiper ?? null;
  }

  setInteractionEnabled(isEnabled) {
    this.renderer.domElement.style.pointerEvents = isEnabled ? "" : "none";
  }

  evaluateAndSyncModelVoltages(snapshot = null) {
    const nodes = (snapshot ?? this.model.evaluate())?.circuit?.nodes;

    if (!nodes) {
      this.outputWire.setVoltage(null);
      this.outputReadout.evaluateVoltage();
      return;
    }

    this.syncPoweredDigipotVoltages(this.threePot.topPot, nodes, nodes.topHigh);
    this.syncPoweredDigipotVoltages(this.threePot.botPot, nodes, nodes.botHigh);
    this.threePot.internalWires[0].setVoltage(nodes.topWiper);
    this.threePot.internalWires[1].setVoltage(nodes.botWiper);
    this.outputWire.setVoltage(nodes.midWiper);
    this.outputReadout.evaluateVoltage();
  }

  syncPoweredDigipotVoltages(poweredDigipot, nodes, highVoltage) {
    poweredDigipot.supply.outputVoltage = nodes.supply;
    poweredDigipot.supply.evaluateVoltage();
    poweredDigipot.ground.port("node").voltage = nodes.ground;
    poweredDigipot.evaluateRail(
      poweredDigipot.supply.port("output"),
      poweredDigipot.supplyResistor,
      highVoltage,
    );
    poweredDigipot.evaluateRail(
      poweredDigipot.ground.port("node"),
      poweredDigipot.groundResistor,
      nodes.ground,
    );
  }

  handleResize() {
    this.fitCamera();
    this.renderer.render();
  }

  fitCamera() {
    this.evaluateAndSyncModelVoltages();
    this.renderer.updateMatrixWorld();
    this.threePot.update();
    this.renderer.updateMatrixWorld();
    this.outputWire.update();
    this.renderer.updateMatrixWorld();

    const bounds = new THREE.Box3();

    bounds.expandByObject(this.threePot);
    bounds.expandByObject(this.outputWire);
    bounds.expandByObject(this.outputReadout);

    if (bounds.isEmpty()) {
      return;
    }

    const mountWidth = Math.max(this.mount.clientWidth, 1);
    const mountHeight = Math.max(this.mount.clientHeight, 1);
    const usableWidth = Math.max(mountWidth - CAMERA_PADDING_PX * 2, 1);
    const usableHeight = Math.max(mountHeight - CAMERA_PADDING_PX * 2, 1);
    const boundsSize = bounds.getSize(new THREE.Vector3());
    const boundsCenter = bounds.getCenter(new THREE.Vector3());
    const worldPerPixel = Math.max(
      boundsSize.x / usableWidth,
      boundsSize.y / usableHeight,
      Number.EPSILON,
    );
    const viewWidth = mountWidth * worldPerPixel;
    const viewHeight = mountHeight * worldPerPixel;
    const camera = this.renderer.camera;

    camera.left = bounds.min.x - CAMERA_PADDING_PX * worldPerPixel;
    camera.right = camera.left + viewWidth;
    camera.top = boundsCenter.y + viewHeight / 2;
    camera.bottom = boundsCenter.y - viewHeight / 2;
    camera.updateProjectionMatrix();

    const contentRightClientPoint = this.renderer.getClientPoint(new THREE.Vector3(
      bounds.max.x,
      boundsCenter.y,
      0,
    ));
    const canvasBounds = this.renderer.getCanvasBounds();

    this.onLayout?.({
      contentRightPx: contentRightClientPoint.x - canvasBounds.left,
      height: mountHeight,
      width: mountWidth,
    });
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

    const worldPoint = this.renderer.getWorldPoint(event);
    const stepControl = this.findWiperStepControlAt(worldPoint);

    if (stepControl) {
      event.preventDefault();
      this.applyWiperStep(stepControl);
      return;
    }

    const dragControl = this.findDragControlAt(worldPoint);

    if (!dragControl) {
      return;
    }

    event.preventDefault();
    this.dragTarget = dragControl;
    this.dragOffsetY = dragControl.getWiperDragOffset(worldPoint);
    this.wiperTickSound.init();
    this.renderer.setCursor("grabbing");
    window.addEventListener("mousemove", this.handleDragMove);
  }

  handleMouseMove(event) {
    if (this.dragTarget) {
      return;
    }

    const worldPoint = this.renderer.getWorldPoint(event);

    if (this.findWiperStepControlAt(worldPoint)) {
      this.renderer.setCursor("pointer");
    } else if (this.findDragControlAt(worldPoint)) {
      this.renderer.setCursor("grab");
    } else {
      this.renderer.setCursor("default");
    }
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
      this.renderer.getWorldPoint(event),
      this.dragOffsetY,
      { emit: false },
    );

    if (this.dragTarget.value !== previousValue) {
      this.wiperTickSound.play();
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
    }

    this.dragTarget = null;
    this.dragOffsetY = 0;
    this.renderer.setCursor("default");
    window.removeEventListener("mousemove", this.handleDragMove);
    this.render();
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

  applyWiperStep({ control, direction }) {
    const previousValue = control.value;

    control.stepWiper(direction, { emit: false });

    if (control.value === previousValue) {
      return;
    }

    this.wiperTickSound.play();
    this.render();
  }
}
