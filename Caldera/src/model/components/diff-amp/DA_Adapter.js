export const DIFF_AMP_COMPONENT = "Diff.Amp.";

export class DifferentialAmpModelAdapter {
  constructor(installedModel = null) {
    this.installedModel = installedModel;
    this.packet = installedModel?.packet ?? installedModel ?? null;
    this.constants = this.packet?.payload?.constants ?? null;
    this.assumed = this.constants?.assumed ?? this.constants?.circuit ?? {};
    this.calibrated = this.constants?.calibrated ?? {};
  }

  get ready() {
    return Boolean(
      this.constants
        && Number.isFinite(this.sourceResistanceOhms)
        && Number.isFinite(this.fixedFeedbackResistanceOhms)
        && Number.isFinite(this.gainZeroResidualResistanceOhms)
        && Number.isFinite(this.variableFeedbackResistanceOhms)
        && Number.isFinite(this.offsetTopResistanceOhms)
        && Number.isFinite(this.offsetBottomResistanceOhms)
        && Number.isFinite(this.digipotResistanceOhms)
        && Number.isFinite(this.supplyVoltage)
        && Number.isFinite(this.wiperMax),
    );
  }

  get sourceResistanceOhms() {
    return getKnownNumber(this.assumed.sourceResistanceOhms);
  }

  get fixedFeedbackResistanceOhms() {
    return getKnownNumber(this.assumed.fixedFeedbackResistanceOhms);
  }

  get gainZeroResidualResistanceOhms() {
    return getKnownNumber(this.calibrated.gainZeroResidualResistanceOhms);
  }

  get variableFeedbackResistanceOhms() {
    return getKnownNumber(this.calibrated.variableFeedbackResistanceOhms);
  }

  get offsetTopResistanceOhms() {
    return getKnownNumber(this.calibrated.offsetTopResistanceOhms);
  }

  get offsetBottomResistanceOhms() {
    return getKnownNumber(this.calibrated.offsetBottomResistanceOhms);
  }

  get digipotResistanceOhms() {
    return getKnownNumber(this.assumed.digipotResistanceOhms)
      ?? getKnownNumber(this.assumed.digitpotResistanceOhms);
  }

  get supplyVoltage() {
    return getKnownNumber(this.assumed.supplyVoltage);
  }

  get wiperMax() {
    return getKnownNumber(this.assumed.wiperMax);
  }

  getFixedFeedbackEffectiveResistanceOhms() {
    return addKnown(this.fixedFeedbackResistanceOhms, this.gainZeroResidualResistanceOhms);
  }

  getOffsetRails() {
    if (!this.ready) {
      return null;
    }

    return {
      digipotResistanceOhms: this.digipotResistanceOhms,
      groundResistanceOhms: this.offsetBottomResistanceOhms,
      groundVoltage: 0,
      supplyResistanceOhms: this.offsetTopResistanceOhms,
      supplyVoltage: this.supplyVoltage,
    };
  }

  getDifferentialAmpOptions() {
    if (!this.ready) {
      return {};
    }

    return {
      fixedFeedbackResistanceOhms: this.fixedFeedbackResistanceOhms,
      gainZeroResidualResistanceOhms: this.gainZeroResidualResistanceOhms,
      sourceResistanceOhms: this.sourceResistanceOhms,
      variableFeedbackResistanceOhms: this.variableFeedbackResistanceOhms,
      wiperMax: this.wiperMax,
    };
  }

  getSensorModelOptions() {
    if (!this.ready) {
      return {};
    }

    return {
      physicsConstants: {
        digipotResistanceOhms: this.digipotResistanceOhms,
        fixedFeedbackResistanceOhms: this.fixedFeedbackResistanceOhms,
        gainZeroResidualResistanceOhms: this.gainZeroResidualResistanceOhms,
        offsetBottomResistanceOhms: this.offsetBottomResistanceOhms,
        offsetTopResistanceOhms: this.offsetTopResistanceOhms,
        sourceResistanceOhms: this.sourceResistanceOhms,
        supplyVoltage: this.supplyVoltage,
        variableFeedbackResistanceOhms: this.variableFeedbackResistanceOhms,
        wiperMax: this.wiperMax,
      },
    };
  }
}

export function createDifferentialAmpModelAdapter(installedModel = null) {
  const adapter = new DifferentialAmpModelAdapter(installedModel);

  return adapter.ready ? adapter : null;
}

function getKnownNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function addKnown(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? left + right : null;
}
