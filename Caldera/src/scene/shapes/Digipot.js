import * as THREE from "three";
import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeFilledPolygon, makeLineLoop } from "../drawing.js";
import { DigiPot as DigiPotModel } from "../../model/components/DigiPot.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export class Digipot extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    label = "",
    model = null,
    position = [0, 0, 0],
    value = 128,
  } = {}) {
    super({ name: "Digipot", position });

    const bodyLeft = -0.48;
    const bodyRight = 0.08;
    const bodyTop = 0.95;
    const bodyBottom = -0.95;
    const topInputY = bodyTop;
    const bottomInputY = bodyBottom;
    const wiperLeftX = bodyLeft - 0.06;
    const wiperShoulderX = bodyRight + 0.05;
    const wiperTipX = wiperShoulderX + 0.15;
    const wiperHalfHeight = 0.09;
    const stepArrowHalfWidth = 0.07;
    const stepArrowHalfHeight = 0.045;
    const stepArrowOffsetY = wiperHalfHeight + 0.105;
    const coarseStepArrowColor = "#ff5cab";
    const coarseStepArrowOffsetX = 0.18;
    const coarseStepAmount = 10;

    this.bodyTop = bodyTop;
    this.bodyBottom = bodyBottom;
    this.wiperLeftX = wiperLeftX;
    this.wiperLabelX = (wiperLeftX + wiperShoulderX) / 2;
    this.wiperTipX = wiperTipX;
    this.wiperHalfHeight = wiperHalfHeight;
    this.stepArrowX = this.wiperLabelX;
    this.coarseStepArrowX = this.stepArrowX - coarseStepArrowOffsetX;
    this.coarseStepAmount = coarseStepAmount;
    this.stepArrowHalfWidth = stepArrowHalfWidth;
    this.stepArrowHalfHeight = stepArrowHalfHeight;
    this.stepArrowOffsetY = stepArrowOffsetY;
    this.wiperY = 0;
    this.model = null;

    this.topInputPort = this.addPort("topInput", [bodyLeft, topInputY], { kind: "input" });
    this.bottomInputPort = this.addPort("bottomInput", [bodyLeft, bottomInputY], { kind: "input" });
    this.wiperPort = this.addPort("wiper", [wiperTipX, this.wiperY], { kind: "output" });

    this.add(makeLineLoop([
      [bodyLeft, bodyTop],
      [bodyRight, bodyTop],
      [bodyRight, bodyBottom],
      [bodyLeft, bodyBottom],
    ], { color, width: COMPONENT_STROKE_WIDTH }));

    this.wiper = makeFilledPolygon([
      [wiperLeftX, wiperHalfHeight],
      [wiperShoulderX, wiperHalfHeight],
      [wiperTipX, 0],
      [wiperShoulderX, -wiperHalfHeight],
      [wiperLeftX, -wiperHalfHeight],
    ], { color });
    this.add(this.wiper);

    this.wiper.add(makeFilledPolygon([
      [this.stepArrowX, stepArrowOffsetY + stepArrowHalfHeight],
      [this.stepArrowX - stepArrowHalfWidth, stepArrowOffsetY - stepArrowHalfHeight],
      [this.stepArrowX + stepArrowHalfWidth, stepArrowOffsetY - stepArrowHalfHeight],
    ], { color }));
    this.wiper.add(makeFilledPolygon([
      [this.stepArrowX, -stepArrowOffsetY - stepArrowHalfHeight],
      [this.stepArrowX - stepArrowHalfWidth, -stepArrowOffsetY + stepArrowHalfHeight],
      [this.stepArrowX + stepArrowHalfWidth, -stepArrowOffsetY + stepArrowHalfHeight],
    ], { color }));
    this.wiper.add(makeFilledPolygon([
      [this.coarseStepArrowX, stepArrowOffsetY + stepArrowHalfHeight],
      [this.coarseStepArrowX - stepArrowHalfWidth, stepArrowOffsetY - stepArrowHalfHeight],
      [this.coarseStepArrowX + stepArrowHalfWidth, stepArrowOffsetY - stepArrowHalfHeight],
    ], { color: coarseStepArrowColor }));
    this.wiper.add(makeFilledPolygon([
      [this.coarseStepArrowX, -stepArrowOffsetY - stepArrowHalfHeight],
      [this.coarseStepArrowX - stepArrowHalfWidth, -stepArrowOffsetY + stepArrowHalfHeight],
      [this.coarseStepArrowX + stepArrowHalfWidth, -stepArrowOffsetY + stepArrowHalfHeight],
    ], { color: coarseStepArrowColor }));

    if (label) {
      this.add(new TextLabel(label, {
        color,
        height: 0.3,
        position: [(bodyLeft + bodyRight) / 2, bodyTop - 0.12, 0],
        width: 0.38,
      }));
    }

    this.wiperValueLabel = new TextLabel("128", {
      color: "#ffffff",
      height: 0.2,
      position: [this.wiperLabelX, 0, 0.01],
      renderOrder: 3,
      width: 0.28,
    });
    this.wiper.add(this.wiperValueLabel);
    this.setModel(model ?? new DigiPotModel({ shape: this, wiper: value }));
  }

  get value() {
    return this.model?.value ?? 0;
  }

  setModel(model) {
    this.model = model;

    if (model.shape !== this) {
      model.shape = this;
    }

    this.syncWiperFromModel();
    model.syncShapeVoltages();
    return this;
  }

  containsWiperPoint(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    const padding = 0.08;

    return (
      localPoint.x >= this.wiperLeftX - padding
      && localPoint.x <= this.wiperTipX + padding
      && localPoint.y >= this.wiperY - this.wiperHalfHeight - padding
      && localPoint.y <= this.wiperY + this.wiperHalfHeight + padding
    );
  }

  getWiperStepDirectionAt(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    const candidates = [
      { centerOffsetY: this.stepArrowOffsetY, centerX: this.stepArrowX, direction: 1 },
      { centerOffsetY: -this.stepArrowOffsetY, centerX: this.stepArrowX, direction: -1 },
      { centerOffsetY: this.stepArrowOffsetY, centerX: this.coarseStepArrowX, direction: this.coarseStepAmount },
      { centerOffsetY: -this.stepArrowOffsetY, centerX: this.coarseStepArrowX, direction: -this.coarseStepAmount },
    ];
    let nearestHit = null;

    for (const candidate of candidates) {
      if (!this.containsStepArrowPoint(localPoint, candidate.centerOffsetY, candidate.centerX)) {
        continue;
      }

      const distance = this.getStepArrowDistanceSq(localPoint, candidate.centerOffsetY, candidate.centerX);
      if (!nearestHit || distance < nearestHit.distance) {
        nearestHit = { direction: candidate.direction, distance };
      }
    }

    return nearestHit?.direction ?? 0;
  }

  containsStepArrowPoint(localPoint, centerOffsetY, centerX = this.stepArrowX) {
    const padding = 0.08;
    const centerY = this.wiperY + centerOffsetY;

    return (
      localPoint.x >= centerX - this.stepArrowHalfWidth - padding
      && localPoint.x <= centerX + this.stepArrowHalfWidth + padding
      && localPoint.y >= centerY - this.stepArrowHalfHeight - padding
      && localPoint.y <= centerY + this.stepArrowHalfHeight + padding
    );
  }

  getStepArrowDistanceSq(localPoint, centerOffsetY, centerX) {
    const dx = localPoint.x - centerX;
    const dy = localPoint.y - (this.wiperY + centerOffsetY);

    return dx * dx + dy * dy;
  }

  getWiperStepAnchorWorldPoint(direction) {
    const centerX = Math.abs(direction) > 1 ? this.coarseStepArrowX : this.stepArrowX;

    return this.localToWorld(new THREE.Vector3(
      centerX,
      this.wiperY + (direction > 0 ? this.stepArrowOffsetY : -this.stepArrowOffsetY),
      0,
    ));
  }

  getWiperDragOffset(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    return this.wiperY - localPoint.y;
  }

  dragWiperTo(worldPoint, offsetY = 0, options = {}) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    this.setWiperY(localPoint.y + offsetY, options);
  }

  setWiperY(y, options = {}) {
    this.wiperY = clamp(y, this.bodyBottom, this.bodyTop);
    this.model?.setWiper(this.getValueForY(this.wiperY), {
      ...options,
      syncShape: false,
    });
    this.updateWiper();
  }

  setWiperValue(value, options = {}) {
    this.model?.setWiper(value, options);
  }

  stepWiper(direction, options = {}) {
    const magnitude = Math.max(1, Math.abs(Math.trunc(Number(direction))) || 1);

    this.setWiperValue(this.value + (direction > 0 ? magnitude : -magnitude), options);
  }

  snapWiper(options = {}) {
    this.setWiperValue(this.getValueForY(this.wiperY), options);
  }

  syncWiperFromModel() {
    this.wiperY = this.getYForValue(this.value);
    this.updateWiper();
  }

  updateWiper() {
    this.wiper.position.y = this.wiperY;
    this.wiperPort.position.y = this.wiperY;
    this.wiperValueLabel.setText(String(this.value));
  }

  getValueForY(y) {
    const travel = this.bodyTop - this.bodyBottom;
    const normalised = (clamp(y, this.bodyBottom, this.bodyTop) - this.bodyBottom) / travel;

    return clamp(Math.round(normalised * 255), 0, 255);
  }

  getYForValue(value) {
    const normalised = clamp(Math.round(value), 0, 255) / 255;

    return this.bodyBottom + normalised * (this.bodyTop - this.bodyBottom);
  }

  evaluateVoltage() {
    this.model?.evaluateVoltage();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
