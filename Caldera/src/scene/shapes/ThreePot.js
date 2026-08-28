import * as THREE from "three";
import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeFilledPolygon, makeLine, updateLine } from "../drawing.js";
import { Digipot } from "./Digipot.js";
import { PoweredDigipot } from "./PoweredDigipot.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";
import { STANDARD_OUTPUT_LEAD_LENGTH, Wire } from "./Wire.js";

export const DIGIPOT_OUTPUT_LEAD_LENGTH = STANDARD_OUTPUT_LEAD_LENGTH / 3;

const LINK_BRACKET_X = -1.16;
const LINK_BRACKET_TARGET_X = -0.54;
const LINK_LABEL_WIDTH = 0.28;
const LINK_LABEL_HEIGHT = 0.2;
const LINK_HANDLE_WIDTH = 0.34;
const LINK_HANDLE_HEIGHT = 0.24;
const LINK_ARROW_HALF_WIDTH = 0.07;
const LINK_ARROW_HALF_HEIGHT = 0.045;
const LINK_ARROW_OFFSET_Y = LINK_HANDLE_HEIGHT / 2 + 0.12;
const LINK_HIT_PADDING = 0.09;

export class ThreePot extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    model = null,
    position = [0, 0, 0],
    showLinkedWiperControl = true,
    voltageLabelStyle = null,
  } = {}) {
    super({ name: "ThreePot", position });

    this.topPot = new PoweredDigipot({
      color,
      groundResistance: null,
      label: "top",
      model: model?.top ?? null,
      position: [0, 2.1, 0],
      supplyResistance: "22K",
      voltageLabelStyle,
    });
    this.botPot = new PoweredDigipot({
      color,
      groundResistance: null,
      label: "bot",
      model: model?.bot ?? null,
      position: [0, -2.1, 0],
      supplyResistance: "22K",
      voltageLabelStyle,
    });
    this.midPot = new Digipot({
      color,
      label: "mid",
      model: model?.mid ?? null,
      position: [1.4, 0, 0],
    });

    this.topDigipot = this.topPot.digipot;
    this.botDigipot = this.botPot.digipot;
    this.midDigipot = this.midPot;
    this.linkedWiperControl = showLinkedWiperControl
      ? new LinkedWiperControl({
        bottomDigipot: this.botDigipot,
        color,
        topDigipot: this.topDigipot,
      })
      : null;

    this.internalWires = [
      new Wire({
        from: this.topPot.port("output"),
        hideVoltageLabels: "start",
        outputLeadLength: DIGIPOT_OUTPUT_LEAD_LENGTH,
        to: this.midPot.port("topInput"),
        voltageLabelStyle,
      }),
      new Wire({
        from: this.botPot.port("output"),
        hideVoltageLabels: "start",
        outputLeadLength: DIGIPOT_OUTPUT_LEAD_LENGTH,
        to: this.midPot.port("bottomInput"),
        voltageLabelStyle,
      }),
    ];

    this.ports.set("output", this.midPot.port("wiper"));
    this.add(this.topPot, this.botPot, this.midPot, ...this.internalWires);

    if (this.linkedWiperControl) {
      this.add(this.linkedWiperControl);
    }
  }

  update() {
    this.topPot.update();
    this.botPot.update();
    this.internalWires.forEach((wire) => wire.update());
    this.linkedWiperControl?.update();
  }

  evaluateVoltage() {
    this.topPot.evaluateVoltage();
    this.botPot.evaluateVoltage();
    this.internalWires[0].setVoltage(this.topPot.port("output").voltage);
    this.internalWires[1].setVoltage(this.botPot.port("output").voltage);
    this.midPot.evaluateVoltage();
  }
}

class LinkedWiperControl extends Shape {
  constructor({ bottomDigipot, color, topDigipot }) {
    super({ name: "LinkedWiperControl" });

    this.bottomDigipot = bottomDigipot;
    this.topDigipot = topDigipot;

    this.bracketLine = makeLine([], { color, width: COMPONENT_STROKE_WIDTH });
    this.handle = makeFilledPolygon([
      [-LINK_HANDLE_WIDTH / 2, LINK_HANDLE_HEIGHT / 2],
      [LINK_HANDLE_WIDTH / 2, LINK_HANDLE_HEIGHT / 2],
      [LINK_HANDLE_WIDTH / 2, -LINK_HANDLE_HEIGHT / 2],
      [-LINK_HANDLE_WIDTH / 2, -LINK_HANDLE_HEIGHT / 2],
    ], { color });
    this.upArrow = makeFilledPolygon([
      [0, LINK_ARROW_HALF_HEIGHT],
      [-LINK_ARROW_HALF_WIDTH, -LINK_ARROW_HALF_HEIGHT],
      [LINK_ARROW_HALF_WIDTH, -LINK_ARROW_HALF_HEIGHT],
    ], { color });
    this.downArrow = makeFilledPolygon([
      [0, -LINK_ARROW_HALF_HEIGHT],
      [-LINK_ARROW_HALF_WIDTH, LINK_ARROW_HALF_HEIGHT],
      [LINK_ARROW_HALF_WIDTH, LINK_ARROW_HALF_HEIGHT],
    ], { color });
    this.valueLabel = new TextLabel("0", {
      color: "#ffffff",
      height: LINK_LABEL_HEIGHT,
      position: [0, 0, 0.01],
      renderOrder: 3,
      width: LINK_LABEL_WIDTH,
    });

    this.handle.add(this.valueLabel);
    this.add(this.bracketLine, this.handle, this.upArrow, this.downArrow);
    this.update();
  }

  get value() {
    return `${this.topDigipot.value}:${this.bottomDigipot.value}`;
  }

  containsWiperPoint(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    const { bottomPoint, centerY, topPoint } = this.getBracketPoints();

    return (
      this.containsHandlePoint(localPoint, centerY)
      || isPointNearSegment(localPoint, [LINK_BRACKET_TARGET_X, topPoint.y], [LINK_BRACKET_X, topPoint.y])
      || isPointNearSegment(localPoint, [LINK_BRACKET_X, topPoint.y], [LINK_BRACKET_X, bottomPoint.y])
      || isPointNearSegment(localPoint, [LINK_BRACKET_X, bottomPoint.y], [LINK_BRACKET_TARGET_X, bottomPoint.y])
    );
  }

  getWiperStepDirectionAt(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    const { centerY } = this.getBracketPoints();

    if (this.containsArrowPoint(localPoint, centerY + LINK_ARROW_OFFSET_Y)) {
      return 1;
    }

    if (this.containsArrowPoint(localPoint, centerY - LINK_ARROW_OFFSET_Y)) {
      return -1;
    }

    return 0;
  }

  getWiperStepAnchorWorldPoint(direction) {
    const { centerY } = this.getBracketPoints();

    return this.localToWorld(new THREE.Vector3(
      LINK_BRACKET_X,
      centerY + (direction > 0 ? LINK_ARROW_OFFSET_Y : -LINK_ARROW_OFFSET_Y),
      0,
    ));
  }

  getWiperDragOffset(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    return this.getBracketPoints().centerY - localPoint.y;
  }

  dragWiperTo(worldPoint, offsetY = 0, options = {}) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    this.setCenterY(localPoint.y + offsetY, options);
  }

  setCenterY(y, options = {}) {
    const { centerY } = this.getBracketPoints();
    this.moveByY(y - centerY, options);
  }

  stepWiper(direction, options = {}) {
    const delta = direction > 0 ? 1 : -1;

    this.moveByValue(delta, options);
  }

  snapWiper(options = {}) {
    this.topDigipot.snapWiper(options);
    this.bottomDigipot.snapWiper(options);
    this.update();
  }

  moveByY(deltaY, options = {}) {
    if (Math.abs(deltaY) < 0.0001) {
      return;
    }

    const topY = this.topDigipot.wiperY;
    const bottomY = this.bottomDigipot.wiperY;
    const minDelta = Math.max(
      this.topDigipot.bodyBottom - topY,
      this.bottomDigipot.bodyBottom - bottomY,
    );
    const maxDelta = Math.min(
      this.topDigipot.bodyTop - topY,
      this.bottomDigipot.bodyTop - bottomY,
    );
    const appliedDelta = clamp(deltaY, minDelta, maxDelta);

    this.topDigipot.setWiperY(topY + appliedDelta, options);
    this.bottomDigipot.setWiperY(bottomY + appliedDelta, options);
    this.update();
  }

  moveByValue(delta, options = {}) {
    const topValue = this.topDigipot.value;
    const bottomValue = this.bottomDigipot.value;
    const minDelta = Math.max(
      (this.topDigipot.model?.min ?? 0) - topValue,
      (this.bottomDigipot.model?.min ?? 0) - bottomValue,
    );
    const maxDelta = Math.min(
      (this.topDigipot.model?.max ?? 255) - topValue,
      (this.bottomDigipot.model?.max ?? 255) - bottomValue,
    );
    const appliedDelta = clamp(delta, minDelta, maxDelta);

    this.topDigipot.setWiperValue(topValue + appliedDelta, options);
    this.bottomDigipot.setWiperValue(bottomValue + appliedDelta, options);
    this.update();
  }

  update() {
    const { bottomPoint, centerY, topPoint } = this.getBracketPoints();

    updateLine(this.bracketLine, [
      [LINK_BRACKET_TARGET_X, topPoint.y, 0],
      [LINK_BRACKET_X, topPoint.y, 0],
      [LINK_BRACKET_X, bottomPoint.y, 0],
      [LINK_BRACKET_TARGET_X, bottomPoint.y, 0],
    ]);

    this.handle.position.set(LINK_BRACKET_X, centerY, 0.02);
    this.upArrow.position.set(LINK_BRACKET_X, centerY + LINK_ARROW_OFFSET_Y, 0.02);
    this.downArrow.position.set(LINK_BRACKET_X, centerY - LINK_ARROW_OFFSET_Y, 0.02);
    this.valueLabel.setText(String(this.topDigipot.value - this.bottomDigipot.value));
  }

  getBracketPoints() {
    const topPoint = this.worldToLocal(this.topDigipot.port("wiper").getWorldPosition());
    const bottomPoint = this.worldToLocal(this.bottomDigipot.port("wiper").getWorldPosition());

    return {
      bottomPoint,
      centerY: (topPoint.y + bottomPoint.y) / 2,
      topPoint,
    };
  }

  containsHandlePoint(localPoint, centerY) {
    return (
      localPoint.x >= LINK_BRACKET_X - LINK_HANDLE_WIDTH / 2 - LINK_HIT_PADDING
      && localPoint.x <= LINK_BRACKET_X + LINK_HANDLE_WIDTH / 2 + LINK_HIT_PADDING
      && localPoint.y >= centerY - LINK_HANDLE_HEIGHT / 2 - LINK_HIT_PADDING
      && localPoint.y <= centerY + LINK_HANDLE_HEIGHT / 2 + LINK_HIT_PADDING
    );
  }

  containsArrowPoint(localPoint, centerY) {
    return (
      localPoint.x >= LINK_BRACKET_X - LINK_ARROW_HALF_WIDTH - LINK_HIT_PADDING
      && localPoint.x <= LINK_BRACKET_X + LINK_ARROW_HALF_WIDTH + LINK_HIT_PADDING
      && localPoint.y >= centerY - LINK_ARROW_HALF_HEIGHT - LINK_HIT_PADDING
      && localPoint.y <= centerY + LINK_ARROW_HALF_HEIGHT + LINK_HIT_PADDING
    );
  }
}

function isPointNearSegment(point, start, end) {
  const startX = start[0];
  const startY = start[1];
  const segmentX = end[0] - startX;
  const segmentY = end[1] - startY;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (lengthSquared <= 0.000001) {
    return Math.hypot(point.x - startX, point.y - startY) <= LINK_HIT_PADDING;
  }

  const projection = clamp(
    ((point.x - startX) * segmentX + (point.y - startY) * segmentY) / lengthSquared,
    0,
    1,
  );
  const nearestX = startX + segmentX * projection;
  const nearestY = startY + segmentY * projection;

  return Math.hypot(point.x - nearestX, point.y - nearestY) <= LINK_HIT_PADDING;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
