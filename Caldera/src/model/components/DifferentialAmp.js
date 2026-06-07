import { Constants } from "../Constants.js";
import { isKnownVoltage } from "../voltage.js";

export class DifferentialAmp {
  constructor({
    fixedFeedbackResistanceOhms = null,
    gain,
    gainZeroResidualResistanceOhms = 0,
    offset,
    sourceResistanceOhms = null,
    variableFeedbackResistanceOhms = null,
    wiperMax = null,
  } = {}) {
    this.fixedFeedbackResistanceOhms = fixedFeedbackResistanceOhms;
    this.gain = gain;
    this.gainZeroResidualResistanceOhms = gainZeroResidualResistanceOhms;
    this.offset = offset;
    this.outputVoltage = null;
    this.sourceInputVoltage = null;
    this.sourceResistanceOhms = sourceResistanceOhms;
    this.variableFeedbackResistanceOhms = variableFeedbackResistanceOhms;
    this.wiperMax = wiperMax;

    this.evaluate();
  }

  setSourceInputVoltage(voltage) {
    this.sourceInputVoltage = isKnownVoltage(Number(voltage)) ? Number(voltage) : null;
    return this.evaluate();
  }

  setOutputVoltage(voltage) {
    this.outputVoltage = isKnownVoltage(Number(voltage)) ? Number(voltage) : null;
    return this.evaluate();
  }

  evaluate() {
    this.nonInvertingVoltage = this.offset?.wiperVoltage ?? null;
    this.variableResistanceOhms = this.getVariableResistance();
    this.feedbackResistanceOhms = this.getFeedbackResistance();
    this.effectiveMultiplier = this.getEffectiveMultiplier();
    this.summingNodeVoltage = this.estimateSummingNodeVoltage();
    this.differentialInputErrorVoltage = this.getDifferentialInputErrorVoltage();
    this.expectedOutputVoltage = this.getExpectedOutputVoltage();
    this.outputErrorVoltage = this.getOutputErrorVoltage();
    this.feedbackJoinVoltage = this.getFeedbackJoinVoltage();
    this.estimatedSourceInputVoltage = this.estimateSourceInputVoltage();
    this.sourceCurrent = this.getSourceCurrent();
    this.estimatedSourceCurrent = this.getEstimatedSourceCurrent();

    return this.snapshot();
  }

  getVariableResistance() {
    const wiper = this.gain?.wiper;
    const max = this.wiperMax ?? this.gain?.max ?? Constants.DIGIPOT_MAX;

    if (
      !Number.isFinite(wiper)
      || !Number.isFinite(max)
      || max <= 0
      || !Number.isFinite(this.variableFeedbackResistanceOhms)
    ) {
      return null;
    }

    return this.variableFeedbackResistanceOhms * (wiper / max);
  }

  getEffectiveMultiplier() {
    if (
      !Number.isFinite(this.sourceResistanceOhms)
      || this.sourceResistanceOhms === 0
      || !Number.isFinite(this.feedbackResistanceOhms)
    ) {
      return null;
    }

    return this.feedbackResistanceOhms / this.sourceResistanceOhms;
  }

  estimateSummingNodeVoltage() {
    if (
      isKnownVoltage(this.sourceInputVoltage)
      && isKnownVoltage(this.outputVoltage)
      && Number.isFinite(this.sourceResistanceOhms)
      && this.sourceResistanceOhms > 0
      && Number.isFinite(this.feedbackResistanceOhms)
      && this.feedbackResistanceOhms > 0
    ) {
      const sourceConductance = 1 / this.sourceResistanceOhms;
      const feedbackConductance = 1 / this.feedbackResistanceOhms;

      return (
        this.sourceInputVoltage * sourceConductance
        + this.outputVoltage * feedbackConductance
      ) / (sourceConductance + feedbackConductance);
    }

    return isKnownVoltage(this.nonInvertingVoltage)
      ? this.nonInvertingVoltage
      : null;
  }

  getDifferentialInputErrorVoltage() {
    if (!isKnownVoltage(this.summingNodeVoltage) || !isKnownVoltage(this.nonInvertingVoltage)) {
      return null;
    }

    return this.summingNodeVoltage - this.nonInvertingVoltage;
  }

  getExpectedOutputVoltage() {
    if (
      !isKnownVoltage(this.sourceInputVoltage)
      || !isKnownVoltage(this.nonInvertingVoltage)
      || !isKnownVoltage(this.effectiveMultiplier)
    ) {
      return null;
    }

    return this.nonInvertingVoltage
      + (this.nonInvertingVoltage - this.sourceInputVoltage) * this.effectiveMultiplier;
  }

  getOutputErrorVoltage() {
    if (!isKnownVoltage(this.expectedOutputVoltage) || !isKnownVoltage(this.outputVoltage)) {
      return null;
    }

    return this.expectedOutputVoltage - this.outputVoltage;
  }

  estimateSourceInputVoltage() {
    if (
      !isKnownVoltage(this.outputVoltage)
      || !isKnownVoltage(this.summingNodeVoltage)
      || !Number.isFinite(this.feedbackResistanceOhms)
      || this.feedbackResistanceOhms === 0
      || !Number.isFinite(this.sourceResistanceOhms)
    ) {
      return null;
    }

    return this.summingNodeVoltage
      + ((this.summingNodeVoltage - this.outputVoltage) / this.feedbackResistanceOhms)
        * this.sourceResistanceOhms;
  }

  getSourceCurrent() {
    if (
      !isKnownVoltage(this.sourceInputVoltage)
      || !isKnownVoltage(this.summingNodeVoltage)
      || !Number.isFinite(this.sourceResistanceOhms)
      || this.sourceResistanceOhms === 0
    ) {
      return null;
    }

    return (this.sourceInputVoltage - this.summingNodeVoltage) / this.sourceResistanceOhms;
  }

  getEstimatedSourceCurrent() {
    if (
      !isKnownVoltage(this.outputVoltage)
      || !isKnownVoltage(this.summingNodeVoltage)
      || !Number.isFinite(this.feedbackResistanceOhms)
      || this.feedbackResistanceOhms === 0
    ) {
      return null;
    }

    return (this.summingNodeVoltage - this.outputVoltage) / this.feedbackResistanceOhms;
  }

  getFeedbackJoinVoltage() {
    if (
      !isKnownVoltage(this.outputVoltage)
      || !isKnownVoltage(this.summingNodeVoltage)
      || !Number.isFinite(this.variableResistanceOhms)
      || !Number.isFinite(this.feedbackResistanceOhms)
      || this.feedbackResistanceOhms === 0
    ) {
      return null;
    }

    return this.outputVoltage
      + (this.summingNodeVoltage - this.outputVoltage)
        * (this.variableResistanceOhms / this.feedbackResistanceOhms);
  }

  snapshot() {
    return {
      differentialInputErrorVoltage: this.differentialInputErrorVoltage,
      effectiveMultiplier: this.effectiveMultiplier,
      estimatedSourceCurrent: this.estimatedSourceCurrent,
      estimatedSourceInputVoltage: this.estimatedSourceInputVoltage,
      expectedOutputVoltage: this.expectedOutputVoltage,
      feedbackJoinVoltage: this.feedbackJoinVoltage,
      feedbackResistanceOhms: this.feedbackResistanceOhms,
      fixedFeedbackResistanceOhms: this.fixedFeedbackResistanceOhms,
      gainZeroResidualResistanceOhms: this.gainZeroResidualResistanceOhms,
      nonInvertingVoltage: this.nonInvertingVoltage,
      outputErrorVoltage: this.outputErrorVoltage,
      outputVoltage: this.outputVoltage,
      sourceCurrent: this.sourceCurrent,
      sourceInputVoltage: this.sourceInputVoltage,
      sourceResistanceOhms: this.sourceResistanceOhms,
      summingNodeVoltage: this.summingNodeVoltage,
      variableResistanceOhms: this.variableResistanceOhms,
    };
  }

  getFeedbackResistance() {
    if (
      !Number.isFinite(this.fixedFeedbackResistanceOhms)
      || !Number.isFinite(this.gainZeroResidualResistanceOhms)
      || !Number.isFinite(this.variableResistanceOhms)
    ) {
      return null;
    }

    return this.fixedFeedbackResistanceOhms
      + this.gainZeroResidualResistanceOhms
      + this.variableResistanceOhms;
  }
}
