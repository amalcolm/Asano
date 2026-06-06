import { Constants } from "../../model/Constants.js";

export const PHYSICS_STAGE_ONE_ID = "physics-empirical-blocks";
export const PHYSICS_STAGE_TWO_ID = "physics-gain-resistors";
export const PHYSICS_STAGE_THREE_ID = "physics-offset-divider";
export const PHYSICS_STAGE_FOUR_ID = "physics-full-formulae";
export const PHYSICS_STAGE_FIVE_ID = "physics-inverse-validation";

const MIN_MODEL_GAIN = 2;
const RESIDUAL_COLOR_SCALE_PADDING = 1.06;
const SIGNED_RESIDUAL_COLORSCALE = Object.freeze([
  [0, "#1877f2"],
  [0.5, "#ffffff"],
  [1, "#ff3b30"],
]);
const GAIN_MARKER_COLORS = Object.freeze([
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
  "#ffffff",
]);

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
    {
      defaultDetail: "awaiting blocks",
      id: PHYSICS_STAGE_TWO_ID,
      label: "2: Gain Resistors",
      title: "Physics Stage 2: Gain-side resistor model",
    },
    {
      defaultDetail: "awaiting centre fit",
      id: PHYSICS_STAGE_THREE_ID,
      label: "3: Offset Divider",
      title: "Physics Stage 3: Offset divider resistor model",
    },
    {
      defaultDetail: "awaiting resistor models",
      id: PHYSICS_STAGE_FOUR_ID,
      label: "4: Rebuild Formulae",
      title: "Physics Stage 4: Rebuilt differential amplifier formulae",
    },
    {
      defaultDetail: "awaiting formulae",
      id: PHYSICS_STAGE_FIVE_ID,
      label: "5: Validate",
      title: "Physics Stage 5: Sensor1 residual validation",
    },
  ];
}

export function getPhysicsStageData(stageId, {
  fitRows = [],
  mathModel = null,
  mathStageData = null,
  physicsModel = new DifferentialAmpPhysicsModel(),
  samples = [],
} = {}) {
  switch (stageId) {
    case PHYSICS_STAGE_ONE_ID:
      return getPhysicsStageOneData(mathStageData);
    case PHYSICS_STAGE_TWO_ID:
      return getPhysicsStageTwoData({ fitRows, mathModel, physicsModel });
    case PHYSICS_STAGE_THREE_ID:
      return getPhysicsStageThreeData({ fitRows, mathModel, physicsModel });
    case PHYSICS_STAGE_FOUR_ID:
      return getPhysicsStageFourData({ fitRows, mathModel, physicsModel });
    case PHYSICS_STAGE_FIVE_ID:
      return getPhysicsStageFiveData({ fitRows, mathModel, physicsModel, samples });
    default:
      return null;
  }
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

export function getPhysicsStageTwoData({
  fitRows = [],
  mathModel = null,
  physicsModel = new DifferentialAmpPhysicsModel(),
} = {}) {
  const derived = physicsModel.deriveFromMathModel(mathModel);
  const gain = derived.gain;
  const rows = getGainModelRows(fitRows);

  if (!gain.ready) {
    return {
      description: `
        <p><strong>Physics 2: Gain-Side Resistor Model</strong></p>
        <p>Run Physics Stage 1 first, then fit the empirical multiplier relationship so it can be translated into feedback resistor terms.</p>
      `,
      detail: rows.length ? "awaiting multiplier fit" : "awaiting stage 1",
      title: "Physics Stage 2: Gain-side resistor model",
      traces: [],
      value: "-",
      xTitle: "Gain Wiper",
      yTitle: "Feedback Resistance (Ω)",
    };
  }

  const dataGainMax = Math.max(0, ...rows.map((row) => row.gain).filter(Number.isFinite));
  const gainRangeMax = getPaddedWiperMax(dataGainMax);
  const lineX = [0, dataGainMax];
  const lineY = lineX.map((gainWiper) => getFeedbackResistanceOhms(gainWiper, gain));
  const measuredFeedback = rows.map((row) => row.computedMultiplier * gain.sourceResistanceOhms);
  const residuals = rows.map((row, index) => measuredFeedback[index] - getFeedbackResistanceOhms(row.gain, gain));
  const nominalDelta = gain.variableFeedbackNominalErrorOhms;

  return {
    description: `
      <p><strong>Physics 2: Gain-Side Resistor Model</strong></p>
      <p>Interprets the empirical multiplier fit as a feedback/source resistance ratio.</p>
      <ul>
        <li><strong>Source:</strong> ${formatOhms(gain.sourceResistanceOhms)} assumed known.</li>
        <li><strong>Fixed feedback:</strong> ${formatOhms(gain.fixedFeedbackResistanceOhms)} assumed known.</li>
        <li><strong>Variable feedback:</strong> ${formatOhms(gain.variableFeedbackEffectiveOhms)} inferred from the fitted gain slope.</li>
        <li><strong>Gain-zero residual:</strong> ${formatOhms(gain.gainZeroResidualResistanceOhms)} left as a constant series term.</li>
      </ul>
      <p>The nominal 100 kΩ digipot value is retained only as a reference. The fitted slope is allowed to calibrate the variable feedback value.</p>
    `,
    detail: `${formatOhms(gain.gainZeroResidualResistanceOhms)} residual`,
    formulae: getFormulaeHtml([
      "multiplier = m0 + m1 * gain",
      "variableFeedback = m1 * 255 * sourceResistance",
      "gainZeroResidual = m0 * sourceResistance - fixedFeedback",
      "feedback = fixedFeedback + gainZeroResidual + variableFeedback * gain / 255",
      "multiplier = feedback / sourceResistance",
    ]),
    title: "Physics Stage 2: Gain-side resistor model",
    traces: [
      {
        customdata: rows.map((row, index) => [
          row.name,
          formatOhms(measuredFeedback[index]),
          formatSignedOhms(residuals[index]),
          row.samples,
          row.offset,
        ]),
        hovertemplate: [
          "gain %{x:.0f}",
          "feedback %{customdata[1]}",
          "residual %{customdata[2]}",
          "offset %{customdata[4]}",
          "samples %{customdata[3]}",
          "%{customdata[0]}",
          "<extra></extra>",
        ].join("<br>"),
        marker: getSignedResidualMarker(residuals),
        mode: "markers",
        name: "measured feedback equivalent",
        type: "scatter",
        x: rows.map((row) => row.gain),
        y: measuredFeedback,
      },
      {
        hovertemplate: [
          "gain %{x:.0f}",
          "feedback model %{y:.1f} Ω",
          "<extra>calibrated feedback model</extra>",
        ].join("<br>"),
        line: { color: "#7ee787", width: 2.6 },
        mode: "lines",
        name: "calibrated feedback model",
        type: "scatter",
        x: lineX,
        y: lineY,
      },
    ],
    value: formatOhms(gain.variableFeedbackEffectiveOhms),
    xRange: [0, gainRangeMax],
    xTitle: "Gain Wiper",
    yTitle: "Feedback Resistance (Ω)",
    ...(Number.isFinite(nominalDelta)
      ? { nominalDeltaOhms: nominalDelta }
      : {}),
  };
}

export function getPhysicsStageThreeData({
  fitRows = [],
  mathModel = null,
  physicsModel = new DifferentialAmpPhysicsModel(),
} = {}) {
  const derived = physicsModel.deriveFromMathModel(mathModel);
  const offset = derived.offset;
  const rows = getOffsetModelRows(fitRows);

  if (!offset.ready) {
    return {
      description: `
        <p><strong>Physics 3: Offset Divider Resistor Model</strong></p>
        <p>Run the previous stages first, then fit the empirical centre relationship so it can be translated into offset divider resistor terms.</p>
      `,
      detail: rows.length ? "awaiting centre fit" : "awaiting stage 1",
      title: "Physics Stage 3: Offset divider resistor model",
      traces: [],
      value: "-",
      xTitle: "Offset Wiper",
      yTitle: "Centre (V)",
    };
  }

  const dataOffsetMax = Math.max(0, ...rows.map((row) => row.offset).filter(Number.isFinite));
  const offsetRangeMax = getPaddedWiperMax(dataOffsetMax);
  const lineEnd = dataOffsetMax > 0 ? dataOffsetMax : 1;
  const lineX = [0, lineEnd];
  const lineY = lineX.map((offsetWiper) => getOffsetCentreVoltage(offsetWiper, offset));
  const residuals = rows.map((row) => row.computedCentre - getOffsetCentreVoltage(row.offset, offset));

  return {
    description: `
      <p><strong>Physics 3: Offset Divider Resistor Model</strong></p>
      <p>Interprets the empirical centre fit as the wiper voltage of the offset divider.</p>
      <ul>
        <li><strong>Supply:</strong> ${formatVoltage(offset.supplyVoltage, 1)} assumed known.</li>
        <li><strong>Offset pot:</strong> ${formatOhms(offset.offsetPotResistanceOhms)} assumed known.</li>
        <li><strong>Total divider:</strong> ${formatOhms(offset.totalResistanceOhms)} inferred from the fitted centre slope.</li>
        <li><strong>Top:</strong> ${formatOhms(offset.topResistanceOhms)} inferred above the pot.</li>
        <li><strong>Bottom:</strong> ${formatOhms(offset.bottomResistanceOhms)} inferred below the pot.</li>
      </ul>
      <p>Positive centre slope means increasing offset raises the centre voltage, so the current wiper polarity is treated as bottom-to-top.</p>
    `,
    detail: `top ${formatOhms(offset.topResistanceOhms)},<br />bottom ${formatOhms(offset.bottomResistanceOhms)}`,
    formulae: getFormulaeHtml([
      "centre = c0 + c1 * offset",
      "totalResistance = supply * offsetPot / (255 * c1)",
      "bottomResistance = c0 / supply * totalResistance",
      "topResistance = totalResistance - offsetPot - bottomResistance",
      "centre = supply * (bottomResistance + offsetPot * offset / 255) / totalResistance",
    ]),
    title: "Physics Stage 3: Offset divider resistor model",
    traces: [
      {
        customdata: rows.map((row, index) => [
          row.name,
          formatVoltage(getOffsetCentreVoltage(row.offset, offset)),
          formatSignedMillivolts(residuals[index]),
          row.samples,
          row.gain,
        ]),
        hovertemplate: [
          "offset %{x:.0f}",
          "centre %{y:.4f} V",
          "fit %{customdata[1]}",
          "residual %{customdata[2]}",
          "gain %{customdata[4]}",
          "samples %{customdata[3]}",
          "%{customdata[0]}",
          "<extra></extra>",
        ].join("<br>"),
        marker: getSignedResidualMarker(residuals),
        mode: "markers",
        name: "measured centre blocks",
        type: "scatter",
        x: rows.map((row) => row.offset),
        y: rows.map((row) => row.computedCentre),
      },
      {
        hovertemplate: [
          "offset %{x:.0f}",
          "centre model %{y:.4f} V",
          "<extra>offset divider model</extra>",
        ].join("<br>"),
        line: { color: "#7ee787", width: 2.6 },
        mode: "lines",
        name: "offset divider model",
        type: "scatter",
        x: lineX,
        y: lineY,
      },
    ],
    value: formatOhms(offset.totalResistanceOhms),
    xRange: [0, offsetRangeMax],
    xTitle: "Offset Wiper",
    yTitle: "Centre (V)",
  };
}

export function getPhysicsStageFourData({
  fitRows = [],
  mathModel = null,
  physicsModel = new DifferentialAmpPhysicsModel(),
} = {}) {
  const derived = physicsModel.deriveFromMathModel(mathModel);
  const rows = getFullFormulaRows(fitRows);
  const gainColorDomain = getGainColorDomain(fitRows);

  if (!derived.ready || !rows.length) {
    return {
      description: `
        <p><strong>Physics 4: Rebuilt Formulae</strong></p>
        <p>Run the gain-side and offset-side resistor stages first. This stage combines them into the full differential amplifier equations.</p>
      `,
      detail: rows.length ? "awaiting resistor models" : "awaiting stage 1",
      title: "Physics Stage 4: Rebuilt differential amplifier formulae",
      traces: [],
      value: "-",
      xTitle: "Multiplier Residual",
      yTitle: "Centre Residual (V)",
    };
  }

  const gain = derived.gain;
  const offset = derived.offset;
  const formulae = getPhysicsFormulaeHtml(derived);
  const points = rows.map((row) => {
    const multiplier = getGainMultiplier(row.gain, gain);
    const centre = getOffsetCentreVoltage(row.offset, offset);

    return {
      ...row,
      centre,
      centreResidual: row.computedCentre - centre,
      multiplier,
      multiplierResidual: row.computedMultiplier - multiplier,
    };
  });
  const multiplierResiduals = points.map((point) => point.multiplierResidual);
  const centreResiduals = points.map((point) => point.centreResidual);
  const multiplierRms = getRootMeanSquare(multiplierResiduals);
  const centreRms = getRootMeanSquare(centreResiduals);
  const xRange = getSymmetricPaddedRange(multiplierResiduals, 0.001);
  const yRange = getSymmetricPaddedRange(centreResiduals, 0.001);

  return {
    description: `
      <p><strong>Physics 4: Rebuilt Formulae</strong></p>
      <p>Combines the calibrated gain-side resistor model and offset divider model into the full differential amplifier equations.</p>
      <p>This is a consistency check, not a new fit. Each point compares the rebuilt physics equations with the reduced empirical Gain & Offset blocks from Stage 1.</p>
    `,
    constants: getPhysicsConstantsHtml(derived),
    detail: `mult ${formatMultiplierResidual(multiplierRms)},<br />centre ${formatMillivolts(centreRms)}`,
    formulae,
    title: "Physics Stage 4: Rebuilt differential amplifier formulae",
    traces: [
      {
        hoverinfo: "skip",
        line: { color: "rgba(255, 255, 255, 0.32)", width: 1.2 },
        mode: "lines",
        name: "zero centre residual",
        type: "scatter",
        x: xRange,
        y: [0, 0],
      },
      {
        hoverinfo: "skip",
        line: { color: "rgba(255, 255, 255, 0.24)", width: 1.2 },
        mode: "lines",
        name: "zero multiplier residual",
        type: "scatter",
        x: [0, 0],
        y: yRange,
      },
      {
        customdata: points.map((point) => [
          point.name,
          formatMultiplierResidual(point.multiplier),
          formatSignedMultiplierResidual(point.multiplierResidual),
          formatVoltage(point.centre),
          formatSignedMillivolts(point.centreResidual),
          point.gain,
          point.offset,
          point.samples,
        ]),
        hovertemplate: [
          "multiplier residual %{x:.6f}",
          "centre residual %{y:.6f} V",
          "physics multiplier %{customdata[1]}",
          "multiplier error %{customdata[2]}",
          "physics centre %{customdata[3]}",
          "centre error %{customdata[4]}",
          "gain %{customdata[5]}",
          "offset %{customdata[6]}",
          "samples %{customdata[7]}",
          "%{customdata[0]}",
          "<extra></extra>",
        ].join("<br>"),
        marker: getGainMarker(points.map((point) => point.gain), gainColorDomain),
        mode: "markers",
        name: "rebuilt formula residuals",
        type: "scatter",
        x: multiplierResiduals,
        y: centreResiduals,
      },
    ],
    value: formatMillivolts(centreRms),
    xRange,
    xTitle: "Multiplier Residual",
    yRange,
    yTitle: "Centre Residual (V)",
  };
}

export function getPhysicsStageFiveData({
  fitRows = [],
  mathModel = null,
  physicsModel = new DifferentialAmpPhysicsModel(),
  samples = [],
} = {}) {
  const derived = physicsModel.deriveFromMathModel(mathModel);
  const rows = derived.ready ? getPhysicsInverseModelRows(samples, derived) : [];

  if (!derived.ready || rows.length < 2) {
    return {
      description: `
        <p><strong>Physics 5: Validate</strong></p>
        <p>Run the rebuilt formulae stage first. This stage then estimates Sensor1 from measured Sensor2 for each raw calibration sample.</p>
      `,
      constants: getPhysicsConstantsHtml(derived),
      detail: rows.length ? "need validation rows" : "awaiting formulae",
      formulae: getPhysicsFormulaeHtml(derived),
      title: "Physics Stage 5: Sensor1 residual validation",
      traces: [],
      value: "-",
      xTitle: "Measured Sensor1 (V)",
      yTitle: "Sensor1 Error (V)",
    };
  }

  const errors = rows.map((row) => row.error);
  const absoluteErrors = errors.map(Math.abs);
  const axisRanges = getInverseValidationAxisRanges(rows);
  const rmse = getRootMeanSquare(errors);
  const meanError = getMean(errors);
  const meanAbsoluteError = getMean(absoluteErrors);
  const minError = Math.min(...errors);
  const maxError = Math.max(...errors);
  const maxAbsError = Math.max(...absoluteErrors);
  const sensor1Range = getValueRange(rows.map((row) => row.measuredSensor1));
  const zeroTrace = sensor1Range
    ? {
      hoverinfo: "skip",
      line: { color: "rgba(255, 255, 255, 0.44)", dash: "dot", width: 1.4 },
      mode: "lines",
      name: "zero error",
      showlegend: false,
      type: "scatter",
      x: sensor1Range,
      y: [0, 0],
    }
    : null;

  return {
    description: `
      <p><strong>Physics 5: Validate</strong></p>
      <p>Uses the resistor-derived formulae to estimate Sensor1 from measured Sensor2, then plots the residual error against measured Sensor1.</p>
      <ul>
        <li><strong>RMSE:</strong> ${formatMillivolts(rmse)} overall Sensor1 estimate error.</li>
        <li><strong>MAE:</strong> ${formatMillivolts(meanAbsoluteError)} mean absolute error.</li>
        <li><strong>Mean:</strong> ${formatSignedMillivolts(meanError)} signed bias.</li>
        <li><strong>Range:</strong> ${formatSignedMillivolts(minError)} to ${formatSignedMillivolts(maxError)}.</li>
      </ul>
      <p>A flat cloud around zero suggests the resistor model is internally consistent. Curves, bands, or gain-dependent offsets point to the next correction term.</p>
    `,
    constants: getPhysicsConstantsHtml(derived),
    detail: `MAE ${formatMillivolts(meanAbsoluteError)},<br />worst ${formatMillivolts(maxAbsError)}`,
    formulae: getPhysicsFormulaeHtml(derived),
    title: "Physics Stage 5: Sensor1 residual validation",
    traces: [
      zeroTrace,
      {
        customdata: rows.map((row) => [
          formatWiper(row.gain),
          formatWiper(row.offset),
          formatVoltage(row.estimatedSensor1),
          formatSignedMillivolts(row.error),
          formatVoltage(row.measuredSensor2),
          formatMultiplierResidual(row.multiplier),
          formatVoltage(row.centre),
        ]),
        hovertemplate: [
          "measured Sensor1 %{x:.4f} V",
          "Sensor1 error %{y:.4f} V",
          "error %{customdata[3]}",
          "estimated Sensor1 %{customdata[2]}",
          "measured Sensor2 %{customdata[4]}",
          "gain %{customdata[0]}",
          "offset %{customdata[1]}",
          "multiplier %{customdata[5]}",
          "centre %{customdata[6]}",
          "<extra></extra>",
        ].join("<br>"),
        marker: getGainMarker(
          rows.map((row) => row.gain),
          getGainColorDomainFromSamples(samples),
        ),
        mode: "markers",
        name: "Sensor1 residuals",
        type: "scatter",
        x: rows.map((row) => row.measuredSensor1),
        y: rows.map((row) => row.error),
      },
    ].filter(Boolean),
    value: formatMillivolts(rmse),
    xRange: axisRanges.x,
    xTitle: "Measured Sensor1 (V)",
    yRange: axisRanges.y,
    yTitle: "Sensor1 Error (V)",
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

function getGainModelRows(fitRows) {
  return (fitRows ?? [])
    .filter((row) => (
      Number.isFinite(row.gain)
        && row.gain >= MIN_MODEL_GAIN
        && Number.isFinite(row.computedMultiplier)
    ))
    .sort((left, right) => left.gain - right.gain || left.offset - right.offset);
}

function getOffsetModelRows(fitRows) {
  return (fitRows ?? [])
    .filter((row) => (
      Number.isFinite(row.gain)
        && row.gain >= MIN_MODEL_GAIN
        && Number.isFinite(row.offset)
        && Number.isFinite(row.computedCentre)
    ))
    .sort((left, right) => left.offset - right.offset || left.gain - right.gain);
}

function getFullFormulaRows(fitRows) {
  return (fitRows ?? [])
    .filter((row) => (
      Number.isFinite(row.gain)
        && row.gain >= MIN_MODEL_GAIN
        && Number.isFinite(row.offset)
        && Number.isFinite(row.computedMultiplier)
        && Number.isFinite(row.computedCentre)
    ))
    .sort((left, right) => left.gain - right.gain || left.offset - right.offset);
}

function getGainColorDomain(fitRows) {
  return getSortedUniqueNumbers((fitRows ?? []).map((row) => row.gain));
}

function getGainColorDomainFromSamples(samples) {
  return getSortedUniqueNumbers((samples ?? []).map((sample) => sample.wipers?.gain));
}

function getValidationSamples(samples) {
  return (samples ?? []).filter((sample) => (
    sample.plot?.kind === "sensor-comparison"
      && Number.isFinite(sample.wipers?.gain)
      && sample.wipers.gain >= MIN_MODEL_GAIN
      && Number.isFinite(sample.wipers?.offset)
      && Number.isFinite(sample.sensorActual?.sensor1)
      && Number.isFinite(sample.sensorActual?.sensor2)
  ));
}

function getPhysicsInversePrediction(sample, derived) {
  const gainWiper = sample.wipers?.gain;
  const offsetWiper = sample.wipers?.offset;
  const sensor2 = sample.sensorActual?.sensor2;
  const multiplier = getGainMultiplier(gainWiper, derived.gain);
  const centre = getOffsetCentreVoltage(offsetWiper, derived.offset);

  if (!Number.isFinite(multiplier)
    || Math.abs(multiplier) < 1e-9
    || !Number.isFinite(centre)
    || !Number.isFinite(sensor2)) {
    return null;
  }

  return {
    centre,
    multiplier,
    sensor1: centre + (centre - sensor2) / multiplier,
  };
}

function getPhysicsInverseModelRows(samples, derived) {
  return getValidationSamples(samples)
    .map((sample) => {
      const prediction = getPhysicsInversePrediction(sample, derived);

      if (!prediction) {
        return null;
      }

      const measuredSensor1 = sample.sensorActual.sensor1;
      const error = prediction.sensor1 - measuredSensor1;

      return {
        centre: prediction.centre,
        error,
        estimatedSensor1: prediction.sensor1,
        gain: sample.wipers.gain,
        measuredSensor1,
        measuredSensor2: sample.sensorActual.sensor2,
        multiplier: prediction.multiplier,
        offset: sample.wipers.offset,
        sample,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.gain - right.gain
        || left.offset - right.offset
        || left.measuredSensor1 - right.measuredSensor1
    ));
}

function getFeedbackResistanceOhms(gainWiper, gain) {
  return gain.fixedFeedbackResistanceOhms
    + gain.gainZeroResidualResistanceOhms
    + gain.variableFeedbackEffectiveOhms * gainWiper / gain.wiperMax;
}

function getGainMultiplier(gainWiper, gain) {
  return getFeedbackResistanceOhms(gainWiper, gain) / gain.sourceResistanceOhms;
}

function getOffsetCentreVoltage(offsetWiper, offset) {
  return offset.supplyVoltage
    * (offset.bottomResistanceOhms + offset.offsetPotResistanceOhms * offsetWiper / offset.wiperMax)
    / offset.totalResistanceOhms;
}

function getPaddedWiperMax(wiperMax) {
  if (!Number.isFinite(wiperMax) || wiperMax <= 0) {
    return 1;
  }

  return Math.max(wiperMax * 1.06, wiperMax + 1);
}

function getPaddedRangeFromValues(values, fallback) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return fallback;
  }

  const min = Math.min(...knownValues);
  const max = Math.max(...knownValues);
  const padding = Math.max((max - min) * 0.08, 0.025);

  return [min - padding, max + padding];
}

function getInverseValidationAxisRanges(rows) {
  return {
    x: getPaddedRangeFromValues(rows.map((row) => row.measuredSensor1), [0, 1]),
    y: getPaddedRangeFromValues([
      0,
      ...rows.map((row) => row.error),
    ], [-0.025, 0.025]),
  };
}

function getValueRange(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return [Math.min(...knownValues), Math.max(...knownValues)];
}

function getSymmetricPaddedRange(values, fallbackExtent) {
  const knownValues = values.filter(Number.isFinite);
  const maxAbs = Math.max(0, ...knownValues.map((value) => Math.abs(value)));
  const extent = maxAbs > 0
    ? maxAbs * 1.16
    : fallbackExtent;

  return [-extent, extent];
}

function getRootMeanSquare(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  const sumSquares = knownValues.reduce((total, value) => total + value * value, 0);

  return Math.sqrt(sumSquares / knownValues.length);
}

function getMean(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length;
}

function getSignedResidualMarker(residuals, title = "Residual") {
  const knownResiduals = residuals.filter(Number.isFinite);
  const maxAbsResidual = Math.max(...knownResiduals.map((residual) => Math.abs(residual)));
  const scaleExtent = maxAbsResidual > 0
    ? maxAbsResidual * RESIDUAL_COLOR_SCALE_PADDING
    : 1;

  return {
    cmax: scaleExtent,
    cmin: -scaleExtent,
    color: residuals.map((residual) => (Number.isFinite(residual) ? residual : 0)),
    colorbar: { outlinewidth: 0, thickness: 10, title: { side: "right", text: title } },
    colorscale: SIGNED_RESIDUAL_COLORSCALE,
    line: { color: "rgba(255, 255, 255, 0.72)", width: 0.8 },
    opacity: 0.88,
    showscale: knownResiduals.length > 0,
    size: 7,
  };
}

function getGainMarker(gains, colorDomain = gains) {
  const uniqueGains = getSortedUniqueNumbers([...colorDomain, ...gains]);
  const gainIndexByValue = new Map(uniqueGains.map((gain, index) => [gain, index]));
  const colors = uniqueGains.map((_, index) => GAIN_MARKER_COLORS[index % GAIN_MARKER_COLORS.length]);

  return {
    cmax: Math.max(0.5, uniqueGains.length - 0.5),
    cmin: -0.5,
    color: gains.map((gain) => gainIndexByValue.get(gain) ?? null),
    colorbar: {
      outlinewidth: 0,
      thickness: 10,
      tickmode: "array",
      ticktext: uniqueGains.map(formatWiperTick),
      tickvals: uniqueGains.map((_, index) => index),
      title: { side: "right", text: "Gain" },
    },
    colorscale: getSteppedColorscale(colors),
    line: { color: "rgba(255, 255, 255, 0.72)", width: 0.8 },
    opacity: 0.9,
    showscale: uniqueGains.length > 0,
    size: 7,
  };
}

function getSortedUniqueNumbers(values) {
  return Array.from(new Set(values.filter(Number.isFinite)))
    .sort((left, right) => left - right);
}

function getSteppedColorscale(colors) {
  if (colors.length <= 1) {
    const color = colors[0] ?? "#ffffff";

    return [
      [0, color],
      [1, color],
    ];
  }

  const epsilon = 0.000001;

  return colors.flatMap((color, index) => {
    const start = index / colors.length;
    const end = (index + 1) / colors.length;
    const stops = [
      [start, color],
      [Math.max(start, end - epsilon), color],
    ];

    if (index === colors.length - 1) {
      stops.push([1, color]);
    }

    return stops;
  });
}

function formatWiperTick(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const FORMULA_ROW_GAP = "1.0em";
const FORMULA_ROW_HEIGHT_STRUT = "\\vphantom{\\dfrac{\\mathrm{variableFeedback}\\cdot\\mathrm{gain}}{\\mathrm{sourceResistance}\\cdot\\mathrm{wiperMax}}}";
const FORMULA_CONSTANT_COLOR = "#aeb9c9";
const FORMULA_INTERMEDIATE_COLOR = "#ffb3b3";
const FORMULA_MODEL_COLOR = "#b9d8ff";
const FORMULA_ESTIMATE_COLOR = "#b8f7c5";

function getFormulaeHtml(lines) {
  const alignedFormulae = lines.map(getAlignedFormulaLine).join(` \\\\[${FORMULA_ROW_GAP}] `);

  return [
    "<span class=\"analysis-stage-formulae__title\">Physics formulae</span>",
    `<span class="analysis-stage-formulae__math" data-analysis-formula-tex="${escapeHtml(`\\begin{aligned}${alignedFormulae}\\end{aligned}`)}"></span>`,
  ].join("");
}

function getAlignedFormulaLine(line) {
  return `${FORMULA_ROW_HEIGHT_STRUT}${String(line).replace(/\s*=\s*/, " &= ")}`;
}

function getFormulaSymbol(tex, color) {
  return `\\textcolor{${color}}{${tex}}`;
}

function getFormulaConstant(name) {
  return getFormulaSymbol(`\\mathrm{${name}}`, FORMULA_CONSTANT_COLOR);
}

function getFormulaVariable(name, color) {
  return getFormulaSymbol(`\\mathrm{${name}}`, color);
}

function getPhysicsFormulaeHtml() {
  const centre = getFormulaVariable("centre", FORMULA_MODEL_COLOR);
  const digitpotResistance = getFormulaConstant("digitpotResistance");
  const feedback = getFormulaVariable("feedback", FORMULA_INTERMEDIATE_COLOR);
  const fixedFeedback = getFormulaConstant("fixedFeedback");
  const gainZeroResidual = getFormulaConstant("gainZeroResidual");
  const multiplier = getFormulaVariable("multiplier", FORMULA_MODEL_COLOR);
  const offsetBottom = getFormulaConstant("offsetBottom");
  const offsetResistance = getFormulaVariable("offsetResistance", FORMULA_INTERMEDIATE_COLOR);
  const offsetTop = getFormulaConstant("offsetTop");
  const sensor1Est = getFormulaSymbol("\\mathrm{sensor1}_{est}", FORMULA_ESTIMATE_COLOR);
  const sensor2Est = getFormulaSymbol("\\mathrm{sensor2}_{est}", FORMULA_ESTIMATE_COLOR);
  const sourceResistance = getFormulaConstant("sourceResistance");
  const supply = getFormulaConstant("supply");
  const variableFeedback = getFormulaConstant("variableFeedback");
  const wiperMax = getFormulaConstant("wiperMax");

  return getFormulaeHtml([
    `${feedback} = ${fixedFeedback} + ${gainZeroResidual} + \\frac{${variableFeedback} \\cdot \\mathrm{gain}}{${wiperMax}}`,
    `${offsetResistance} = \\frac{${digitpotResistance} \\cdot \\mathrm{offset}}{${wiperMax}}`,
    `${centre} = ${supply} \\cdot \\frac{${offsetBottom} + ${offsetResistance}}{${offsetTop} + ${digitpotResistance} + ${offsetBottom}}`,
    `${multiplier} = \\frac{${feedback}}{${sourceResistance}}`,
    `${sensor2Est} = ${centre} - ${multiplier} \\cdot (\\mathrm{sensor1} - ${centre})`,
    `${sensor1Est} = ${centre} + \\frac{${centre} - \\mathrm{sensor2}}{${multiplier}}`,
  ]);
}

function getPhysicsConstantsHtml(derived) {
  const { gain, offset } = derived ?? {};

  if (!derived?.ready) {
    return "";
  }

  const physicsConstants = [
    getResistanceConstant("gainZeroResidual", gain.gainZeroResidualResistanceOhms),
    getResistanceConstant("variableFeedback", gain.variableFeedbackEffectiveOhms),
    getResistanceConstant("offsetTop", offset.topResistanceOhms),
    getResistanceConstant("offsetBottom", offset.bottomResistanceOhms),
  ];
  const circuitConstants = sortConstantsByUnit([
    getResistanceConstant("fixedFeedback", gain.fixedFeedbackResistanceOhms),
    getResistanceConstant("digitpotResistance", offset.offsetPotResistanceOhms),
    getResistanceConstant("sourceResistance", gain.sourceResistanceOhms),
    { name: "supply", value: formatConstantNumber(offset.supplyVoltage, 1), unit: "V" },
    { name: "wiperMax", value: formatWiper(gain.wiperMax), unit: "step" },
  ]);

  return [
    getConstantsTableHtml("Physics Model Constants", physicsConstants),
    getConstantsTableHtml("Circuit Constants", circuitConstants),
  ].join("");
}

function getConstantsTableHtml(title, rows) {
  return [
    "<section class=\"analysis-stage-constants__section\">",
    `<span class=\"analysis-stage-constants__title\">${escapeHtml(title)}</span>`,
    "<table class=\"analysis-stage-constants__table\">",
    "<tbody>",
    ...rows.map(getConstantRowHtml),
    "</tbody>",
    "</table>",
    "</section>",
  ].join("");
}

function getConstantRowHtml(row) {
  return [
    "<tr>",
    `<td>${escapeHtml(row.name)}</td>`,
    `<td>${escapeHtml(row.value)}</td>`,
    `<td>${escapeHtml(row.unit)}</td>`,
    "</tr>",
  ].join("");
}

function getResistanceConstant(name, resistanceOhms) {
  return {
    name,
    ...formatResistanceConstant(resistanceOhms),
  };
}

function formatResistanceConstant(value) {
  if (!Number.isFinite(value)) {
    return { unit: "Ω", value: "-" };
  }

  const absValue = Math.abs(value);

  return absValue >= 1000
    ? { unit: "kΩ", value: formatConstantNumber(value / 1000, 3) }
    : { unit: "Ω", value: formatConstantNumber(value, 1) };
}

function sortConstantsByUnit(rows) {
  const unitOrder = new Map([
    ["kΩ", 0],
    ["Ω", 0],
    ["V", 1],
    ["step", 2],
  ]);

  return [...rows].sort((left, right) => (
    (unitOrder.get(left.unit) ?? 99) - (unitOrder.get(right.unit) ?? 99)
      || left.unit.localeCompare(right.unit)
      || left.name.localeCompare(right.name)
  ));
}

function formatOhms(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const absValue = Math.abs(value);

  return absValue >= 1000
    ? `${(value / 1000).toFixed(2)} kΩ`
    : `${value.toFixed(1)} Ω`;
}

function formatSignedOhms(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${formatOhms(value)}`;
}

function formatVoltage(value, decimals = 6) {
  return Number.isFinite(value)
    ? `${value.toFixed(decimals)} V`
    : "-";
}

function formatConstantNumber(value, decimals) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "-";
}

function formatWiper(value) {
  return Number.isInteger(value) ? String(value) : formatMultiplierResidual(value);
}

function formatMultiplierResidual(value) {
  return Number.isFinite(value)
    ? value.toFixed(6)
    : "-";
}

function formatSignedMultiplierResidual(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${formatMultiplierResidual(value)}`;
}

function formatMillivolts(value) {
  return Number.isFinite(value)
    ? `${(value * 1000).toFixed(3)} mV`
    : "-";
}

function formatSignedMillivolts(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${(value * 1000).toFixed(3)} mV`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
