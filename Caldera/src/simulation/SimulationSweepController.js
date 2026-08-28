const WIPER_MIN = 0;
const WIPER_MAX = 255;
const DEFAULT_SWEEP_DURATION_MS = 1000;
const BOTH_SWEEP_LINE_DURATION_MS = 250;
const MID_SWEEP_STEP = 16;
const SWEEP_BOTH = "both";
const SWEEP_MID = "mid";
const SWEEP_TOP_BOT = "topBot";
const BOTH_SWEEP_MID_WIPERS = Object.freeze([
  ...Array.from(
    { length: Math.floor(WIPER_MAX / MID_SWEEP_STEP) + 1 },
    (_, index) => index * MID_SWEEP_STEP,
  ),
  WIPER_MAX,
]);

export class SimulationSweepController {
  constructor({
    bothButton,
    durationMs = DEFAULT_SWEEP_DURATION_MS,
    graph,
    midButton,
    scene,
    topBotButton,
  } = {}) {
    if (!bothButton || !graph || !midButton || !scene || !topBotButton) {
      throw new Error(
        "Mid, Top/Bot, and Both buttons, a graph, and a scene are required for Simulation sweeps.",
      );
    }

    this.durationMs = requirePositiveNumber(durationMs, "durationMs");
    this.graph = graph;
    this.scene = scene;
    this.buttons = [midButton, topBotButton, bothButton];
    this.buttonBySweep = {
      [SWEEP_BOTH]: bothButton,
      [SWEEP_MID]: midButton,
      [SWEEP_TOP_BOT]: topBotButton,
    };
    this.activeSweep = null;
    this.animationFrameId = null;
    this.lastPosition = WIPER_MIN;
    this.runId = 0;
    this.running = false;
    this.started = false;
    this.startedAt = null;
    this.sweep = null;

    this.handleBothClick = this.handleBothClick.bind(this);
    this.handleMidClick = this.handleMidClick.bind(this);
    this.handleTopBotClick = this.handleTopBotClick.bind(this);
    this.setButtonsDisabled(true);
  }

  start(ready = Promise.resolve()) {
    if (this.started) {
      return;
    }

    this.started = true;
    this.buttonBySweep[SWEEP_BOTH].addEventListener("click", this.handleBothClick);
    this.buttonBySweep[SWEEP_MID].addEventListener("click", this.handleMidClick);
    this.buttonBySweep[SWEEP_TOP_BOT].addEventListener(
      "click",
      this.handleTopBotClick,
    );
    this.setButtonsDisabled(true);

    Promise.resolve(ready)
      .then(() => {
        if (this.started && !this.running) {
          this.setButtonsDisabled(false);
        }
      })
      .catch((error) => {
        this.setButtonsDisabled(true);
        console.error("ThreePot voltage graph failed to start.", error);
      });
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.runId += 1;
    this.cancelAnimationFrame();
    this.running = false;
    this.startedAt = null;
    this.sweep = null;
    this.scene.setInteractionEnabled?.(true);
    this.setButtonsDisabled(true);
    this.clearBusyState();
    this.buttonBySweep[SWEEP_BOTH].removeEventListener(
      "click",
      this.handleBothClick,
    );
    this.buttonBySweep[SWEEP_MID].removeEventListener("click", this.handleMidClick);
    this.buttonBySweep[SWEEP_TOP_BOT].removeEventListener(
      "click",
      this.handleTopBotClick,
    );
  }

  handleBothClick() {
    this.handleSweepClick(SWEEP_BOTH);
  }

  handleMidClick() {
    this.handleSweepClick(SWEEP_MID);
  }

  handleTopBotClick() {
    this.handleSweepClick(SWEEP_TOP_BOT);
  }

  handleSweepClick(type) {
    const runId = this.runId + 1;

    this.run(type).catch((error) => this.handleError(error, runId, type));
  }

  async run(type) {
    if (!this.started || this.running) {
      return;
    }

    const runId = this.runId + 1;

    this.sweep = this.createSweep(type);
    this.runId = runId;
    this.running = true;
    this.activeSweep = type;
    this.startedAt = null;
    this.lastPosition = WIPER_MIN;
    this.scene.setInteractionEnabled?.(false);
    this.setButtonsDisabled(true);
    this.buttonBySweep[type].setAttribute("aria-busy", "true");

    await this.graph.prepareSweep(this.sweep.presentation);

    if (!this.isRunActive(runId)) {
      return;
    }

    await this.graph.appendSamples([this.sweep.sampleAt(WIPER_MIN)]);

    if (!this.isRunActive(runId)) {
      return;
    }

    if (this.sweep.maxPosition === WIPER_MIN) {
      this.finish(runId);
      return;
    }

    this.requestNextFrame(runId);
  }

  async advance(timestamp, runId) {
    if (!this.isRunActive(runId)) {
      return;
    }

    this.startedAt ??= timestamp;

    const durationMs = this.sweep.durationMs ?? this.durationMs;
    const progress = Math.min((timestamp - this.startedAt) / durationMs, 1);
    const targetPosition = Math.floor(this.sweep.maxPosition * progress);
    const samples = [];

    for (
      let position = this.lastPosition + 1;
      position <= targetPosition;
      position += 1
    ) {
      samples.push(this.sweep.sampleAt(position, { render: false }));
    }

    if (samples.length > 0) {
      this.lastPosition = targetPosition;
      this.scene.render();
      await this.graph.appendSamples(samples);
    }

    if (!this.isRunActive(runId)) {
      return;
    }

    if (this.lastPosition >= this.sweep.maxPosition) {
      this.finish(runId);
    } else {
      this.requestNextFrame(runId);
    }
  }

  createSweep(type) {
    if (type === SWEEP_MID) {
      return {
        maxPosition: WIPER_MAX,
        presentation: {
          ariaLabel: "ThreePot middle-wiper voltage over positions zero to 255",
          title: "ThreePot mid sweep",
          xAxisTitle: "Mid wiper position",
        },
        sampleAt: (position, options) => ({
          label: `Mid ${position}`,
          voltage: this.scene.setMidWiper(position, options),
          wiper: position,
        }),
      };
    }

    if (type === SWEEP_TOP_BOT) {
      const range = getOuterSweepRange(this.scene);

      return {
        maxPosition: range.maxPosition,
        presentation: {
          ariaLabel: "ThreePot output voltage while sweeping the outer wipers",
          title: "ThreePot Top/Bot sweep",
          xAxisTitle: "Top/Bot sweep position",
        },
        sampleAt: (position, options) => {
          const { bot, top } = range.getWipers(position);

          return {
            label: `Top ${top} / Bot ${bot}`,
            voltage: this.scene.setOuterWipers({ bot, top }, options),
            wiper: position,
          };
        },
      };
    }

    if (type === SWEEP_BOTH) {
      return this.createBothSweep();
    }

    throw new RangeError(`Unknown Simulation sweep type: ${type}`);
  }

  createBothSweep() {
    const range = getOuterSweepRange(this.scene);
    const outerPositionCount = range.maxPosition + 1;
    const series = BOTH_SWEEP_MID_WIPERS.map((mid, index) => ({
      color: getSeriesColor(index, BOTH_SWEEP_MID_WIPERS.length),
      id: `mid-${mid}`,
      mode: range.maxPosition === 0 ? "markers" : "lines",
      name: `Mid ${mid}`,
    }));

    return {
      durationMs: Math.max(
        this.durationMs,
        BOTH_SWEEP_MID_WIPERS.length * BOTH_SWEEP_LINE_DURATION_MS,
      ),
      maxPosition: outerPositionCount * BOTH_SWEEP_MID_WIPERS.length - 1,
      presentation: {
        ariaLabel: "ThreePot output voltage for multiple middle-wiper settings",
        series,
        title: "ThreePot combined sweep",
        xAxisTitle: "Top/Bot sweep position",
      },
      sampleAt: (position, options) => {
        const seriesIndex = Math.floor(position / outerPositionCount);
        const outerPosition = position % outerPositionCount;
        const mid = BOTH_SWEEP_MID_WIPERS[seriesIndex];
        const { bot, top } = range.getWipers(outerPosition);

        return {
          label: `Mid ${mid} / Top ${top} / Bot ${bot}`,
          seriesId: `mid-${mid}`,
          voltage: this.scene.setWipers({ bot, mid, top }, options),
          wiper: outerPosition,
        };
      },
    };
  }

  requestNextFrame(runId) {
    this.animationFrameId = requestAnimationFrame((timestamp) => {
      this.animationFrameId = null;
      this.advance(timestamp, runId)
        .catch((error) => this.handleError(error, runId, this.activeSweep));
    });
  }

  finish(runId) {
    if (runId !== this.runId) {
      return;
    }

    this.cancelAnimationFrame();
    this.running = false;
    this.startedAt = null;
    this.sweep = null;
    this.scene.setInteractionEnabled?.(true);
    this.setButtonsDisabled(!this.started);
    this.clearBusyState();
    this.activeSweep = null;
  }

  handleError(error, runId, type) {
    if (runId === this.runId) {
      this.finish(runId);
    }

    const label = {
      [SWEEP_BOTH]: "combined",
      [SWEEP_MID]: "mid",
      [SWEEP_TOP_BOT]: "Top/Bot",
    }[type] ?? "Simulation";

    console.error(`ThreePot ${label} sweep failed.`, error);
  }

  isRunActive(runId) {
    return this.started && this.running && runId === this.runId;
  }

  setButtonsDisabled(disabled) {
    this.buttons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  clearBusyState() {
    this.buttons.forEach((button) => button.removeAttribute("aria-busy"));
  }

  cancelAnimationFrame() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

function requirePositiveNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} must be greater than zero.`);
  }

  return number;
}

function requireWiper(value, name) {
  const wiper = Number(value);

  if (!Number.isInteger(wiper) || wiper < WIPER_MIN || wiper > WIPER_MAX) {
    throw new RangeError(`${name} must be an integer from 0 to 255.`);
  }

  return wiper;
}

function getOuterSweepRange(scene) {
  const currentWipers = scene.getWiperValues();
  const topWiper = requireWiper(currentWipers.top, "top wiper");
  const botWiper = requireWiper(currentWipers.bot, "bottom wiper");
  const separation = topWiper - botWiper;
  const botStart = Math.max(WIPER_MIN, WIPER_MIN - separation);
  const botEnd = Math.min(WIPER_MAX, WIPER_MAX - separation);

  return {
    getWipers(position) {
      const bot = botStart + position;

      return { bot, top: bot + separation };
    },
    maxPosition: botEnd - botStart,
  };
}

function getSeriesColor(index, count) {
  const hue = Math.round((210 + index * 330 / count) % 360);

  return `hsl(${hue}, 82%, 65%)`;
}
