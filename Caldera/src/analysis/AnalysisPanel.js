import Plotly from "plotly.js-dist-min";
import katex from "katex";
import { AnalysisDataset } from "./AnalysisDataset.js";
import { RAINBOW_COLORSCALE, formatMillivolts, getLinearFit } from "./AnalysisMath.js";
import { MODEL_TRACKS } from "./ModelMapping.js";
import { DifferentialAmp as MathDifferentialAmp } from "./modelling/math_DiffAmp.js";
import {
  DifferentialAmpPhysicsModel,
  PHYSICS_STAGE_FIVE_ID,
  PHYSICS_STAGE_FOUR_ID,
  PHYSICS_STAGE_ONE_ID,
  createDifferentialAmpModelPayload,
  getPhysicsStageData as getPhysicsStageModelData,
  getPhysicsStages,
} from "./modelling/phys_DiffAmp.js";
import { DifferentialAmpFormulaTester } from "./testing/math_DiffAmp.js";

const EMPTY_AXIS_RANGE = [0, 3.3];
const STAGE_TRACK_MATH = MODEL_TRACKS.MATH;
const STAGE_TRACK_PHYSICS = MODEL_TRACKS.PHYSICS;
const MODEL_UPLOAD_STATE_IDLE = "idle";
const MODEL_UPLOAD_STATE_UPLOADING = "uploading";
const MODEL_UPLOAD_STATE_UPLOADED = "uploaded";
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

export class AnalysisPanel {
  constructor({
    dataset = new AnalysisDataset(),
    firebaseStore = null,
    previewCompareMode = false,
    previewModelType = "",
    root,
    webView = null,
  } = {}) {
    this.dataset = dataset;
    this.firebaseStore = firebaseStore;
    this.previewCompareMode = previewCompareMode === true;
    this.previewModelType = previewModelType;
    this.root = root;
    this.webView = webView;
    this.badge = root?.querySelector("[data-analysis-badge]");
    this.chartRoot = root?.querySelector("[data-analysis-chart]");
    this.stageChartRoot = root?.querySelector("[data-analysis-stage-chart]");
    this.stageDescription = root?.querySelector("[data-analysis-stage-description]");
    this.stageConstants = root?.querySelector("[data-analysis-stage-constants]");
    this.stageFormulae = root?.querySelector("[data-analysis-stage-formulae]");
    this.copyAnalysisButton = root?.querySelector("[data-analysis-copy-analysis]");
    this.loadButton = root?.querySelector("[data-analysis-load-csv]");
    this.loadInput = root?.querySelector("[data-analysis-load-csv-input]");
    this.runStagesButton = root?.querySelector("[data-analysis-run-stages]");

    this.saveButton = root?.querySelector("[data-analysis-save-csv]");
    this.rangeCheckBadge = root?.querySelector("[data-analysis-range-check]");
    this.testStatus = root?.querySelector("[data-analysis-test-status]");
    this.dynamicControls = root?.querySelector("[data-analysis-dynamic-controls]");
    this.comparatorControls = root?.querySelector("[data-analysis-comparator-controls]");
    this.modelControls = root?.querySelector("[data-analysis-model-controls]");
    this.stagesContainer = root?.querySelector("[data-analysis-stages-container]");
    this.testingControls = root?.querySelector("[data-analysis-testing-controls]");
    this.stageButtons = new Map();
    this.stageDetails = new Map();
    this.formulaTestButton = null;
    this.activeModelIndicator = null;
    this.mathModelButton = null;
    this.mathStageButtons = new Set();
    this.physicsModelButton = null;
    this.physicsStageButtons = new Map();
    this.physicsStageDetails = new Map();
    this.physicsStageValues = new Map();
    this.stageInfo = null;
    this.stageValues = new Map();
    this.rmsMetric = root?.querySelector("[data-analysis-rms]");
    this.samplesMetric = root?.querySelector("[data-analysis-samples]");
    this.slopeMetric = root?.querySelector("[data-analysis-slope]");
    this.slopeRatioMetric = root?.querySelector("[data-analysis-slope-ratio]");

    this.model = new MathDifferentialAmp();
    this.physicsModel = new DifferentialAmpPhysicsModel();
    this.formulaTester = new DifferentialAmpFormulaTester();
    this.resizeObserver = null;
    this.observedChartRoots = new Set();
    this.activeAnalysisStage = null;
    this.activeStageTrack = null;
    this.activePhysicsStage = null;
    this.completedStageData = new Map();
    this.completedAnalysisStages = new Set();
    this.completedPhysicsStages = new Set();
    this.compareModelsButton = null;
    this.compareModelsDetail = null;
    this.compareModelsValue = null;
    this.modelUploadButton = null;
    this.modelUploadDetail = null;
    this.modelUploadOverlay = null;
    this.modelUploadStatus = null;
    this.modelUploadTextarea = null;
    this.modelUploadValue = null;
    this.modelUploadFields = null;
    this.installModelButton = null;
    this.modelUploadState = MODEL_UPLOAD_STATE_IDLE;
    this.uploadedModelRunId = null;
    this.sourceCsvFilename = null;
    this.isFormulaTesting = false;
    this.unlockedStages = new Set();
    this.isProcessing = false;
    this.isPhysicsStageProcessing = false;
    this.physicsStageRequestId = 0;
    this.hasRenderedTopFitLines = false;
    this.isRunningStages = false;
    this.autoRunHandle = null;
    this.backgroundMathRunHandle = null;

    this.loadButton?.addEventListener("click", () => {
      if (this.webView?.postRequestLoadCsv?.("")) {
        return;
      }

      this.loadInput?.click();
    });
    this.loadInput?.addEventListener("change", () => this.loadCsvFile());
    this.saveButton?.addEventListener("click", () => this.saveCsv());
    this.copyAnalysisButton?.addEventListener("click", () => this.copyAnalysis());
    this.runStagesButton?.addEventListener("click", () => this.runAnalysisStages());
    this.renderStageButtons();
    this.render();
  }

  addSampleFromModel(sampleContext) {
    const sample = this.dataset.addSampleFromModel(sampleContext);

    this.resetModelUploadState({ closeOverlay: true });
    this.cancelBackgroundMathValidation();
    this.model.clearCache();
    this.completedStageData.clear();
    this.hasRenderedTopFitLines = false;
    this.render();

    return sample;
  }

  addSample(sample) {
    const addedSample = this.dataset.addSample(sample);

    if (addedSample) {
      this.resetModelUploadState({ closeOverlay: true });
      this.cancelBackgroundMathValidation();
      this.model.clearCache();
      this.completedStageData.clear();
      this.hasRenderedTopFitLines = false;
      this.render();
    }

    return addedSample;
  }

  clear(options = {}) {
    this.dataset.clear(options);
    this.sourceCsvFilename = null;
    this.resetAnalysisState();
    this.render();
  }

  loadCsv({
    content,
    filename = "Dataset.csv",
  } = {}) {
    const result = this.dataset.loadCsv({ content, filename });

    this.sourceCsvFilename = filename;
    this.resetAnalysisState();
    this.clearTopChart();
    this.render({ updateTopChart: false });
    this.queueTopFitLineRender();
    this.setBadge(`${result.imported} loaded${result.skipped ? `, ${result.skipped} skipped` : ""}`);
    this.scheduleAutoModelRun();

    return result;
  }

  resetAnalysisState() {
    this.cancelAutoModelRun();
    this.cancelBackgroundMathValidation();
    this.model.clearCache();
    this.completedStageData.clear();
    this.activeStageTrack = null;
    this.activePhysicsStage = null;
    this.activeAnalysisStage = null;
    this.completedAnalysisStages.clear();
    this.completedPhysicsStages.clear();
    this.formulaTester.setEnabled(false);
    this.formulaTester.setModel(null);
    this.unlockedStages.clear();
    this.isFormulaTesting = false;
    this.resetModelUploadState({ closeOverlay: true });
    this.isProcessing = false;
    this.isPhysicsStageProcessing = false;
    this.physicsStageRequestId += 1;
    this.hasRenderedTopFitLines = false;
    this.isRunningStages = false;
    this.resetStageButtonSummaries();
    this.updateFormulaTestButton();
    this.updateRunStagesButton();
  }

  hasModelTrack(track) {
    return this.dataset.hasModelTrack?.(track) === true;
  }

  resetStageButtonSummaries() {
    this.model.getStages().forEach((stage) => {
      const button = this.stageButtons.get(stage.id);
      const value = this.stageValues.get(stage.id);
      const detail = this.stageDetails.get(stage.id);

      if (button) {
        button.hidden = true;
        button.dataset.active = "false";
        button.dataset.processing = "false";
        button.setAttribute("aria-pressed", "false");
      }

      if (value) {
        value.textContent = "-";
      }

      if (detail) {
        detail.textContent = stage.defaultDetail;
      }
    });

    getPhysicsStages().forEach((stage) => {
      const button = this.physicsStageButtons.get(stage.id);
      const value = this.physicsStageValues.get(stage.id);
      const detail = this.physicsStageDetails.get(stage.id);

      if (button) {
        button.hidden = true;
        button.dataset.active = "false";
        button.dataset.processing = "false";
        button.setAttribute("aria-pressed", "false");
      }

      if (value) {
        value.textContent = "-";
      }

      if (detail) {
        detail.textContent = stage.defaultDetail;
      }
    });

    if (this.stageDescription) {
      this.stageDescription.hidden = true;
      this.stageDescription.innerHTML = "";
    }

    if (this.stageFormulae) {
      this.updateFormulaeVisibility();
    } else {
      this.updateStageInfoVisibility();
    }
  }

  toggleFormulaTesting() {
    if (!this.isFormulaTestReady()) {
      this.setBadge("complete stage 5 before testing formulae");
      return;
    }

    if (!this.updateFormulaModelIfReady()) {
      this.setBadge("run stages before testing formulae");
      return;
    }

    this.isFormulaTesting = !this.isFormulaTesting;
    this.formulaTester.setEnabled(this.isFormulaTesting);
    this.updateFormulaTestButton();

    if (this.isFormulaTesting) {
      this.render({ updateStageButtons: false });
    }
  }

  handleFormulaTelemetry(message = {}) {
    const sample = this.formulaTester.updateTelemetry({
      settled: message.settled === true,
      voltages: message.voltages,
      wipers: message.wipers,
    });

    if (sample && this.isFormulaTesting) {
      this.renderCorrectionChart(this.formulaTester.getCorrectionChartData());
      this.renderStageChart(this.formulaTester.getChartData());
      this.updateFormulaTestButton();
    }
  }

  hasCompletedFinalStage() {
    const stages = this.model.getStages();
    const finalStage = stages[stages.length - 1];

    return Boolean(finalStage && this.completedAnalysisStages.has(finalStage.id));
  }

  hasCompletedMathStageOne() {
    return this.completedAnalysisStages.has("samples")
      && this.completedStageData.has("samples");
  }

  getLatestCompletedMathStageId() {
    return [...this.model.getStages()]
      .reverse()
      .find((stage) => (
        this.completedAnalysisStages.has(stage.id)
          && this.completedStageData.has(stage.id)
      ))?.id ?? null;
  }

  getLatestCompletedPhysicsStageId() {
    return [...getPhysicsStages()]
      .reverse()
      .find((stage) => (
        this.completedPhysicsStages.has(stage.id)
          && this.completedStageData.has(stage.id)
      ))?.id ?? null;
  }

  updateFormulaModelIfReady(plottableSamples = null) {
    if (!this.hasCompletedFinalStage() && !this.hasCompletedPhysicsValidationStage()) {
      this.formulaTester.setModel(null);
      return false;
    }

    const samples = plottableSamples
      ?? this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable);

    return this.formulaTester.setModel(this.model.getModel(samples));
  }

  isFormulaTestReady() {
    return this.activeStageTrack === STAGE_TRACK_PHYSICS
      ? this.hasCompletedPhysicsValidationStage()
      : this.hasCompletedFinalStage();
  }

  hasCompletedPhysicsFormulaStage() {
    return this.completedPhysicsStages.has(PHYSICS_STAGE_FOUR_ID)
      && this.completedStageData.has(PHYSICS_STAGE_FOUR_ID);
  }

  hasCompletedPhysicsValidationStage() {
    return this.completedPhysicsStages.has(PHYSICS_STAGE_FIVE_ID)
      && this.completedStageData.has(PHYSICS_STAGE_FIVE_ID);
  }

  getPhysicsFormulae() {
    return this.hasCompletedPhysicsFormulaStage()
      ? this.completedStageData.get(PHYSICS_STAGE_FOUR_ID)?.formulae ?? ""
      : "";
  }

  getPhysicsConstants() {
    return this.hasCompletedPhysicsFormulaStage()
      ? this.completedStageData.get(PHYSICS_STAGE_FOUR_ID)?.constants ?? ""
      : "";
  }

  canCompareModels() {
    return this.hasCompletedFinalStage() && this.hasCompletedPhysicsValidationStage();
  }

  selectAnalysisStage(stageId) {
    if (this.isProcessing) return Promise.resolve(false);

    const stages = this.model.getStages();
    const stageIds = stages.map((stage) => stage.id);
    if (!stageIds.includes(stageId) || stageId === this.activeAnalysisStage || !this.unlockedStages.has(stageId)) {
      return Promise.resolve(false);
    }

    this.activeStageTrack = STAGE_TRACK_MATH;
    this.activePhysicsStage = null;
    this.isProcessing = true;
    this.updateRunStagesButton();
    this.activeAnalysisStage = stageId;
    if (this.completedAnalysisStages.has(stageId)) {
      if (!this.renderCompletedAnalysisStage(stageId)) {
        const renderResult = this.render({ updateTopChart: false });
        this.cacheStageData(renderResult?.analysis?.stages);
      }
      this.isProcessing = false;
      this.updateRunStagesButton();
      return Promise.resolve(true);
    }

    const button = this.stageButtons.get(stageId);
    if (button) {
      button.hidden = false;
      button.dataset.active = "true";
      button.dataset.processing = "true";
      button.setAttribute("aria-pressed", "true");
    }

    const stageIndex = stageIds.indexOf(stageId);
    const nextStageId = stageIndex >= 0 && stageIndex < stageIds.length - 1
      ? stageIds[stageIndex + 1]
      : null;

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(() => this.finishAnalysisStageSelection({
          button,
          nextStageId,
          resolve,
          stageId,
        }), 10);
      });
    });
  }

  finishAnalysisStageSelection({
    button,
    nextStageId,
    resolve = () => {},
    stageId,
  }) {
    let renderResult = null;

    try {
      if (nextStageId && !this.unlockedStages.has(nextStageId)) {
        this.unlockedStages.add(nextStageId);
      }

      renderResult = this.render({ updateStageButtons: false, updateTopChart: false });
    } catch (error) {
      this.setBadge(error?.message || "analysis failed");
      this.finishStageProcessing(button);
      resolve(false);
      return;
    }

    Promise.resolve(renderResult?.stageRender)
      .catch((error) => {
        this.setBadge(error?.message || "analysis failed");
      })
      .finally(() => {
        this.completedAnalysisStages.add(stageId);
        this.cacheStageData(renderResult?.analysis?.stages);
        this.updateFormulaModelIfReady();
        this.updateStageButtons(renderResult?.analysis?.stages);
        this.finishStageProcessing(button);
        resolve(true);
      });
  }

  finishStageProcessing(button) {
    if (button) {
      button.dataset.processing = "false";
    }

    this.isProcessing = false;
    this.updateRunStagesButton();
  }

  async runAnalysisStages() {
    if (this.isRunningStages || this.isProcessing || this.isPhysicsStageProcessing) {
      return;
    }

    if (!this.dataset.getAnalysisSamples().length) {
      this.setBadge("load data before running a stage");
      return;
    }

    const track = this.getRunnableTrack();

    if (!track) {
      this.setBadge("no model stages for this dataset");
      return;
    }

    if (track === STAGE_TRACK_PHYSICS && this.activeStageTrack !== STAGE_TRACK_PHYSICS) {
      this.activatePhysicsModelTrack();
    } else if (track === STAGE_TRACK_MATH && this.activeStageTrack !== STAGE_TRACK_MATH) {
      this.activateMathModelTrack();
    }

    const firstStage = this.getNextAutoRunnableStage(track);

    if (!firstStage) {
      this.setBadge("stages already run");
      return;
    }

    this.isRunningStages = true;
    this.updateRunStagesButton();

    let completedCount = 0;
    let lastStage = null;

    try {
      while (true) {
        const nextStage = this.getNextAutoRunnableStage(track);

        if (!nextStage) {
          break;
        }

        const completed = track === STAGE_TRACK_PHYSICS
          ? await this.selectPhysicsStage(nextStage.id)
          : await this.selectAnalysisStage(nextStage.id);

        if (!completed) {
          break;
        }

        completedCount += 1;
        lastStage = nextStage;
      }

      this.setBadge(completedCount
        ? `${lastStage?.label ?? "stages"} complete`
        : "stage not run");
    } finally {
      this.isRunningStages = false;
      this.updateRunStagesButton();
    }
  }

  async previewModelComparison() {
    this.cancelAutoModelRun();

    if (!this.dataset.getAnalysisSamples().length) {
      this.setBadge("load data before previewing model");
      return false;
    }

    if (!this.hasComparableModelTracks()) {
      this.setBadge("model comparison unavailable for this dataset");
      return false;
    }

    const previewTrack = this.getPreviewModelTrack();
    const secondaryTrack = previewTrack === STAGE_TRACK_MATH
      ? STAGE_TRACK_PHYSICS
      : STAGE_TRACK_MATH;

    await this.runPreviewModelTrack(previewTrack);

    if (secondaryTrack === STAGE_TRACK_PHYSICS) {
      await this.runPreviewModelTrack(STAGE_TRACK_PHYSICS);
    } else if (!this.hasCompletedFinalStage()) {
      this.runBackgroundMathValidation();
    }

    this.activatePreviewModelTrack(previewTrack);
    this.updateComparatorControls();

    if (!this.canCompareModels()) {
      this.setBadge("model comparison awaiting validation");
      return false;
    }

    this.showModelComparator();
    return true;
  }

  getPreviewModelTrack() {
    return String(this.previewModelType ?? "").trim().toLowerCase() === STAGE_TRACK_MATH
      ? STAGE_TRACK_MATH
      : STAGE_TRACK_PHYSICS;
  }

  activatePreviewModelTrack(track) {
    if (track === STAGE_TRACK_MATH) {
      this.activateMathModelTrack();
      return;
    }

    this.activatePhysicsModelTrack();
  }

  async runPreviewModelTrack(track) {
    if (track === STAGE_TRACK_MATH) {
      this.activateMathModelTrack();
    } else {
      this.activatePhysicsModelTrack();
    }

    while (true) {
      const nextStage = this.getNextAutoRunnableStage(track);

      if (!nextStage) {
        break;
      }

      const completed = track === STAGE_TRACK_PHYSICS
        ? await this.selectPhysicsStage(nextStage.id)
        : await this.selectAnalysisStage(nextStage.id);

      if (!completed) {
        break;
      }
    }
  }

  getRunnableTrack() {
    if (this.activeStageTrack && this.hasModelTrack(this.activeStageTrack)) {
      return this.activeStageTrack;
    }

    if (this.hasModelTrack(STAGE_TRACK_PHYSICS)) {
      return STAGE_TRACK_PHYSICS;
    }

    if (this.hasModelTrack(STAGE_TRACK_MATH)) {
      return STAGE_TRACK_MATH;
    }

    return null;
  }

  getNextAutoRunnableStage(track = this.activeStageTrack) {
    if (track === STAGE_TRACK_PHYSICS) {
      if (!this.hasModelTrack(STAGE_TRACK_PHYSICS)) {
        return null;
      }

      return getPhysicsStages().find((stage) => (
        stage.isAutoRunnable !== false
          && this.isPhysicsStageUnlocked(stage.id)
          && !this.completedPhysicsStages.has(stage.id)
      )) ?? null;
    }

    if (track !== STAGE_TRACK_MATH || !this.hasModelTrack(STAGE_TRACK_MATH)) {
      return null;
    }

    return this.model.getStages().find((stage) => (
      stage.isAutoRunnable !== false
        && this.unlockedStages.has(stage.id)
        && !this.completedAnalysisStages.has(stage.id)
    )) ?? null;
  }

  updateRunStagesButton() {
    if (!this.runStagesButton) {
      return;
    }

    const hasSamples = this.dataset.getAnalysisSamples().length > 0;
    const track = this.getRunnableTrack();
    const nextStage = track ? this.getNextAutoRunnableStage(track) : null;

    this.runStagesButton.disabled = this.isRunningStages
      || this.isProcessing
      || this.isPhysicsStageProcessing
      || !hasSamples
      || !track
      || !nextStage;
    this.runStagesButton.dataset.running = String(this.isRunningStages);
    this.runStagesButton.textContent = this.isRunningStages ? "Running stages" : "Run stages";
  }

  scheduleAutoModelRun() {
    this.cancelAutoModelRun();

    this.autoRunHandle = window.setTimeout(() => {
      this.autoRunHandle = null;

      if (!this.dataset.getAnalysisSamples().length || this.isRunningStages) {
        return;
      }

      const track = this.hasModelTrack(STAGE_TRACK_PHYSICS)
        ? STAGE_TRACK_PHYSICS
        : (this.hasModelTrack(STAGE_TRACK_MATH) ? STAGE_TRACK_MATH : null);

      if (!track) {
        return;
      }

      if (track === STAGE_TRACK_PHYSICS) {
        this.activatePhysicsModelTrack();
      } else {
        this.activateMathModelTrack();
      }

      this.runAnalysisStages();
    }, 0);
  }

  cancelAutoModelRun() {
    if (this.autoRunHandle !== null) {
      window.clearTimeout(this.autoRunHandle);
      this.autoRunHandle = null;
    }
  }

  scheduleBackgroundMathValidation() {
    if (this.backgroundMathRunHandle !== null
      || this.hasCompletedFinalStage()
      || !this.hasCompletedPhysicsValidationStage()
      || !this.hasModelTrack(STAGE_TRACK_MATH)) {
      return;
    }

    this.backgroundMathRunHandle = window.setTimeout(() => {
      this.backgroundMathRunHandle = null;
      this.runBackgroundMathValidation();
    }, 0);
  }

  cancelBackgroundMathValidation() {
    if (this.backgroundMathRunHandle !== null) {
      window.clearTimeout(this.backgroundMathRunHandle);
      this.backgroundMathRunHandle = null;
    }
  }

  runBackgroundMathValidation() {
    if (this.hasCompletedFinalStage() || !this.hasModelTrack(STAGE_TRACK_MATH)) {
      return false;
    }

    const stages = this.model.getStages();
    const finalStage = stages[stages.length - 1];
    const plottableSamples = this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable);

    if (!finalStage || !plottableSamples.length) {
      return false;
    }

    const unlockedStages = new Set(this.unlockedStages);
    const completedStages = new Set(this.completedAnalysisStages);

    stages.forEach((stage) => {
      unlockedStages.add(stage.id);
      completedStages.add(stage.id);
    });

    let analysis = null;

    try {
      analysis = this.model.getAnalysis(
        finalStage.id,
        plottableSamples,
        unlockedStages,
        completedStages,
        { includeFitLines: false },
      );
    } catch (error) {
      return false;
    }

    const finalStageData = analysis?.stages?.get(finalStage.id) ?? analysis?.stage ?? null;

    if (!finalStageData?.traces?.length) {
      return false;
    }

    this.cacheStageData(analysis.stages);
    stages.forEach((stage) => {
      this.unlockedStages.add(stage.id);
      this.completedAnalysisStages.add(stage.id);
    });
    this.updateFormulaModelIfReady(plottableSamples);
    this.updateComparatorControls();

    return true;
  }

  setTestStatus({
    rangeCheck = false,
    running = false,
    status = "idle",
    test = null,
  } = {}) {
    if (running && this.modelUploadState === MODEL_UPLOAD_STATE_UPLOADED) {
      this.resetModelUploadState({ closeOverlay: true });
    }

    const statusText = String(status ?? "idle");
    const testText = test ? `${test}: ${statusText}` : statusText;

    if (this.testStatus) {
      this.testStatus.textContent = testText;
      this.testStatus.dataset.running = String(Boolean(running));
    }

    if (this.rangeCheckBadge) {
      this.rangeCheckBadge.hidden = !rangeCheck;
    }
  }

  setStatusBarText(text, { running = false } = {}) {
    if (!this.testStatus) {
      return;
    }

    this.testStatus.textContent = String(text ?? "");
    this.testStatus.dataset.running = String(Boolean(running));
  }

  saveCsv() {
    const csv = this.dataset.toCsv();
    const posted = this.webView?.postSaveCsv?.({
      content: csv,
      filename: this.dataset.getCsvFilename(),
    }) ?? false;

    this.setBadge(posted
      ? (this.dataset.samples.length ? "CSV save requested" : "CSV header requested")
      : "save unavailable");
  }

  async loadCsvFile() {
    const file = this.loadInput?.files?.[0] ?? null;

    if (!file) {
      return;
    }

    try {
      const result = this.loadCsv({
        content: await file.text(),
        filename: file.name,
      });

      this.setBadge(`${result.imported} loaded${result.skipped ? `, ${result.skipped} skipped` : ""}`);
    } catch (error) {
      this.setBadge(error?.message || "load failed");
    } finally {
      this.loadInput.value = "";
    }
  }

  async copyAnalysis() {
    const analysisCsv = this.getAnalysisCsv();
    const rows = this.model.getAnalysisFitRows(
      this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable),
    );

    try {
      await copyText(analysisCsv);
      this.setBadge(rows.length ? "analysis copied" : "analysis header copied");
    } catch {
      this.setBadge("copy failed");
    }
  }

  getAnalysisCsv() {
    return this.model.getAnalysisCsv(this.dataset.getAnalysisSamples());
  }

  render({
    includeTopFitLines = false,
    updateStageButtons = true,
    updateStageChart = true,
    updateTopChart = true,
  } = {}) {
    const samples = this.dataset.getAnalysisSamples();
    const hasMathTrack = this.hasModelTrack(STAGE_TRACK_MATH);

    const stageIds = this.model.getStages().map((stage) => stage.id);
    if (samples.length > 0 && hasMathTrack && this.unlockedStages.size === 0) {
      this.unlockedStages.add(stageIds[0]);
    } else if (samples.length === 0 || !hasMathTrack) {
      this.unlockedStages.clear();
      this.completedAnalysisStages.clear();
      this.activeAnalysisStage = null;
    }

    const plottableSamples = samples.filter((sample) => sample.isPlottable);
    const predictedSamples = plottableSamples.filter((sample) => (
      sample.plot?.kind === "sensor-comparison"
        && Number.isFinite(sample.sensorPredicted.sensor2)
    ));

    const analysis = this.model.getAnalysis(
      this.activeAnalysisStage,
      plottableSamples,
      this.unlockedStages,
      this.completedAnalysisStages,
      { includeFitLines: updateTopChart && includeTopFitLines },
    );
    this.cacheStageData(analysis.stages);
    const physicsStageData = this.activeStageTrack === STAGE_TRACK_PHYSICS && this.activePhysicsStage
      ? this.getCachedPhysicsStageData(this.activePhysicsStage, analysis.stages?.get("samples"))
      : null;
    const hasFormulaModel = this.updateFormulaModelIfReady(plottableSamples);
    const fit = getLinearFit(plottableSamples);
    const axisRanges = getAxisRanges({ fitLines: analysis.fitLines, plottableSamples, predictedSamples });

    if (!hasFormulaModel && this.isFormulaTesting) {
      this.isFormulaTesting = false;
      this.formulaTester.setEnabled(false);
    }

    this.updateMetrics({ fit, plottableSamples, samples });
    if (updateStageButtons) {
      if (this.activeStageTrack === STAGE_TRACK_PHYSICS) {
        this.updatePhysicsStageButtons(physicsStageData);
      } else {
        this.updateStageButtons(analysis.stages);
      }
    }
    this.updateFormulaeVisibility();
    const chartRender = updateTopChart
      ? (
        this.isFormulaTesting
          ? this.renderCorrectionChart(this.formulaTester.getCorrectionChartData())
          : this.renderChart({ axisRanges, fitLines: analysis.fitLines, plottableSamples, predictedSamples })
      )
      : null;
    if (updateTopChart && includeTopFitLines && !this.isFormulaTesting) {
      this.hasRenderedTopFitLines = true;
    }
    const stageRender = updateStageChart
      ? this.renderStageChart(
        this.isFormulaTesting
          ? this.formulaTester.getChartData()
          : (physicsStageData ?? analysis.stage),
      )
      : null;
    this.updateFormulaTestButton();
    this.updateRunStagesButton();

    return { analysis, chartRender, stageRender };
  }

  queueTopFitLineRender() {
    if (this.hasRenderedTopFitLines
      || !this.chartRoot
      || !this.dataset.getAnalysisSamples().some((sample) => sample.isPlottable)
      || this.isFormulaTesting) {
      return;
    }

    this.hasRenderedTopFitLines = true;
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!this.chartRoot
          || !this.dataset.getAnalysisSamples().some((sample) => sample.isPlottable)
          || this.isFormulaTesting) {
          this.hasRenderedTopFitLines = false;
          return;
        }

        try {
          this.render({
            includeTopFitLines: true,
            updateStageButtons: false,
            updateStageChart: false,
            updateTopChart: true,
          });
        } catch (error) {
          this.hasRenderedTopFitLines = false;
          this.setBadge(error?.message || "fit line render failed");
        }
      }, 0);
    });
  }

  clearTopChart() {
    if (this.chartRoot) {
      Plotly.purge(this.chartRoot);
    }
  }

  renderCompletedAnalysisStage(stageId) {
    const stageData = this.completedStageData.get(stageId);

    if (!stageData) {
      return false;
    }

    this.updateStageButtons(this.completedStageData);
    this.renderStageChart(stageData);
    this.updateFormulaTestButton();
    this.updateRunStagesButton();
    return true;
  }

  cacheStageData(stageDataById) {
    if (!stageDataById) {
      return;
    }

    for (const [stageId, stageData] of stageDataById) {
      if (stageData) {
        this.completedStageData.set(stageId, stageData);
      }
    }
  }

  activatePhysicsModelTrack() {
    if (this.isProcessing || this.isPhysicsStageProcessing) {
      return;
    }

    if (!this.hasModelTrack(STAGE_TRACK_PHYSICS)) {
      this.setBadge("physics model unavailable for this dataset");
      return;
    }

    if (!this.dataset.getAnalysisSamples().length) {
      this.setBadge("load data before opening physics model");
      return;
    }

    this.activeStageTrack = STAGE_TRACK_PHYSICS;
    this.activePhysicsStage = this.getLatestCompletedPhysicsStageId();
    this.activeAnalysisStage = null;
    const stageData = this.activePhysicsStage
      ? this.completedStageData.get(this.activePhysicsStage) ?? null
      : null;

    this.updatePhysicsStageButtons(stageData);
    this.renderStageChart(stageData);
    this.updateFormulaeVisibility();
    this.updateRunStagesButton();
    if (this.activePhysicsStage === PHYSICS_STAGE_FIVE_ID) {
      this.scheduleBackgroundMathValidation();
    }
    this.setBadge("physics model opened");
  }

  runPhysicsStageOneSelection() {
    return this.selectPhysicsStage(PHYSICS_STAGE_ONE_ID);
  }

  selectPhysicsStage(stageId) {
    if (this.isProcessing || this.isPhysicsStageProcessing) {
      return Promise.resolve(false);
    }

    if (!this.hasModelTrack(STAGE_TRACK_PHYSICS)) {
      this.setBadge("physics model unavailable for this dataset");
      return Promise.resolve(false);
    }

    if (!this.dataset.getAnalysisSamples().length) {
      this.setBadge("load data before running physics stage");
      return Promise.resolve(false);
    }

    const stage = getPhysicsStages().find((candidate) => candidate.id === stageId);

    if (!stage || !this.isPhysicsStageUnlocked(stageId)) {
      return Promise.resolve(false);
    }

    this.activeStageTrack = STAGE_TRACK_PHYSICS;
    this.activePhysicsStage = stageId;
    this.activeAnalysisStage = null;

    if (this.completedPhysicsStages.has(stageId) && this.completedStageData.has(stageId)) {
      const stageData = this.completedStageData.get(stageId);

      this.updatePhysicsStageButtons(stageData);
      this.renderStageChart(stageData);
      this.updateFormulaeVisibility();
      this.updateRunStagesButton();
      if (stageId === PHYSICS_STAGE_FIVE_ID) {
        this.scheduleBackgroundMathValidation();
      }

      return Promise.resolve(true);
    }

    this.isPhysicsStageProcessing = true;
    const requestId = ++this.physicsStageRequestId;
    this.setBadge(`running ${stage.label}`);
    this.updatePhysicsStageButtons(null, { processingStageId: stageId });
    this.updateRunStagesButton();

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(() => this.finishPhysicsStageSelection({
          requestId,
          resolve,
          stageId,
        }), 0);
      });
    });
  }

  activateMathModelTrack() {
    if (!this.hasModelTrack(STAGE_TRACK_MATH)) {
      this.setBadge("math model unavailable for this dataset");
      return;
    }

    this.isPhysicsStageProcessing = false;
    this.physicsStageRequestId += 1;
    this.activeStageTrack = STAGE_TRACK_MATH;
    this.activePhysicsStage = null;
    this.activeAnalysisStage = this.getLatestCompletedMathStageId();

    if (this.activeAnalysisStage && this.completedStageData.has(this.activeAnalysisStage)) {
      const stageData = this.completedStageData.get(this.activeAnalysisStage);

      this.updateStageButtons(this.completedStageData);
      this.renderStageChart(stageData);
      this.updateFormulaeVisibility();
      this.updateFormulaTestButton();
      this.updateRunStagesButton();
    } else {
      this.render({ updateStageButtons: true, updateTopChart: false });
    }

    this.setBadge("math model opened");
  }

  togglePhysicsModelTrack() {
    if (this.activeStageTrack === STAGE_TRACK_PHYSICS) {
      this.activateMathModelTrack();
      return;
    }

    this.activatePhysicsModelTrack();
  }

  getCachedPhysicsStageData(stageId, mathStageData = null) {
    if (this.completedPhysicsStages.has(stageId) && this.completedStageData.has(stageId)) {
      return this.completedStageData.get(stageId);
    }

    return this.activePhysicsStage === stageId
      ? this.buildPhysicsStageData(stageId, { mathStageData, useCachedOnly: true })
      : null;
  }

  buildPhysicsStageData(stageId, {
    mathStageData = null,
    useCachedOnly = false,
  } = {}) {
    const sourceStageData = stageId === PHYSICS_STAGE_ONE_ID
      ? (useCachedOnly
        ? (this.hasCompletedMathStageOne()
          ? mathStageData ?? this.completedStageData.get("samples") ?? null
          : null)
        : mathStageData ?? this.ensureMathStageOneData())
      : mathStageData ?? this.ensureMathStageOneData();
    const plottableSamples = this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable);
    const mathModel = plottableSamples.length
      ? this.model.getModel(plottableSamples)
      : null;
    const fitRows = plottableSamples.length
      ? this.model.getCachedFitRows(plottableSamples)
      : [];

    return getPhysicsStageModelData(stageId, {
      fitRows,
      mathModel,
      mathStageData: sourceStageData,
      physicsModel: this.physicsModel,
      samples: plottableSamples,
    });
  }

  finishPhysicsStageSelection({
    requestId,
    resolve = () => {},
    stageId,
  }) {
    if (requestId !== this.physicsStageRequestId || this.activeStageTrack !== STAGE_TRACK_PHYSICS) {
      resolve(false);
      return;
    }

    let stageData = null;

    try {
      stageData = this.buildPhysicsStageData(stageId);
    } catch (error) {
      this.setBadge(error?.message || "physics stage failed");
    } finally {
      this.isPhysicsStageProcessing = false;
    }

    if (requestId !== this.physicsStageRequestId || this.activeStageTrack !== STAGE_TRACK_PHYSICS) {
      resolve(false);
      return;
    }

    const completed = Boolean(stageData?.traces?.length);

    if (completed) {
      this.completedPhysicsStages.add(stageId);
      this.completedStageData.set(stageId, stageData);
    }

    this.updatePhysicsStageButtons(stageData);
    this.renderStageChart(stageData);
    this.updateFormulaeVisibility();
    this.updateRunStagesButton();
    this.setBadge(stageData?.traces?.length ? "physics stage complete" : "physics stage awaiting data");
    if (completed && stageId === PHYSICS_STAGE_FIVE_ID) {
      this.scheduleBackgroundMathValidation();
    }
    resolve(completed);
  }

  ensureMathStageOneData() {
    const cachedStage = this.completedStageData.get("samples");

    if (this.hasCompletedMathStageOne() && cachedStage) {
      return cachedStage;
    }

    const samples = this.dataset.getAnalysisSamples();
    const plottableSamples = samples.filter((sample) => sample.isPlottable);

    if (!plottableSamples.length) {
      return null;
    }

    const unlockedStages = new Set(this.unlockedStages);
    const completedStages = new Set(this.completedAnalysisStages);

    unlockedStages.add("samples");

    const analysis = this.model.getAnalysis("samples", plottableSamples, unlockedStages, completedStages);
    const stageData = analysis.stages?.get("samples") ?? analysis.stage ?? null;

    if (stageData) {
      this.unlockedStages.add("samples");
      this.unlockedStages.add("fits");
      this.completedAnalysisStages.add("samples");
      this.completedStageData.set("samples", stageData);
      this.cacheStageData(analysis.stages);
    }

    return stageData;
  }

  renderStageButtons() {
    if (!this.stagesContainer) return;

    // Stage buttons stay in the lower side panel; model-track controls live above the graph.
    const descriptionEl = this.stagesContainer.querySelector("[data-analysis-stage-description]");
    this.stagesContainer.innerHTML = "";
    if (this.dynamicControls && this.dynamicControls !== this.stagesContainer) {
      this.dynamicControls.innerHTML = "";
    }
    if (this.comparatorControls && this.comparatorControls !== this.stagesContainer) {
      this.comparatorControls.innerHTML = "";
    }
    if (this.modelControls && this.modelControls !== this.stagesContainer) {
      this.modelControls.innerHTML = "";
    }
    if (this.testingControls && this.testingControls !== this.stagesContainer) {
      this.testingControls.innerHTML = "";
    }

    this.stageButtons.clear();
    this.mathStageButtons.clear();
    this.physicsStageButtons.clear();
    this.physicsStageValues.clear();
    this.physicsStageDetails.clear();
    this.compareModelsButton = null;
    this.compareModelsDetail = null;
    this.compareModelsValue = null;
    this.modelUploadButton = null;
    this.modelUploadDetail = null;
    this.modelUploadValue = null;
    this.installModelButton = null;
    this.stageValues.clear();
    this.stageDetails.clear();

    this.activeModelIndicator = document.createElement("div");
    this.activeModelIndicator.className = "analysis-stage-button analysis-stage-button--model-indicator";
    this.activeModelIndicator.hidden = true;
    this.stagesContainer.appendChild(this.activeModelIndicator);

    const stages = this.model.getStages();
    stages.forEach((stage) => {
      const button = document.createElement("button");
      button.className = [
        "analysis-stage-button",
        "analysis-stage-button--math-stage",
        stage.isPrimary ? "analysis-stage-button--primary" : "",
      ].filter(Boolean).join(" ");
      button.type = "button";
      button.dataset.analysisStageButton = stage.id;

      const labelSpan = document.createElement("span");
      labelSpan.className = "analysis-stage-button__label";
      labelSpan.textContent = stage.label;

      const valueStrong = document.createElement("strong");
      valueStrong.dataset.analysisStageValue = stage.id;
      valueStrong.textContent = "-";

      const detailSpan = document.createElement("span");
      detailSpan.dataset.analysisStageDetail = stage.id;
      detailSpan.textContent = stage.defaultDetail;

      button.appendChild(labelSpan);
      button.appendChild(valueStrong);
      button.appendChild(detailSpan);

      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.selectAnalysisStage(stage.id);
      });
      button.addEventListener("click", (event) => {
        if (event.detail === 0) {
          this.selectAnalysisStage(stage.id);
        }
      });

      this.stagesContainer.appendChild(button);

      this.mathStageButtons.add(button);
      this.stageButtons.set(stage.id, button);
      this.stageValues.set(stage.id, valueStrong);
      this.stageDetails.set(stage.id, detailSpan);
    });

    this.renderPhysicsStageButtons();

    this.mathModelButton = document.createElement("button");
    this.mathModelButton.className = "analysis-stage-button analysis-stage-button--math-model";
    this.mathModelButton.hidden = true;
    this.mathModelButton.type = "button";
    this.mathModelButton.textContent = "Math Model";
    this.mathModelButton.addEventListener("click", () => this.activateMathModelTrack());

    this.physicsModelButton = document.createElement("button");
    this.physicsModelButton.className = "analysis-stage-button analysis-stage-button--physics-model";
    this.physicsModelButton.hidden = true;
    this.physicsModelButton.type = "button";
    this.physicsModelButton.textContent = "Physics Model";
    this.physicsModelButton.addEventListener("click", () => this.activatePhysicsModelTrack());

    this.compareModelsButton = document.createElement("button");
    this.compareModelsButton.className = "analysis-stage-button analysis-stage-button--comparator";
    this.compareModelsButton.disabled = true;
    this.compareModelsButton.type = "button";

    const compareLabel = document.createElement("span");
    compareLabel.className = "analysis-stage-button__label";
    compareLabel.textContent = "Compare Models";

    this.compareModelsValue = document.createElement("strong");
    this.compareModelsValue.textContent = "-";

    this.compareModelsDetail = document.createElement("span");
    this.compareModelsDetail.dataset.analysisStageDetail = "comparator";
    this.compareModelsDetail.textContent = "finish both validations";

    this.compareModelsButton.append(
      compareLabel,
      this.compareModelsValue,
      this.compareModelsDetail,
    );
    this.compareModelsButton.addEventListener("click", () => {
      if (this.canCompareModels()) {
        this.showModelComparator();
      }
    });

    this.modelUploadButton = document.createElement("button");
    this.modelUploadButton.className = "analysis-stage-button analysis-stage-button--upload-model";
    this.modelUploadButton.disabled = true;
    this.modelUploadButton.type = "button";

    this.modelUploadValue = document.createElement("strong");
    this.modelUploadValue.textContent = "Preparing upload...";

    this.modelUploadButton.append(this.modelUploadValue);
    this.modelUploadButton.addEventListener("click", () => {
      if (!this.modelUploadButton.disabled) {
        this.openModelUploadOverlay();
      }
    });

    this.installModelButton = document.createElement("button");
    this.installModelButton.className = "firebase-panel-button analysis-install-model-button";
    this.installModelButton.hidden = true;
    this.installModelButton.type = "button";
    this.installModelButton.append(
      createButtonLine("Install new"),
      createButtonLine(this.getInstallModelButtonModelText()),
    );
    this.installModelButton.addEventListener("click", () => this.handleInstallModelClick());

    this.formulaTestButton = document.createElement("button");
    this.formulaTestButton.className = "analysis-stage-button analysis-stage-button--formula-test";
    this.formulaTestButton.type = "button";
    this.formulaTestButton.textContent = "Test Formulae";
    this.formulaTestButton.addEventListener("click", () => this.toggleFormulaTesting());

    const infoGroup = document.createElement("div");
    infoGroup.className = "analysis-stage-info";
    infoGroup.hidden = true;
    infoGroup.appendChild(this.formulaTestButton);

    this.stageInfo = infoGroup;
    this.updateFormulaTestButton();
    this.stagesContainer.appendChild(infoGroup);

    if (descriptionEl) {
      this.stagesContainer.appendChild(descriptionEl);
      this.stageDescription = descriptionEl;
    }

    (this.modelControls ?? this.stagesContainer).append(
      this.mathModelButton,
      this.physicsModelButton,
    );
    (this.comparatorControls ?? this.modelControls ?? this.stagesContainer).append(
      this.compareModelsButton,
      this.modelUploadButton,
      this.installModelButton,
    );
    this.updateComparatorControls();
    this.updateModelUploadButton();
    this.updateModelTrackControls();
    this.updateFormulaeVisibility();
  }

  renderPhysicsStageButtons() {
    getPhysicsStages().forEach((stage) => {
      const button = document.createElement("button");
      const labelSpan = document.createElement("span");
      const valueStrong = document.createElement("strong");
      const detailSpan = document.createElement("span");

      button.className = "analysis-stage-button analysis-stage-button--physics-stage";
      button.hidden = true;
      button.type = "button";
      button.dataset.physicsStageButton = stage.id;

      labelSpan.className = "analysis-stage-button__label";
      labelSpan.textContent = stage.label;

      valueStrong.textContent = "-";
      detailSpan.textContent = stage.defaultDetail;

      button.appendChild(labelSpan);
      button.appendChild(valueStrong);
      button.appendChild(detailSpan);
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.selectPhysicsStage(stage.id);
      });
      button.addEventListener("click", (event) => {
        if (event.detail === 0) {
          this.selectPhysicsStage(stage.id);
        }
      });

      this.stagesContainer.appendChild(button);
      this.physicsStageButtons.set(stage.id, button);
      this.physicsStageValues.set(stage.id, valueStrong);
      this.physicsStageDetails.set(stage.id, detailSpan);
    });
  }

  updateMetrics({ fit, plottableSamples, samples }) {
    if (this.samplesMetric) {
      this.samplesMetric.textContent = String(samples.length);
    }

    if (this.slopeMetric) {
      this.slopeMetric.textContent = Number.isFinite(fit.slope)
        ? fit.slope.toFixed(3)
        : "-";
    }

    if (this.rmsMetric) {
      this.rmsMetric.textContent = formatMillivolts(fit.rms);
    }

    if (this.slopeRatioMetric) {
      this.slopeRatioMetric.textContent = formatRatio(
        getSlopeMultiplierRatio(this.dataset, fit, plottableSamples),
      );
    }

    this.setBadge(samples.length
      ? `${plottableSamples.length}/${samples.length} plotted`
      : "empty dataset");
  }

  updateStageButtons(stageDataById) {
    const isMathTrack = this.hasModelTrack(STAGE_TRACK_MATH)
      && this.activeStageTrack === STAGE_TRACK_MATH;

    if (!isMathTrack) {
      this.setMathStageButtonsHidden(true);
      this.updatePhysicsStageButtons(null);

      if (this.stageDescription && this.activeStageTrack !== STAGE_TRACK_PHYSICS) {
        this.stageDescription.hidden = true;
        this.stageDescription.innerHTML = "";
      }

      this.updateFormulaeVisibility();
      return;
    }

    this.setMathStageButtonsHidden(false);
    this.updatePhysicsStageButtons(null);

    const stages = this.model.getStages();
    const activeStageData = this.activeAnalysisStage
      ? stageDataById?.get(this.activeAnalysisStage) ?? null
      : null;

    stages.forEach((stage) => {
      const stageId = stage.id;
      const button = this.stageButtons.get(stageId);
      const value = this.stageValues.get(stageId);
      const detail = this.stageDetails.get(stageId);
      const isUnlocked = this.unlockedStages.has(stageId);
      const isCompleted = this.completedAnalysisStages.has(stageId);
      const active = stageId === this.activeAnalysisStage;
      const stageData = stageDataById?.get(stageId) ?? null;

      if (button) {
        button.hidden = !isUnlocked;
        button.dataset.active = String(active);
        button.setAttribute("aria-pressed", String(active));
      }

      if (value) {
        value.textContent = isUnlocked && isCompleted ? stageData?.value ?? "-" : "-";
      }

      if (detail) {
        detail.textContent = isUnlocked && isCompleted
          ? stageData?.detail ?? stage.defaultDetail
          : stage.defaultDetail;
      }
    });

    if (this.stageDescription) {
      this.stageDescription.hidden = !this.activeAnalysisStage || !activeStageData?.description;
      this.stageDescription.innerHTML = activeStageData?.description ?? "";
    }

    this.updateFormulaeVisibility();
  }

  updatePhysicsStageButtons(activeStageData = null, { processingStageId = null } = {}) {
    const hasMathTrack = this.hasModelTrack(STAGE_TRACK_MATH);
    const hasPhysicsTrack = this.hasModelTrack(STAGE_TRACK_PHYSICS);
    const isMathTrack = hasMathTrack && this.activeStageTrack === STAGE_TRACK_MATH;
    const isPhysicsTrack = hasPhysicsTrack && this.activeStageTrack === STAGE_TRACK_PHYSICS;

    this.setMathStageButtonsHidden(!isMathTrack);

    getPhysicsStages().forEach((stage) => {
      const stageId = stage.id;
      const button = this.physicsStageButtons.get(stageId);
      const value = this.physicsStageValues.get(stageId);
      const detail = this.physicsStageDetails.get(stageId);
      const isUnlocked = this.isPhysicsStageUnlocked(stageId);
      const isCompleted = this.completedPhysicsStages.has(stageId);
      const isProcessing = processingStageId === stageId;
      const isActive = isPhysicsTrack && stageId === this.activePhysicsStage;
      const stageData = this.completedStageData.get(stageId);

      if (button) {
        button.hidden = !isPhysicsTrack || !isUnlocked;
        button.dataset.active = String(isActive || isProcessing);
        button.dataset.processing = String(isProcessing);
        button.setAttribute("aria-pressed", String(isActive || isProcessing));
      }

      if (value) {
        value.textContent = isPhysicsTrack
          ? (isProcessing ? "..." : (isCompleted ? stageData?.value ?? "-" : "-"))
          : "-";
      }

      if (detail) {
        detail.innerHTML = isPhysicsTrack
          ? (isProcessing ? "running stage" : (isCompleted ? stageData?.detail ?? stage.defaultDetail : stage.defaultDetail))
          : stage.defaultDetail;
      }
    });

    if (this.stageDescription && isPhysicsTrack) {
      const stageData = activeStageData ?? this.completedStageData.get(this.activePhysicsStage) ?? null;

      this.stageDescription.hidden = !stageData?.description;
      this.stageDescription.innerHTML = stageData?.description ?? "";
    }

    this.updateModelTrackControls();
    this.updateFormulaeVisibility();
  }

  isPhysicsStageUnlocked(stageId) {
    const stages = getPhysicsStages();
    const index = stages.findIndex((stage) => stage.id === stageId);

    if (index < 0) {
      return false;
    }

    return index === 0 || this.completedPhysicsStages.has(stages[index - 1].id);
  }

  updateModelTrackControls() {
    const hasMathTrack = this.hasModelTrack(STAGE_TRACK_MATH);
    const hasPhysicsTrack = this.hasModelTrack(STAGE_TRACK_PHYSICS);
    const isMathTrack = !this.isFormulaTesting
      && hasMathTrack
      && this.activeStageTrack === STAGE_TRACK_MATH;
    const isPhysicsTrack = !this.isFormulaTesting
      && hasPhysicsTrack
      && this.activeStageTrack === STAGE_TRACK_PHYSICS;

    if (this.mathModelButton) {
      this.mathModelButton.hidden = !hasMathTrack;
      this.mathModelButton.disabled = isMathTrack;
      this.mathModelButton.dataset.active = String(isMathTrack);
      this.mathModelButton.setAttribute("aria-pressed", String(isMathTrack));
    }

    if (this.physicsModelButton) {
      this.physicsModelButton.hidden = !hasPhysicsTrack;
      this.physicsModelButton.disabled = isPhysicsTrack;
      this.physicsModelButton.dataset.active = String(isPhysicsTrack);
      this.physicsModelButton.setAttribute("aria-pressed", String(isPhysicsTrack));
    }

    this.updateComparatorControls();
    this.updateActiveModelIndicator();
  }

  updateComparatorControls() {
    if (!this.compareModelsButton) {
      return;
    }

    const hasBothTracks = this.hasComparableModelTracks();
    const canCompare = hasBothTracks && this.canCompareModels();
    const showInstallModel = this.previewCompareMode && hasBothTracks;

    this.compareModelsButton.hidden = showInstallModel || !hasBothTracks;
    this.compareModelsButton.disabled = !canCompare;
    this.compareModelsButton.dataset.active = String(canCompare);

    if (this.installModelButton) {
      this.installModelButton.hidden = !showInstallModel;
      this.installModelButton.disabled = !canCompare;
      this.updateInstallModelButtonLabel();
    }

    if (this.compareModelsValue) {
      this.compareModelsValue.textContent = canCompare ? "Ready" : "-";
    }

    if (this.compareModelsDetail) {
      this.compareModelsDetail.textContent = canCompare
        ? "both validations complete"
        : "finish both validations";
    }

    this.updateModelUploadButton();
  }

  updateModelUploadButton(formulaeVisible = this.isFormulaePanelVisible()) {
    if (!this.modelUploadButton) {
      return;
    }

    if (this.previewCompareMode) {
      this.modelUploadButton.hidden = true;
      this.modelUploadButton.disabled = true;
      this.modelUploadButton.dataset.active = "false";
      return;
    }

    const hasModelTools = this.hasComparableModelTracks();
    const isUploading = this.modelUploadState === MODEL_UPLOAD_STATE_UPLOADING;
    const isUploaded = this.modelUploadState === MODEL_UPLOAD_STATE_UPLOADED;
    const canUpload = Boolean(
      hasModelTools
        && formulaeVisible
        && this.firebaseStore
        && !isUploading
        && !isUploaded,
    );

    this.modelUploadButton.hidden = !hasModelTools;
    this.modelUploadButton.disabled = !canUpload;
    this.modelUploadButton.dataset.active = String(canUpload || isUploading);

    if (this.modelUploadValue) {
      this.modelUploadValue.textContent = getModelUploadButtonText({
        canUpload,
        firebaseStore: this.firebaseStore,
        state: this.modelUploadState,
      });
    }
  }

  resetModelUploadState({ closeOverlay = false } = {}) {
    this.modelUploadState = MODEL_UPLOAD_STATE_IDLE;
    this.uploadedModelRunId = null;

    if (closeOverlay) {
      this.closeModelUploadOverlay();
    }

    if (this.modelUploadStatus) {
      this.modelUploadStatus.textContent = "ready";
    }

    this.updateModelUploadButton();
  }

  hasComparableModelTracks() {
    return this.hasModelTrack(STAGE_TRACK_MATH)
      && this.hasModelTrack(STAGE_TRACK_PHYSICS);
  }

  handleInstallModelClick() {
    this.setBadge("model install pending");
  }

  getInstallModelButtonModelText() {
    const displayType = getDisplayModelType(this.previewModelType);

    return displayType ? `${displayType} Model` : "Model";
  }

  updateInstallModelButtonLabel() {
    if (!this.installModelButton) {
      return;
    }

    const [firstLine, secondLine] = this.installModelButton.querySelectorAll("span");

    if (firstLine) {
      firstLine.textContent = "Install new";
    }

    if (secondLine) {
      secondLine.textContent = this.getInstallModelButtonModelText();
    }
  }

  isFormulaePanelVisible() {
    return Boolean(this.stageFormulae
      && !this.stageFormulae.hidden
      && this.stageFormulae.innerHTML.trim());
  }

  openModelUploadOverlay() {
    const overlay = this.ensureModelUploadOverlay();
    const fields = this.modelUploadFields;
    const packet = this.createModelUploadPacket();
    const details = packet.details ?? {};
    const timestamp = getUploadTimestamp({ createdAt: packet.createdAt });

    fields.date.value = timestamp.date;
    fields.time.value = timestamp.time;
    fields.process.value = details.process ?? "";
    fields.component.value = details.component ?? "";
    fields.model.value = details.model ?? "";
    fields.name.value = details.name ?? "";
    fields.notes.value = details.notes ?? "";
    fields.researcher.value = details.researcher ?? "";
    fields.revision.value = String(details.revision ?? 1);
    this.updateModelUploadPacketPreview();

    overlay.hidden = false;
    fields.name.focus();
    fields.name.select();
  }

  closeModelUploadOverlay() {
    if (this.modelUploadOverlay) {
      this.modelUploadOverlay.hidden = true;
    }
  }

  ensureModelUploadOverlay() {
    if (this.modelUploadOverlay) {
      return this.modelUploadOverlay;
    }

    const overlay = document.createElement("div");
    const form = document.createElement("form");
    const closeButton = document.createElement("button");
    const title = document.createElement("h2");
    const body = document.createElement("div");
    const grid = document.createElement("div");
    const notesLabel = document.createElement("label");
    const notesCaption = document.createElement("span");
    const notesTextarea = document.createElement("textarea");
    const textareaLabel = document.createElement("label");
    const textareaCaption = document.createElement("span");
    const textarea = document.createElement("textarea");
    const footer = document.createElement("div");
    const dateTime = document.createElement("div");
    const actions = document.createElement("div");
    const cancelButton = document.createElement("button");
    const uploadButton = document.createElement("button");
    const status = document.createElement("span");

    overlay.className = "analysis-model-upload-overlay";
    overlay.hidden = true;
    form.className = "analysis-model-upload-overlay__panel";
    body.className = "analysis-model-upload-overlay__body";
    closeButton.className = "analysis-model-upload-overlay__close";
    closeButton.type = "button";
    closeButton.textContent = "X";
    title.textContent = "Upload Model";
    grid.className = "analysis-model-upload-overlay__grid";
    notesLabel.className = "analysis-model-upload-overlay__notes";
    notesCaption.textContent = "Notes";
    notesTextarea.name = "notes";
    notesTextarea.spellcheck = true;
    textareaLabel.className = "analysis-model-upload-overlay__json";
    textareaCaption.textContent = "Data packet";
    textarea.spellcheck = false;
    textarea.wrap = "off";
    footer.className = "analysis-model-upload-overlay__footer";
    dateTime.className = "analysis-model-upload-overlay__datetime";
    actions.className = "analysis-model-upload-overlay__actions";
    cancelButton.className = "analysis-panel__button";
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    uploadButton.className = "analysis-panel__button";
    uploadButton.type = "submit";
    uploadButton.textContent = "Upload";
    status.className = "analysis-model-upload-overlay__status";
    status.textContent = "ready";

    const fields = {
      component: createModelUploadInput({ label: "Component", name: "component" }),
      date: createModelUploadInput({ label: "Date", name: "date", readOnly: true }),
      model: createModelUploadInput({ label: "Model", name: "model", readOnly: true }),
      name: createModelUploadInput({ label: "Name", name: "name" }),
      notes: {
        input: notesTextarea,
        label: notesLabel,
      },
      process: createModelUploadInput({ label: "Process", name: "process" }),
      researcher: createModelUploadInput({ label: "Researcher", name: "researcher" }),
      revision: createModelUploadInput({ label: "Revision number", name: "revision", type: "number" }),
      time: createModelUploadInput({ label: "Time", name: "time", readOnly: true }),
    };

    [
      fields.process,
      fields.component,
      fields.model,
      fields.name,
      fields.revision,
      fields.researcher,
    ].forEach(({ input, label }) => {
      input.addEventListener("input", () => this.updateModelUploadPacketPreview());
      grid.appendChild(label);
    });

    notesTextarea.addEventListener("input", () => this.updateModelUploadPacketPreview());
    notesLabel.append(notesCaption, notesTextarea);
    [fields.date, fields.time].forEach(({ label }) => dateTime.appendChild(label));
    textareaLabel.append(textareaCaption, textarea);
    actions.append(cancelButton, uploadButton, status);
    footer.append(dateTime, actions);
    body.append(grid, notesLabel, textareaLabel, footer);
    form.append(closeButton, title, body);
    overlay.appendChild(form);

    closeButton.addEventListener("click", () => this.closeModelUploadOverlay());
    cancelButton.addEventListener("click", () => this.closeModelUploadOverlay());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.uploadModelPacket(uploadButton);
    });

    this.modelUploadOverlay = overlay;
    this.modelUploadStatus = status;
    this.modelUploadTextarea = textarea;
    this.modelUploadFields = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, field.input]),
    );

    (this.root ?? document.body).appendChild(overlay);

    return overlay;
  }

  updateModelUploadPacketPreview() {
    if (!this.modelUploadTextarea || !this.modelUploadFields) {
      return;
    }

    const packet = this.createModelUploadPacket({
      component: this.modelUploadFields.component.value,
      date: this.modelUploadFields.date.value,
      model: this.modelUploadFields.model.value,
      name: this.modelUploadFields.name.value,
      notes: this.modelUploadFields.notes.value,
      process: this.modelUploadFields.process.value,
      researcher: this.modelUploadFields.researcher.value,
      revision: this.modelUploadFields.revision.value,
      time: this.modelUploadFields.time.value,
    });

    this.modelUploadTextarea.value = formatModelUploadPacketPreview(packet);
  }

  getCurrentModelSnapshotForUpload() {
    const plottableSamples = this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable);

    if (plottableSamples.length) {
      return this.model.getModel(plottableSamples);
    }

    return this.formulaTester.getModel();
  }

  async uploadModelPacket(uploadButton) {
    if (!this.firebaseStore || !this.modelUploadTextarea) {
      return;
    }

    if (this.modelUploadState === MODEL_UPLOAD_STATE_UPLOADING
      || this.modelUploadState === MODEL_UPLOAD_STATE_UPLOADED) {
      return;
    }

    let packet = null;

    try {
      packet = JSON.parse(this.modelUploadTextarea.value);
    } catch (error) {
      this.modelUploadStatus.textContent = "invalid JSON";
      return;
    }

    uploadButton.disabled = true;
    this.modelUploadState = MODEL_UPLOAD_STATE_UPLOADING;
    this.modelUploadStatus.textContent = "uploading";
    this.closeModelUploadOverlay();
    this.updateModelUploadButton();

    try {
      const result = await this.firebaseStore.saveModelRun(packet);
      const uploadId = result?.id ?? "uploaded";

      this.uploadedModelRunId = uploadId;
      this.modelUploadState = MODEL_UPLOAD_STATE_UPLOADED;
      this.modelUploadStatus.textContent = uploadId;
      this.setStatusBarText(uploadId);
      this.setBadge("model uploaded");
    } catch (error) {
      this.modelUploadState = MODEL_UPLOAD_STATE_IDLE;
      this.modelUploadStatus.textContent = "upload failed";
      this.setStatusBarText("upload failed");
      console.error("Firebase model upload failed", error);
    } finally {
      uploadButton.disabled = this.modelUploadState === MODEL_UPLOAD_STATE_UPLOADED;
      this.updateModelUploadButton();
    }
  }

  createModelUploadPacket({
    component = null,
    createdAt = null,
    date = null,
    model = null,
    name = null,
    notes = null,
    process = null,
    researcher = null,
    revision = 1,
    time = null,
  } = {}) {
    const sourceFilename = this.sourceCsvFilename ?? this.dataset.getCsvFilename();
    const metadata = this.dataset.metadata ?? {};
    const activeModelType = this.activeStageTrack || "unknown";
    const timestamp = getUploadTimestamp({ createdAt, date, time });
    const modelSnapshot = this.getCurrentModelSnapshotForUpload();
    const derivedPhysicsModel = modelSnapshot?.ready
      ? this.physicsModel.deriveFromMathModel(modelSnapshot)
      : null;
    const diffAmpModelPayload = createDifferentialAmpModelPayload(derivedPhysicsModel);
    return {
      schemaVersion: 1,
      createdAt: timestamp.createdAt,
      kind: "caldera.modelRun",
      dataset: {
        category: metadata.category ?? "",
        component: metadata.name ?? "",
        sampleCount: this.dataset.getAnalysisSamples().length,
        source: metadata.source ?? "",
        sourceFilename,
      },
      details: {
        component: normaliseText(component) ?? metadata.name ?? "",
        model: normaliseText(model) ?? formatModelType(activeModelType),
        modelType: activeModelType,
        name: normaliseText(name) ?? getDefaultUploadName(sourceFilename, metadata.name),
        notes: normaliseText(notes) ?? "",
        process: normaliseText(process) ?? metadata.category ?? "",
        researcher: normaliseText(researcher) ?? "",
        revision: getPositiveInteger(revision, 1),
      },
      payload: diffAmpModelPayload,
    };
  }

  showModelComparator() {
    const chartData = this.getCircuitFormulaComparisonChart();

    if (!chartData?.traces?.length) {
      this.setBadge("no circuit formula estimates to compare");
      return;
    }

    if (this.stageDescription) {
      this.stageDescription.hidden = false;
      this.stageDescription.innerHTML = chartData.description ?? "";
    }

    this.renderStageChart(chartData);
    this.setBadge("circuit formula comparison ready");
  }

  getCircuitFormulaComparisonChart() {
    const rows = this.getCircuitFormulaComparisonRows();

    if (!rows.length) {
      return null;
    }

    const axisRange = getAbsoluteErrorComparisonRange(rows);
    const oldWins = rows.filter((row) => row.oldAbsErrorMv < row.derivedAbsErrorMv).length;
    const derivedWins = rows.filter((row) => row.derivedAbsErrorMv < row.oldAbsErrorMv).length;
    const meanImprovementMv = getMean(rows.map((row) => row.improvementMv));

    return {
      description: `
        <p><strong>Circuit Formula vs Derived Model</strong></p>
        <p>Compares the old circuit-view Sensor1 estimate from the source data with the newly derived Sensor1 estimate.</p>
        <ul>
          <li><strong>X:</strong> old circuit formula absolute Sensor1 error.</li>
          <li><strong>Y:</strong> derived model absolute Sensor1 error.</li>
          <li>Points below the diagonal favour the derived model.</li>
        </ul>
      `,
      title: "Circuit formula vs derived model Sensor1 error",
      traces: [
        {
          hoverinfo: "skip",
          line: { color: "rgba(255, 255, 255, 0.46)", dash: "dot", width: 1.5 },
          mode: "lines",
          name: "equal error",
          showlegend: false,
          type: "scatter",
          x: axisRange,
          y: axisRange,
        },
        {
          customdata: rows.map((row) => [
            formatHoverValue(row.gain, 0),
            formatHoverValue(row.offset, 0),
            formatHoverVoltage(row.measuredSensor1),
            formatHoverVoltage(row.measuredSensor2),
            formatHoverVoltage(row.oldEstimate),
            formatHoverVoltage(row.derivedEstimate),
            formatSignedMillivolts(row.oldError),
            formatSignedMillivolts(row.derivedError),
            formatSignedMillivoltValue(row.improvementMv),
          ]),
          hovertemplate: [
            "old abs error %{x:.3f} mV",
            "derived abs error %{y:.3f} mV",
            "old estimate %{customdata[4]}",
            "derived estimate %{customdata[5]}",
            "old residual %{customdata[6]}",
            "derived residual %{customdata[7]}",
            "improvement %{customdata[8]}",
            "measured Sensor1 %{customdata[2]}",
            "measured Sensor2 %{customdata[3]}",
            "gain %{customdata[0]}",
            "offset %{customdata[1]}",
            "<extra></extra>",
          ].join("<br>"),
          marker: {
            ...getMarkerColorSettings(rows.map((row) => row.sample), false),
            line: { color: "rgba(255, 255, 255, 0.72)", width: 0.8 },
            opacity: 0.88,
            size: 6.5,
          },
          mode: "markers",
          name: "Sensor1 estimate comparison",
          type: "scatter",
          x: rows.map((row) => row.oldAbsErrorMv),
          y: rows.map((row) => row.derivedAbsErrorMv),
        },
      ],
      value: formatSignedMillivolts(meanImprovementMv / 1000),
      xRange: axisRange,
      xTitle: "Old Circuit Formula |Sensor1 Error| (mV)",
      yRange: axisRange,
      yTitle: "Derived Model |Sensor1 Error| (mV)",
      detail: `${derivedWins} improved, ${oldWins} worse`,
    };
  }

  getCircuitFormulaComparisonRows() {
    const samples = this.dataset.getAnalysisSamples().filter((sample) => sample.isPlottable);
    const derivedModel = this.model.getModel(samples);

    if (!derivedModel.ready) {
      return [];
    }

    return samples
      .map((sample) => {
        const oldEstimate = sample.sensorEstimated?.sensor1;
        const measuredSensor1 = sample.sensorActual?.sensor1;
        const measuredSensor2 = sample.sensorActual?.sensor2;
        const gain = sample.wipers?.gain;
        const offset = sample.wipers?.offset;
        const derivedEstimate = getDerivedSensor1Estimate({
          gain,
          model: derivedModel,
          offset,
          sensor2: measuredSensor2,
        });

        if (!Number.isFinite(oldEstimate)
          || !Number.isFinite(derivedEstimate)
          || !Number.isFinite(measuredSensor1)
          || !Number.isFinite(measuredSensor2)
          || !Number.isFinite(gain)
          || !Number.isFinite(offset)) {
          return null;
        }

        const oldError = oldEstimate - measuredSensor1;
        const derivedError = derivedEstimate - measuredSensor1;

        return {
          derivedAbsErrorMv: Math.abs(derivedError * 1000),
          derivedError,
          derivedEstimate,
          gain,
          improvementMv: Math.abs(oldError * 1000) - Math.abs(derivedError * 1000),
          measuredSensor1,
          measuredSensor2,
          offset,
          oldAbsErrorMv: Math.abs(oldError * 1000),
          oldError,
          oldEstimate,
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

  updateActiveModelIndicator() {
    if (!this.activeModelIndicator) {
      return;
    }

    const isMathTrack = !this.isFormulaTesting
      && this.hasModelTrack(STAGE_TRACK_MATH)
      && this.activeStageTrack === STAGE_TRACK_MATH;
    const isPhysicsTrack = !this.isFormulaTesting
      && this.hasModelTrack(STAGE_TRACK_PHYSICS)
      && this.activeStageTrack === STAGE_TRACK_PHYSICS;

    if (this.stagesContainer) {
      const activeTrack = isMathTrack
        ? STAGE_TRACK_MATH
        : (isPhysicsTrack ? STAGE_TRACK_PHYSICS : "");

      if (activeTrack) {
        this.stagesContainer.dataset.activeModelTrack = activeTrack;
      } else {
        delete this.stagesContainer.dataset.activeModelTrack;
      }
    }

    this.activeModelIndicator.hidden = !isMathTrack && !isPhysicsTrack;
    this.activeModelIndicator.className = [
      "analysis-stage-button",
      "analysis-stage-button--model-indicator",
      isMathTrack ? "analysis-stage-button--math-model" : "",
      isPhysicsTrack ? "analysis-stage-button--physics-model" : "",
    ].filter(Boolean).join(" ");
    this.activeModelIndicator.dataset.active = String(isMathTrack || isPhysicsTrack);
    this.activeModelIndicator.textContent = isPhysicsTrack ? "Physics Model" : "Math Model";
  }

  setMathStageButtonsHidden(hidden) {
    this.mathStageButtons.forEach((button) => {
      button.hidden = hidden || !this.unlockedStages.has(button.dataset.analysisStageButton);
    });
  }

  updateFormulaeVisibility() {
    const hasMathFormulae = this.hasCompletedFinalStage();

    if (hasMathFormulae) {
      this.updateFormulaModelIfReady();
    }

    const mathFormulae = hasMathFormulae ? this.formulaTester.getFormulae() : "";
    const physicsFormulae = this.getPhysicsFormulae();
    const physicsConstants = this.getPhysicsConstants();
    const formulae = this.activeStageTrack === STAGE_TRACK_PHYSICS
      ? physicsFormulae
      : mathFormulae;
    const constants = this.activeStageTrack === STAGE_TRACK_PHYSICS
      ? physicsConstants
      : "";
    const visible = Boolean(formulae);
    const canTestFormulae = visible
      && this.isFormulaTestReady()
      && this.updateFormulaModelIfReady();

    if (this.formulaTestButton) {
      this.formulaTestButton.hidden = !visible;
    }

    this.updateModelUploadButton(visible);

    if (!canTestFormulae && this.isFormulaTesting) {
      this.isFormulaTesting = false;
      this.formulaTester.setEnabled(false);
      this.updateFormulaTestButton();
    }

    this.updateFormulaTestButton();

    if (!this.stageFormulae) {
      this.updateStageInfoVisibility();
      return;
    }

    this.stageFormulae.hidden = !formulae;
    this.stageFormulae.innerHTML = formulae;
    this.renderFormulaeMath();

    if (this.stageConstants) {
      this.stageConstants.hidden = !constants;
      this.stageConstants.innerHTML = constants;
    }

    this.updateStageInfoVisibility();
  }

  renderFormulaeMath() {
    if (!this.stageFormulae) {
      return;
    }

    this.stageFormulae
      .querySelectorAll("[data-analysis-formula-tex]")
      .forEach((element) => {
        katex.render(element.dataset.analysisFormulaTex ?? "", element, {
          displayMode: true,
          throwOnError: false,
        });
      });
  }

  updateStageInfoVisibility() {
    if (!this.stageInfo) {
      return;
    }

    const hasFormulaTest = Boolean(this.formulaTestButton && !this.formulaTestButton.hidden);

    this.stageInfo.hidden = !hasFormulaTest;
  }

  updateFormulaTestButton() {
    if (!this.formulaTestButton) {
      return;
    }

    const hasModel = Boolean(this.formulaTester.getModel());
    const canTestFormulae = hasModel && this.isFormulaTestReady();
    const sampleCount = this.formulaTester.samples.length;

    this.formulaTestButton.disabled = !canTestFormulae;
    this.formulaTestButton.dataset.active = String(this.isFormulaTesting);
    this.formulaTestButton.textContent = sampleCount
      ? `Test Formulae (${sampleCount})`
      : "Test Formulae";
    this.updateModelTrackControls();
  }

  setBadge(text) {
    if (this.badge) {
      this.badge.textContent = text;
    }
  }

  renderChart({ axisRanges, fitLines, plottableSamples, predictedSamples }) {
    if (!this.chartRoot) {
      return;
    }

    const plotLabels = getPlotLabels(plottableSamples);
    const predictionArrows = getPredictionArrowAnnotations(predictedSamples);
    const useSampleOrderColors = shouldColorBySampleOrder(plottableSamples);
    const traces = [
      {
        customdata: plottableSamples.map((sample) => [
          sample.wipers.top,
          sample.wipers.bot,
          sample.wipers.mid,
          sample.wipers.offset,
          sample.wipers.gain,
          formatHoverVoltage(sample.sensorPredicted.sensor2),
          formatHoverVoltage(sample.residuals.sensor2),
          formatSampleIndex(sample),
          formatHoverValue(sample.sensor2Previous),
          formatHoverValue(sample.sensor2Average),
          formatHoverValue(sample.samplesIgnored, 0),
          formatHoverValue(sample.samplesAveraged, 0),
          formatHoverValue(sample.sensor2RawDelta),
          formatHoverValue(sample.sensor2Step, 0),
        ]),
        hovertemplate: getHoverTemplate(plotLabels, plottableSamples),
        marker: {
          ...getMarkerColorSettings(plottableSamples, useSampleOrderColors),
          line: { color: "rgba(255, 255, 255, 0.72)", width: 0.8 },
          opacity: 0.86,
          size: 3,
        },
        mode: "markers",
        name: plotLabels.traceName,
        type: "scatter",
        x: plottableSamples.map((sample) => sample.plot.x),
        y: plottableSamples.map((sample) => sample.plot.y),
      },
      ...getTopFitLineTraces(fitLines),
    ];

    const renderPromise = Plotly.react(this.chartRoot, traces, getChartLayout(axisRanges, predictionArrows, plotLabels), {
      displaylogo: false,
      responsive: true,
    });

    this.observeChartRoot(this.chartRoot);

    return renderPromise;
  }

  renderCorrectionChart(correctionChartData) {
    if (!this.chartRoot) {
      return;
    }

    const renderPromise = Plotly.react(
      this.chartRoot,
      correctionChartData.traces ?? [],
      getStageChartLayout(correctionChartData),
      {
        displaylogo: false,
        responsive: true,
      },
    );

    this.observeChartRoot(this.chartRoot);

    return renderPromise;
  }

  renderStageChart(activeStageData) {
    if (!this.stageChartRoot) {
      return;
    }

    if (!activeStageData) {
      return Plotly.purge(this.stageChartRoot);
    }

    const renderPromise = Plotly.react(
      this.stageChartRoot,
      activeStageData.traces ?? [],
      getStageChartLayout(activeStageData),
      {
        displaylogo: false,
        responsive: true,
      },
    );

    this.observeChartRoot(this.stageChartRoot);

    return renderPromise;
  }

  observeChartRoot(root) {
    if (!root || this.observedChartRoots.has(root)) {
      return;
    }

    this.resizeObserver ??= new ResizeObserver((entries) => {
      entries.forEach((entry) => Plotly.Plots.resize(entry.target));
    });
    this.resizeObserver.observe(root);
    this.observedChartRoots.add(root);
  }
}

function getAxisRanges({ fitLines, plottableSamples, predictedSamples }) {
  if (!plottableSamples.length) {
    return {
      x: EMPTY_AXIS_RANGE,
      y: EMPTY_AXIS_RANGE,
    };
  }

  return {
    x: getPaddedRange(plottableSamples.map((sample) => sample.plot.x)),
    y: getPaddedRange([
      ...plottableSamples.map((sample) => sample.plot.y),
      ...predictedSamples.map((sample) => sample.sensorPredicted.sensor2),
      ...fitLines.flatMap((fitLine) => fitLine.lineY),
    ]),
  };
}

function getPaddedRange(values) {
  const knownValues = values.filter(Number.isFinite);
  const min = Math.min(...knownValues);
  const max = Math.max(...knownValues);
  const padding = Math.max((max - min) * 0.08, 0.025);

  return [min - padding, max + padding];
}

function shouldColorBySampleOrder(samples) {
  return samples.length > 0
    && samples.every((sample) => sample.source === "mid-sweep")
    && samples.some((sample) => Number.isFinite(sample.sampleIndex));
}

function getMarkerColorSettings(samples, useSampleOrderColors) {
  const gainColors = samples.map((sample) => sample.wipers.gain);
  const hasGainColors = gainColors.some(Number.isFinite);

  if (hasGainColors) {
    const gains = getSortedUniqueNumbers(gainColors);
    const gainIndexByValue = new Map(gains.map((gain, index) => [gain, index]));
    const colors = gains.map((_, index) => GAIN_MARKER_COLORS[index % GAIN_MARKER_COLORS.length]);

    return {
      cmax: gains.length - 0.5,
      cmin: -0.5,
      color: gainColors.map((value) => gainIndexByValue.get(value) ?? null),
      colorbar: {
        len: 0.64,
        outlinewidth: 0,
        thickness: 10,
        tickmode: "array",
        ticktext: gains.map(formatColorbarTick),
        tickvals: gains.map((_, index) => index),
        title: { side: "right", text: "gain" },
      },
      colorscale: getSteppedColorscale(colors),
      showscale: true,
    };
  }

  if (!useSampleOrderColors) {
    const colors = samples.map((sample) => sample.wipers.mid);
    const hasColorValues = colors.some(Number.isFinite);

    return {
      color: colors.map((value) => (Number.isFinite(value) ? value : 0)),
      ...(hasColorValues
        ? {
          colorbar: {
            len: 0.64,
            outlinewidth: 0,
            thickness: 10,
            title: { side: "right", text: "mid" },
          },
          showscale: true,
        }
        : {}),
      colorscale: RAINBOW_COLORSCALE,
    };
  }

  const sampleCounts = samples
    .map((sample) => sample.sampleCount)
    .filter(Number.isFinite);
  const maxSampleCount = Math.max(1, ...sampleCounts);

  return {
    cmax: maxSampleCount,
    cmin: 1,
    color: samples.map((sample) => sample.sampleIndex ?? 1),
    colorbar: {
      len: 0.64,
      outlinewidth: 0,
      thickness: 10,
      title: { side: "right", text: "sample" },
    },
    colorscale: RAINBOW_COLORSCALE,
    showscale: true,
  };
}

function getPredictionArrowAnnotations(samples) {
  return samples.map((sample) => ({
    arrowcolor: "rgba(255, 123, 114, 0.72)",
    arrowhead: 2,
    arrowsize: 1,
    arrowwidth: 1.2,
    ax: sample.plot.x,
    axref: "x",
    ay: sample.plot.y,
    ayref: "y",
    captureevents: false,
    opacity: 0.72,
    showarrow: true,
    standoff: 1,
    text: "",
    x: sample.plot.x,
    xref: "x",
    y: sample.sensorPredicted.sensor2,
    yref: "y",
  }));
}

function getTopFitLineTraces(fitLines) {
  const gainLineColors = getGainLineColors(fitLines);

  return fitLines.map((fitLine) => ({
    hoverinfo: "skip",
    line: {
      color: getTopFitLineColor(fitLine, gainLineColors),
      dash: "dot",
      width: 2,
    },
    mode: "lines",
    name: fitLine.name,
    type: "scatter",
    x: fitLine.lineX,
    y: fitLine.lineY,
  }));
}

function getGainLineColors(fitLines) {
  const gains = getSortedUniqueNumbers(fitLines.map((fitLine) => Number(fitLine.gain)));

  return new Map(gains.map((gain, index) => [
    gain,
    withAlpha(GAIN_MARKER_COLORS[index % GAIN_MARKER_COLORS.length], 0.10),
  ]));
}

function getTopFitLineColor(fitLine, gainLineColors) {
  const gain = Number(fitLine.gain);

  return Number.isFinite(gain)
    ? gainLineColors.get(gain) ?? fitLine.color
    : fitLine.color;
}

function withAlpha(color, alpha) {
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);

  if (!hex) {
    return color;
  }

  const [, red, green, blue] = hex;

  return `rgba(${parseInt(red, 16)}, ${parseInt(green, 16)}, ${parseInt(blue, 16)}, ${alpha})`;
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

function formatColorbarTick(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getPlotLabels(samples) {
  const plot = samples.find((sample) => sample.plot)?.plot;

  return {
    hoverX: plot?.hoverXLabel ?? "Sensor1",
    hoverY: plot?.hoverYLabel ?? "actual Sensor2",
    kind: plot?.kind ?? "sensor-comparison",
    traceName: plot?.hoverYLabel ?? "Sensor2 actual",
    xAxis: plot?.xLabel ?? "Sensor1 (V)",
    yAxis: plot?.yLabel ?? "Sensor2 (V)",
  };
}

function getHoverTemplate(plotLabels, samples) {
  const hasDeltaDetails = samples.some((sample) => (
    sample.source === "test2" || sample.source === "test3" || sample.source === "test4"
  ));
  const lines = plotLabels.kind === "test2-delta"
    || plotLabels.kind === "test3-delta"
    || plotLabels.kind === "test4-delta"
    ? [
      `${plotLabels.hoverX} %{x:.0f}`,
      `${plotLabels.hoverY} %{y:.6f} V/count`,
    ]
    : [
      `${plotLabels.hoverX} %{x:.4f} V`,
      `${plotLabels.hoverY} %{y:.4f} V`,
    ];

  if (hasDeltaDetails) {
    lines.push(
      "previous Sensor2 %{customdata[8]} V",
      "average Sensor2 %{customdata[9]} V",
      "ignored samples %{customdata[10]}",
      "averaged samples %{customdata[11]}",
      "raw delta %{customdata[12]} V",
      "step %{customdata[13]}",
    );
  } else {
    lines.push(
      "predicted Sensor2 %{customdata[5]}",
      "residual %{customdata[6]}",
    );
  }

  lines.push(
    "mid %{customdata[2]}",
    "offset %{customdata[3]}",
    "gain %{customdata[4]}",
    "sample %{customdata[7]}",
    "<extra></extra>",
  );

  return lines.join("<br>");
}

function getChartLayout(axisRanges, annotations = [], plotLabels = getPlotLabels([])) {
  return {
    annotations,
    autosize: true,
    margin: { b: 54, l: 64, r: 58, t: 26 },
    paper_bgcolor: "rgba(0, 0, 0, 0)",
    plot_bgcolor: "rgba(8, 20, 28, 0.72)",
    showlegend: false,
    xaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: axisRanges.x,
      title: { font: { color: "#d7dde8" }, text: plotLabels.xAxis },
      zeroline: false,
    },
    yaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: axisRanges.y,
      title: { font: { color: "#d7dde8" }, text: plotLabels.yAxis },
      zeroline: false,
    },
  };
}

function getStageChartLayout(stage) {
  const traces = stage?.traces ?? [];

  return {
    autosize: true,
    margin: { b: 54, l: 64, r: 58, t: 48 },
    paper_bgcolor: "rgba(0, 0, 0, 0)",
    plot_bgcolor: "rgba(8, 20, 28, 0.72)",
    legend: {
      bgcolor: "rgba(8, 20, 28, 0.72)",
      bordercolor: "rgba(255, 255, 255, 0.12)",
      borderwidth: 1,
      font: { color: "#d7dde8", size: 11 },
      itemclick: false,
      itemdoubleclick: false,
      x: 0.99,
      xanchor: "right",
      y: 0.99,
      yanchor: "top",
    },
    showlegend: stage?.showLegend === true,
    title: {
      font: { color: "#edf4ff", size: 14 },
      text: stage?.title ?? "",
      x: 0.02,
      xanchor: "left",
    },
    xaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: stage?.xRange ?? getPaddedRangeOrDefault(getTraceNumbers(traces, "x"), [0, 1]),
      title: { font: { color: "#d7dde8" }, text: stage?.xTitle ?? "" },
      zeroline: false,
    },
    yaxis: {
      color: "#b8c2d6",
      gridcolor: "rgba(184, 194, 214, 0.14)",
      range: stage?.yRange ?? getPaddedRangeOrDefault(getTraceNumbers(traces, "y"), [0, 1]),
      title: { font: { color: "#d7dde8" }, text: stage?.yTitle ?? "" },
      zeroline: false,
    },
  };
}

function getTraceNumbers(traces, key) {
  return traces.flatMap((trace) => Array.isArray(trace?.[key]) ? trace[key] : [])
    .filter(Number.isFinite);
}

function getPaddedRangeOrDefault(values, fallback) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return fallback;
  }

  return getPaddedRange(knownValues);
}

function getDerivedSensor1Estimate({
  gain,
  model,
  offset,
  sensor2,
}) {
  const multiplier = model?.multiplier?.intercept + model?.multiplier?.slope * gain;
  const centre = model?.centre?.intercept + model?.centre?.slope * offset;

  if (!Number.isFinite(multiplier)
    || Math.abs(multiplier) < 1e-9
    || !Number.isFinite(centre)
    || !Number.isFinite(sensor2)) {
    return null;
  }

  return centre + (centre - sensor2) / multiplier;
}

function getAbsoluteErrorComparisonRange(rows) {
  const maxErrorMv = Math.max(
    0,
    ...rows.map((row) => row.oldAbsErrorMv),
    ...rows.map((row) => row.derivedAbsErrorMv),
  );
  const extent = maxErrorMv > 0 ? maxErrorMv * 1.08 : 1;

  return [0, extent];
}

function getSlopeMultiplierRatio(dataset, fit, samples) {
  if (!Number.isFinite(fit.slope)) {
    return null;
  }

  if (samples.some((sample) => (
    sample.source === "test2" || sample.source === "test3" || sample.source === "test4"
  ))) {
    return null;
  }

  const multipliers = samples
    .map((sample) => dataset.sensorModel.gainRatioFromWiper(sample.wipers.gain))
    .filter(Number.isFinite);
  const multiplier = getMean(multipliers);

  return Number.isFinite(multiplier) && multiplier !== 0
    ? fit.slope / multiplier
    : null;
}

function getMean(values) {
  const knownValues = values.filter(Number.isFinite);

  if (!knownValues.length) {
    return null;
  }

  return knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length;
}

function formatRatio(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "-";
}

function formatHoverVoltage(value) {
  return Number.isFinite(value) ? `${value.toFixed(4)} V` : "---";
}

function formatSignedMillivolts(value) {
  if (!Number.isFinite(value)) {
    return "---";
  }

  return `${value >= 0 ? "+" : ""}${(value * 1000).toFixed(3)} mV`;
}

function formatSignedMillivoltValue(value) {
  if (!Number.isFinite(value)) {
    return "---";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(3)} mV`;
}

function formatHoverValue(value, fractionDigits = 6) {
  return Number.isFinite(value) ? value.toFixed(fractionDigits) : "---";
}

function formatSampleIndex(sample) {
  if (!Number.isFinite(sample?.sampleIndex)) {
    return "-";
  }

  return Number.isFinite(sample.sampleCount)
    ? `${sample.sampleIndex}/${sample.sampleCount}`
    : String(sample.sampleIndex);
}

function createModelUploadInput({
  label,
  multiline = false,
  name,
  readOnly = false,
  type = "text",
}) {
  const labelElement = document.createElement("label");
  const caption = document.createElement("span");
  const input = document.createElement(multiline ? "textarea" : "input");

  caption.textContent = label;
  input.name = name;
  if (!multiline) {
    input.type = type;
  }
  input.readOnly = readOnly;

  labelElement.append(caption, input);

  return {
    input,
    label: labelElement,
  };
}

function createButtonLine(text) {
  const line = document.createElement("span");

  line.textContent = text;
  return line;
}

function getModelUploadButtonText({
  canUpload,
  firebaseStore,
  state,
}) {
  if (state === MODEL_UPLOAD_STATE_UPLOADING) {
    return "Uploading...";
  }

  if (state === MODEL_UPLOAD_STATE_UPLOADED) {
    return "Uploaded";
  }

  if (canUpload) {
    return "Upload Ready";
  }

  return firebaseStore ? "Preparing upload..." : "Firebase unavailable";
}

const MODEL_UPLOAD_ALIGNED_OBJECT_PATHS = new Set([
  "payload.constants.calibrated",
  "payload.constants.circuit",
  "payload.schema.inputs",
  "payload.schema.outputs",
  "payload.schema.requiredConstants.calibrated",
  "payload.schema.requiredConstants.circuit",
]);

function formatModelUploadPacketPreview(packet) {
  return formatUploadJsonValue(packet, 0, []);
}

function formatUploadJsonValue(value, level, path) {
  if (Array.isArray(value)) {
    return formatUploadJsonArray(value, level, path);
  }

  if (isPlainObject(value)) {
    return shouldFormatAsAlignedUploadObject(path)
      ? formatAlignedUploadJsonObject(value, level, path)
      : formatUploadJsonObject(value, level, path);
  }

  return formatUploadJsonPrimitive(value);
}

function formatUploadJsonArray(values, level, path) {
  if (!values.length) {
    return "[]";
  }

  const childIndent = getJsonIndent(level + 1);
  const closingIndent = getJsonIndent(level);
  const lines = values.map((value, index) => {
    const suffix = index < values.length - 1 ? "," : "";

    return `${childIndent}${formatUploadJsonValue(value, level + 1, path.concat(String(index)))}${suffix}`;
  });

  return `[\n${lines.join("\n")}\n${closingIndent}]`;
}

function formatUploadJsonObject(value, level, path) {
  const entries = Object.entries(value);

  if (!entries.length) {
    return "{}";
  }

  const childIndent = getJsonIndent(level + 1);
  const closingIndent = getJsonIndent(level);
  const lines = entries.map(([key, childValue], index) => {
    const suffix = index < entries.length - 1 ? "," : "";
    const childPath = path.concat(key);

    return `${childIndent}${JSON.stringify(key)}: ${formatUploadJsonValue(childValue, level + 1, childPath)}${suffix}`;
  });

  return `{\n${lines.join("\n")}\n${closingIndent}}`;
}

function formatAlignedUploadJsonObject(value, level, path) {
  const entries = Object.entries(value);

  if (!entries.length) {
    return "{}";
  }

  const inlineObjectColumns = getInlineUploadObjectColumns(entries);
  const childIndent = getJsonIndent(level + 1);
  const closingIndent = getJsonIndent(level);
  const keyWidth = Math.max(...entries.map(([key]) => JSON.stringify(key).length));
  const lines = entries.map(([key, childValue], index) => {
    const suffix = index < entries.length - 1 ? "," : "";
    const keyText = JSON.stringify(key).padEnd(keyWidth, " ");
    const childPath = path.concat(key);

    return `${childIndent}${keyText}: ${formatUploadJsonInlineValue(childValue, level + 1, childPath, inlineObjectColumns)}${suffix}`;
  });

  return `{\n${lines.join("\n")}\n${closingIndent}}`;
}

function formatUploadJsonInlineValue(value, level, path, inlineObjectColumns = null) {
  if (isPlainObject(value) && Object.values(value).every((childValue) => !isObjectLike(childValue))) {
    return formatInlineUploadJsonObject(value, inlineObjectColumns);
  }

  return formatUploadJsonValue(value, level, path);
}

function formatInlineUploadJsonObject(value, columns = null) {
  const entries = Object.entries(value);

  if (!entries.length) {
    return "{}";
  }

  if (!columns) {
    return `{ ${entries
      .map(([key, childValue]) => `${JSON.stringify(key)}: ${formatUploadJsonPrimitive(childValue)}`)
      .join(", ")} }`;
  }

  const fields = columns.keys.map((key) => {
    const spec = columns.fields.get(key);
    const keyText = JSON.stringify(key).padEnd(columns.keyWidth, " ");
    const valueText = formatUploadJsonPrimitive(value[key] ?? null).padEnd(spec.valueWidth, " ");

    return `${keyText}: ${valueText}`;
  });

  return `{ ${fields.join(", ")} }`;
}

function formatUploadJsonPrimitive(value) {
  return JSON.stringify(value) ?? "null";
}

function getInlineUploadObjectColumns(entries) {
  if (!entries.length || !entries.every(([, value]) => isScalarObject(value))) {
    return null;
  }

  const keys = [];

  entries.forEach(([, value]) => {
    Object.keys(value).forEach((key) => {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    });
  });

  const keyWidth = Math.max(...keys.map((key) => JSON.stringify(key).length));
  const fields = new Map(keys.map((key) => [
    key,
    {
      valueWidth: Math.max(...entries.map(([, value]) => formatUploadJsonPrimitive(value[key] ?? null).length)),
    },
  ]));

  return {
    fields,
    keys,
    keyWidth,
  };
}

function isScalarObject(value) {
  return isPlainObject(value)
    && Object.values(value).every((childValue) => !isObjectLike(childValue));
}

function shouldFormatAsAlignedUploadObject(path) {
  return MODEL_UPLOAD_ALIGNED_OBJECT_PATHS.has(path.join("."));
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value);
}

function isObjectLike(value) {
  return Boolean(value) && typeof value === "object";
}

function getJsonIndent(level) {
  return "  ".repeat(level);
}

function getDefaultUploadName(filename, fallbackName) {
  const description = getFilenameDescription(filename);

  return description ?? normaliseText(fallbackName) ?? "model";
}

function formatModelType(modelType) {
  return getDisplayModelType(modelType) || "Unknown";
}

function getDisplayModelType(modelType) {
  const normalised = String(modelType ?? "").trim().toLowerCase();

  if (normalised === STAGE_TRACK_PHYSICS) {
    return "Physics";
  }

  if (normalised === STAGE_TRACK_MATH) {
    return "Math";
  }

  return "";
}

function getFilenameDescription(filename) {
  const stem = String(filename ?? "")
    .split(/[\\/]/u)
    .pop()
    ?.replace(/\.[^.]+$/u, "")
    .trim() ?? "";
  const separatorIndex = stem.indexOf("-");

  return separatorIndex >= 0
    ? normaliseText(stem.slice(separatorIndex + 1))
    : null;
}

function getUploadTimestamp({
  createdAt = null,
  date = null,
  time = null,
} = {}) {
  const parsedDate = parseDisplayDateTime(date, time);
  const fallbackDate = createdAt ? new Date(createdAt) : new Date();
  const knownDate = parsedDate
    ?? (Number.isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate);

  return {
    createdAt: knownDate.toISOString(),
    date: normaliseText(date) ?? formatDisplayDate(knownDate),
    time: normaliseText(time) ?? formatDisplayTime(knownDate),
  };
}

function parseDisplayDateTime(date, time) {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(String(date ?? "").trim());
  const timeMatch = /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/u.exec(String(time ?? "").trim());

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const [, dayText, monthText, yearText] = dateMatch;
  const [, hourText, minuteText, secondText] = timeMatch;
  const parsedDate = new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText),
  );

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDisplayDate(date) {
  return [
    pad2(date.getDate()),
    pad2(date.getMonth() + 1),
    date.getFullYear(),
  ].join("/");
}

function formatDisplayTime(date) {
  return [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join(":");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getPositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normaliseText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  return text || null;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    textarea.remove();
  }
}
