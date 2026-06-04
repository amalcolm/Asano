import { Constants } from "../../model/Constants.js";

export const PHYSICS_STAGE_ONE_ID = "physics-empirical-blocks";

export const DEFAULT_GAIN_SIDE_ASSUMPTIONS = Object.freeze({
  fixedFeedbackResistanceOhms: Constants.DIFFERENTIAL_AMP.fixedFeedbackResistanceOhms,
  nominalVariableFeedbackResistanceOhms: Constants.DIFFERENTIAL_AMP.variableFeedbackResistanceOhms,
  sourceResistanceOhms: Constants.DIFFERENTIAL_AMP.sourceResistanceOhms,
  wiperMax: Constants.DIGIPOT_MAX,
});

export const DEFAULT_OFFSET_SIDE_ASSUMPTIONS = Object.freeze({
  offsetPotResistanceOhms: Constants.DIGIPOT_RESISTANCE_OHMS,
  supplyVoltage: Constants.SUPPLY_VOLTAGE,
  wiperMax: Constants.DIGIPOT_MAX,
});

export class DifferentialAmpPhysicsModel {
  constructor({
    gainSide = DEFAULT_GAIN_SIDE_ASSUMPTIONS,
    offsetSide = DEFAULT_OFFSET_SIDE_ASSUMPTIONS,
  } = {}) {
    this.gainSide = { ...DEFAULT_GAIN_SIDE_ASSUMPTIONS, ...gainSide };
    this.offsetSide = { ...DEFAULT_OFFSET_SIDE_ASSUMPTIONS, ...offsetSide };
  }

  deriveFromMathModel(mathModel) {
    return derivePhysicsFromMathModel(mathModel, {
      gainSide: this.gainSide,
      offsetSide: this.offsetSide,
    });
  }
}

export function getPhysicsStages() {
  return [
    {
      defaultDetail: "uses math stage 1",
      id: PHYSICS_STAGE_ONE_ID,
      isPrimary: true,
      label: "1: Empirical Blocks",
      title: "Physics Stage 1: Empirical multiplier and centre blocks",
    },
  ];
}

export function getPhysicsStageOneData(mathStageData) {
  if (!mathStageData) {
    return {
      description: `
        <p><strong>Physics 1: Empirical Blocks</strong></p>
        <p>Run Math Stage 1 first. Physics Stage 1 reuses those reduced Gain & Offset blocks before translating them into resistor terms.</p>
      `,
      detail: "awaiting math stage 1",
      title: "Physics Stage 1: Empirical multiplier and centre blocks",
      traces: [],
      value: "-",
      xTitle: "Effective Multiplier",
      yTitle: "Centre (V)",
    };
  }

  return {
    ...mathStageData,
    description: `
      <p><strong>Physics 1: Empirical Blocks</strong></p>
      <p>Reuses the Math Stage 1 reduced block data. Each point is measured behaviour for one fixed Gain & Offset configuration.</p>
      <ul>
        <li><strong>Multiplier:</strong> later becomes the feedback/source resistance ratio.</li>
        <li><strong>Centre:</strong> later becomes the offset divider voltage.</li>
      </ul>
      <p>No new physics formula is applied here; this stage is the shared empirical bridge between raw calibration samples and both model tracks.</p>
    `,
    detail: mathStageData.detail ?? "reduced blocks",
    title: "Physics Stage 1: Empirical multiplier and centre blocks",
    value: mathStageData.value ?? "-",
  };
}

export function derivePhysicsFromMathModel(mathModel, {
  gainSide = DEFAULT_GAIN_SIDE_ASSUMPTIONS,
  offsetSide = DEFAULT_OFFSET_SIDE_ASSUMPTIONS,
} = {}) {
  const gain = deriveGainSidePhysics(mathModel?.multiplier, gainSide);
  const offset = deriveOffsetSidePhysics(mathModel?.centre, offsetSide);

  return {
    gain,
    offset,
    ready: Boolean(gain.ready && offset.ready),
  };
}

export function deriveGainSidePhysics(multiplierFit, assumptions = DEFAULT_GAIN_SIDE_ASSUMPTIONS) {
  const fit = normaliseFit(multiplierFit);
  const {
    fixedFeedbackResistanceOhms,
    nominalVariableFeedbackResistanceOhms,
    sourceResistanceOhms,
    wiperMax,
  } = { ...DEFAULT_GAIN_SIDE_ASSUMPTIONS, ...assumptions };

  const variableFeedbackEffectiveOhms =
    fit.ready && isPositiveFinite(sourceResistanceOhms) && isPositiveFinite(wiperMax)
      ? fit.slope * wiperMax * sourceResistanceOhms
      : null;
  const gainZeroFeedbackResistanceOhms =
    fit.ready && isPositiveFinite(sourceResistanceOhms)
      ? fit.intercept * sourceResistanceOhms
      : null;
  const gainZeroResidualResistanceOhms =
    Number.isFinite(gainZeroFeedbackResistanceOhms) && Number.isFinite(fixedFeedbackResistanceOhms)
      ? gainZeroFeedbackResistanceOhms - fixedFeedbackResistanceOhms
      : null;

  return {
    fixedFeedbackResistanceOhms,
    gainZeroFeedbackResistanceOhms,
    gainZeroResidualResistanceOhms,
    nominalVariableFeedbackResistanceOhms,
    sourceResistanceOhms,
    variableFeedbackEffectiveOhms,
    variableFeedbackNominalErrorOhms:
      Number.isFinite(variableFeedbackEffectiveOhms) && Number.isFinite(nominalVariableFeedbackResistanceOhms)
        ? variableFeedbackEffectiveOhms - nominalVariableFeedbackResistanceOhms
        : null,
    ready: fit.ready
      && isPositiveFinite(sourceResistanceOhms)
      && isPositiveFinite(wiperMax)
      && Number.isFinite(variableFeedbackEffectiveOhms)
      && Number.isFinite(gainZeroResidualResistanceOhms),
    wiperMax,
  };
}

export function deriveOffsetSidePhysics(centreFit, assumptions = DEFAULT_OFFSET_SIDE_ASSUMPTIONS) {
  const fit = normaliseFit(centreFit);
  const {
    offsetPotResistanceOhms,
    supplyVoltage,
    wiperMax,
  } = { ...DEFAULT_OFFSET_SIDE_ASSUMPTIONS, ...assumptions };

  const totalResistanceOhms =
    fit.ready
      && isPositiveFinite(supplyVoltage)
      && isPositiveFinite(offsetPotResistanceOhms)
      && isPositiveFinite(wiperMax)
      && fit.slope !== 0
      ? (supplyVoltage * offsetPotResistanceOhms) / (wiperMax * fit.slope)
      : null;
  const bottomResistanceOhms =
    Number.isFinite(totalResistanceOhms) && isPositiveFinite(supplyVoltage)
      ? (fit.intercept / supplyVoltage) * totalResistanceOhms
      : null;
  const topResistanceOhms =
    Number.isFinite(totalResistanceOhms)
      && Number.isFinite(bottomResistanceOhms)
      && Number.isFinite(offsetPotResistanceOhms)
      ? totalResistanceOhms - offsetPotResistanceOhms - bottomResistanceOhms
      : null;

  return {
    bottomResistanceOhms,
    offsetPotResistanceOhms,
    ready: fit.ready
      && Number.isFinite(totalResistanceOhms)
      && Number.isFinite(bottomResistanceOhms)
      && Number.isFinite(topResistanceOhms),
    supplyVoltage,
    topResistanceOhms,
    totalResistanceOhms,
    wiperMax,
  };
}

function normaliseFit(fit) {
  const intercept = Number(fit?.intercept);
  const slope = Number(fit?.slope);

  return {
    intercept,
    ready: Number.isFinite(intercept) && Number.isFinite(slope),
    slope,
  };
}

function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}
