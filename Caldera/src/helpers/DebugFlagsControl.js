import {
  COMMAND_FLAGS,
  formatCommandFlags,
  hasCommandFlag,
  normaliseCommandFlags,
  setCommandFlag,
} from "./CommandFlags.js";

const COMMAND_FLAG_BY_ID = Object.freeze({
  holdWipers: COMMAND_FLAGS.HOLD_WIPERS,
  holdSensor2: COMMAND_FLAGS.HOLD_SENSOR2,
  runDebug: COMMAND_FLAGS.RUN_DEBUG,
});

const DEBUG_TEST_COMMAND_FLAG_BY_ID = Object.freeze({
  findSignal: COMMAND_FLAGS.RUN_FIND_SIGNAL,
  getNoiseSample: COMMAND_FLAGS.RUN_GET_NOISE_SAMPLE,
});

export class DebugFlagsControl {
  constructor({
    inputs,
    initialCommandFlags = webView?.getCommandFlags?.() ?? COMMAND_FLAGS.NONE,
    onChange = null,
    status,
    testButtons,
    testStatus = null,
    webView,
  }) {
    this.inputs = Array.from(inputs ?? []);
    this.commandFlags = normaliseCommandFlags(initialCommandFlags);
    this.onChange = onChange;
    this.status = status;
    this.testButtons = Array.from(testButtons ?? []);
    this.testStatus = testStatus;
    this.webView = webView;

    this.inputs.forEach((input) => {
      input.addEventListener("change", () => this.handleInputChange(input));
    });

    this.testButtons.forEach((button) => {
      button.addEventListener("click", () => this.runDebugTest(button.dataset.debugTest));
    });

    this.webView?.setCommandFlags?.(this.commandFlags);
    this.syncInputs();
    this.updateStatus();
    this.updateTestStatus("ready");
  }

  getCommandFlags() {
    return this.commandFlags;
  }

  getSettings() {
    return {
      flags: this.commandFlags,
    };
  }

  hasFlag(flag) {
    return hasCommandFlag(this.commandFlags, flag);
  }

  setFlag(flag, enabled, { post = false } = {}) {
    this.setCommandFlags(
      setCommandFlag(this.commandFlags, flag, enabled),
      { post },
    );
  }

  setCommandFlags(commandFlags, { post = false } = {}) {
    const nextCommandFlags = normaliseCommandFlags(commandFlags);

    if (nextCommandFlags === this.commandFlags) {
      this.syncInputs();
      this.updateStatus();
      return;
    }

    this.commandFlags = nextCommandFlags;
    this.webView?.setCommandFlags?.(this.commandFlags);
    this.syncInputs();
    this.updateStatus();
    this.onChange?.(this.getSettings());

    if (post) {
      this.webView?.postSetDebugFlags();
    }
  }

  handleInputChange(input) {
    const commandFlag = COMMAND_FLAG_BY_ID[input.dataset.debugFlag] ?? COMMAND_FLAGS.NONE;

    if (commandFlag === COMMAND_FLAGS.NONE) {
      return;
    }

    if (commandFlag === COMMAND_FLAGS.HOLD_SENSOR2) {
      const commandFlags = setCommandFlag(this.commandFlags, commandFlag, input.checked);
      this.setCommandFlags(
        input.checked
          ? setCommandFlag(commandFlags, COMMAND_FLAGS.HOLD_WIPERS, true)
          : commandFlags,
        { post: true },
      );
      return;
    }

    this.setFlag(commandFlag, input.checked, { post: true });
  }

  syncInputs() {
    this.inputs.forEach((input) => {
      const commandFlag = COMMAND_FLAG_BY_ID[input.dataset.debugFlag] ?? COMMAND_FLAGS.NONE;

      input.checked = hasCommandFlag(this.commandFlags, commandFlag);
    });
  }

  updateStatus() {
    if (this.status) {
      this.status.textContent = formatCommandFlags(this.commandFlags);
    }
  }

  runDebugTest(id) {
    const commandFlags = DEBUG_TEST_COMMAND_FLAG_BY_ID[id] ?? COMMAND_FLAGS.NONE;

    if (commandFlags === COMMAND_FLAGS.NONE) {
      return;
    }

    const postedCommandFlags = (this.commandFlags | commandFlags) >>> 0;
    const posted = this.webView.postSetDebugFlags({
      cmdFlags: postedCommandFlags,
    });

    this.updateTestStatus(posted ? `sent ${formatCommandFlags(postedCommandFlags)}` : "offline");
  }

  updateTestStatus(text) {
    if (this.testStatus) {
      this.testStatus.textContent = text;
    }
  }
}
