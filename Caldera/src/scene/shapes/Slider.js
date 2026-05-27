import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeFilledPolygon, makeLineLoop } from "../drawing.js";
import { isKnownVoltage } from "../voltage.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export class Slider extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    formatValue = formatSliderValue,
    label = "",
    leftValue = 0,
    model = null,
    outputOffset = 0,
    position = [0, 0, 0],
    rightValue = 1,
    signal = "multiplier",
    value = 128,
    wiperHalfWidth = 0.11,
  } = {}) {
    super({ name: "Slider", position });

    const bodyLeft = -0.95;
    const bodyRight = 0.95;
    const bodyTop = 0.18;
    const bodyBottom = -0.18;
    const wiperTopY = bodyTop + 0.08;
    const wiperShoulderY = bodyBottom - 0.06;
    const wiperTipY = bodyBottom - 0.26;
    const stepArrowHalfWidth = 0.045;
    const stepArrowHalfHeight = 0.07;
    const stepArrowOffsetX = wiperHalfWidth + 0.105;
    const stepArrowY = -0.03;
    this.bodyLeft = bodyLeft;
    this.bodyRight = bodyRight;
    this.formatValue = formatValue;
    this.leftValue = leftValue;
    this.model = null;
    this.outputOffset = outputOffset;
    this.rightValue = rightValue;
    this.wiperHalfWidth = wiperHalfWidth;
    this.wiperTopY = wiperTopY;
    this.wiperTipY = wiperTipY;
    this.stepArrowHalfWidth = stepArrowHalfWidth;
    this.stepArrowHalfHeight = stepArrowHalfHeight;
    this.stepArrowOffsetX = stepArrowOffsetX;
    this.stepArrowY = stepArrowY;
    this.wiperX = 0;
    this.value = 0;

    this.outputPort = this.addPort("output", [this.wiperX, wiperTipY], {
      direction: [0, -1, 0],
      kind: "output",
      signal,
    });

    this.add(makeLineLoop([
      [bodyLeft, bodyTop],
      [bodyRight, bodyTop],
      [bodyRight, bodyBottom],
      [bodyLeft, bodyBottom],
    ], { color, width: COMPONENT_STROKE_WIDTH }));

    this.wiper = makeFilledPolygon([
      [-wiperHalfWidth, wiperTopY],
      [wiperHalfWidth, wiperTopY],
      [wiperHalfWidth, wiperShoulderY],
      [0, wiperTipY],
      [-wiperHalfWidth, wiperShoulderY],
    ], { color });
    this.add(this.wiper);

    this.wiper.add(makeFilledPolygon([
      [-stepArrowOffsetX - stepArrowHalfWidth, stepArrowY],
      [-stepArrowOffsetX + stepArrowHalfWidth, stepArrowY + stepArrowHalfHeight],
      [-stepArrowOffsetX + stepArrowHalfWidth, stepArrowY - stepArrowHalfHeight],
    ], { color }));
    this.wiper.add(makeFilledPolygon([
      [stepArrowOffsetX + stepArrowHalfWidth, stepArrowY],
      [stepArrowOffsetX - stepArrowHalfWidth, stepArrowY - stepArrowHalfHeight],
      [stepArrowOffsetX - stepArrowHalfWidth, stepArrowY + stepArrowHalfHeight],
    ], { color }));

    if (label) {
      this.add(new TextLabel(label, {
        color,
        height: 0.32,
        position: [0, bodyTop + 0.30, 0],
        width: 0.5,
      }));
    }

    this.add(new TextLabel(this.formatValue(leftValue), {
      color,
      height: 0.23,
      position: [bodyLeft, bodyTop + 0.1, 0],
      width: 0.42,
    }));
    this.add(new TextLabel(this.formatValue(rightValue), {
      color,
      height: 0.23,
      position: [bodyRight, bodyTop + 0.1, 0],
      width: 0.42,
    }));

    this.wiperValueLabel = new TextLabel(this.formatValue(this.getSliderValue()), {
      color: "#ffffff",
      height: 0.23,
      position: [0, -0.03, 0.01],
      renderOrder: 3,
      width: 0.3,
    });
    this.wiper.add(this.wiperValueLabel);
    if (model) {
      this.setModel(model);
    } else {
      this.setWiperValue(value);
    }
  }

  setModel(model) {
    this.model = model;

    if (model.shape !== this) {
      model.shape = this;
    }

    this.syncWiperFromModel();
    return this;
  }

  containsWiperPoint(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    const padding = 0.08;

    return (
      localPoint.x >= this.wiperX - this.wiperHalfWidth - padding
      && localPoint.x <= this.wiperX + this.wiperHalfWidth + padding
      && localPoint.y >= this.wiperTipY - padding
      && localPoint.y <= this.wiperTopY + padding
    );
  }

  getWiperStepDirectionAt(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());

    if (this.containsStepArrowPoint(localPoint, this.stepArrowOffsetX)) {
      return 1;
    }

    if (this.containsStepArrowPoint(localPoint, -this.stepArrowOffsetX)) {
      return -1;
    }

    return 0;
  }

  containsStepArrowPoint(localPoint, centerOffsetX) {
    const padding = 0.08;
    const centerX = this.wiperX + centerOffsetX;

    return (
      localPoint.x >= centerX - this.stepArrowHalfWidth - padding
      && localPoint.x <= centerX + this.stepArrowHalfWidth + padding
      && localPoint.y >= this.stepArrowY - this.stepArrowHalfHeight - padding
      && localPoint.y <= this.stepArrowY + this.stepArrowHalfHeight + padding
    );
  }

  getWiperDragOffset(worldPoint) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    return this.wiperX - localPoint.x;
  }

  dragWiperTo(worldPoint, offsetX = 0, options = {}) {
    const localPoint = this.worldToLocal(worldPoint.clone());
    this.setWiperX(localPoint.x + offsetX, options);
  }

  setWiperX(x, options = {}) {
    this.wiperX = clamp(x, this.bodyLeft, this.bodyRight);
    this.value = this.getValueForX(this.wiperX);
    this.model?.setWiper(this.value, {
      ...options,
      syncShape: false,
    });
    this.updateWiper();
  }

  setWiperValue(value, options = {}) {
    const wiper = clamp(Math.round(value), 0, 255);

    if (this.model) {
      this.model.setWiper(wiper, options);

      if (options.syncShape === false) {
        this.value = wiper;
        this.wiperX = this.getXForValue(this.value);
        this.updateWiper();
      }

      return;
    }

    this.value = wiper;
    this.wiperX = this.getXForValue(this.value);
    this.updateWiper();
  }

  snapWiper(options = {}) {
    this.setWiperValue(this.getValueForX(this.wiperX), options);
  }

  stepWiper(direction, options = {}) {
    this.setWiperValue(this.value + (direction > 0 ? 1 : -1), options);
  }

  syncWiperFromModel() {
    this.value = clamp(Math.round(this.model?.value ?? this.value), 0, 255);
    this.wiperX = this.getXForValue(this.value);
    this.updateWiper();
  }

  updateWiper() {
    const outputValue = this.getOutputValue();
    const sliderValue = this.getSliderValue();

    this.wiper.position.x = this.wiperX;
    this.outputPort.position.x = this.wiperX;
    this.outputPort.voltage = outputValue;
    this.wiperValueLabel.setText(this.formatValue(sliderValue));
  }

  getOutputValue() {
    return this.getSliderValue() + this.outputOffset;
  }

  getSliderValue() {
    const travel = this.value / 255;
    return this.leftValue + (this.rightValue - this.leftValue) * travel;
  }

  getValueForX(x) {
    const travel = this.bodyRight - this.bodyLeft;
    const normalised = (clamp(x, this.bodyLeft, this.bodyRight) - this.bodyLeft) / travel;

    return clamp(Math.round(normalised * 255), 0, 255);
  }

  getXForValue(value) {
    const normalised = clamp(Math.round(value), 0, 255) / 255;

    return this.bodyLeft + normalised * (this.bodyRight - this.bodyLeft);
  }

  evaluateVoltage() {
    this.outputPort.voltage = this.getOutputValue();
  }
}

export function formatSliderValue(value) {
  if (!isKnownVoltage(value)) {
    return "?";
  }

  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatMultiplier(value) {
  return `x${formatSliderValue(value)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
