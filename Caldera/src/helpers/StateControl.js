import { COMMAND_FLAGS } from "./CommandFlags.js";

export const STATE_LED_ROWS = Object.freeze([
  makeStateLedRow("red", "RED", 16),
  makeStateLedRow("ir", "IR", 0),
]);

const STATE_BITS = Object.freeze(
  Object.fromEntries(
    STATE_LED_ROWS.flatMap((row) => row.map(({ bit, id }) => [id, bit])),
  ),
);

const ACTIVE_CLASS = "state-panel__button--active";
const RED_ACTIVE_CLASS = "state-panel__button--red-active";
const IR_ACTIVE_CLASS = "state-panel__button--ir-active";

export class StateControl {
  constructor({
    buttons,
    commandFlags,
    holdWipersOnLedChangeInput = null,
    initialHoldWipersOnLedChange = true,
    initialRunFindSignalOnStateChange = false,
    onSettingsChange = null,
    runFindSignalInput = null,
    webView,
  }) {
    this.buttons = Array.from(buttons ?? []);
    this.commandFlags = commandFlags;
    this.holdWipersOnLedChangeInput = holdWipersOnLedChangeInput;
    this.holdWipersOnLedChange = initialHoldWipersOnLedChange !== false;
    this.runFindSignalInput = runFindSignalInput;
    this.runFindSignalOnStateChange = initialRunFindSignalOnStateChange === true;
    if (this.runFindSignalOnStateChange) {
      this.holdWipersOnLedChange = false;
    }
    this.onSettingsChange = onSettingsChange;
    this.webView = webView;
    this.activeById = new Map(this.buttons.map((button) => [button.dataset.stateToggle, false]));
    this.lastHostState = null;
    this.pendingState = null;

    this.buttons.forEach((button) => {
      button.addEventListener("click", (event) => (
        this.handleManualToggle(button.dataset.stateToggle, event)
      ));
    });

    this.holdWipersOnLedChangeInput?.addEventListener("change", () => {
      this.setHoldWipersOnLedChange(this.holdWipersOnLedChangeInput.checked);
    });

    this.runFindSignalInput?.addEventListener("change", () => {
      this.setRunFindSignalOnStateChangeValue(this.runFindSignalInput.checked);
    });

    this.updateButtons();
    this.updateHoldWipersOnLedChangeInput();
    this.updateRunFindSignalInput();
  }

  handleManualToggle(id, event = null) {
    event?.preventDefault();
    event?.currentTarget?.blur?.();
    this.sendHoldState(this.getToggledState(id), {
      holdWipers: this.holdWipersOnLedChange,
    });
  }

  applyHostState(state) {
    const hostState = normaliseState(state);

    if (hostState === null) {
      return false;
    }

    if (hostState === this.pendingState) {
      this.pendingState = null;
    }

    const changed = hostState !== this.lastHostState;

    this.lastHostState = hostState;
    this.setState(hostState);

    return changed;
  }

  setState(state) {
    this.activeById.forEach((_, id) => {
      this.activeById.set(id, Boolean(state & (STATE_BITS[id] ?? 0)));
    });

    this.updateButtons();
  }

  setActiveIds(activeIds, { send = true } = {}) {
    const state = getStateForActiveIds(activeIds);

    if (!send) {
      this.setState(state);
      return state;
    }

    return this.sendHoldState(state);
  }

  sendHoldState(state = this.getState(), { holdWipers = true } = {}) {
    const holdState = normaliseState(state) ?? 0;
    const shouldRunFindSignal = this.runFindSignalOnStateChange;
    const shouldHoldWipers = !shouldRunFindSignal && holdWipers === true;

    if (shouldRunFindSignal) {
      this.commandFlags?.setFlag(COMMAND_FLAGS.HOLD_WIPERS, false, { post: false });
    }

    if (shouldHoldWipers) {
      this.commandFlags?.setFlag(COMMAND_FLAGS.HOLD_WIPERS, true, { post: false });
    }

    const flags = (
      (this.commandFlags?.getCommandFlags?.() ?? COMMAND_FLAGS.NONE)
      | (shouldRunFindSignal ? COMMAND_FLAGS.RUN_FIND_SIGNAL : COMMAND_FLAGS.NONE)
    );

    const posted = this.webView.postSetState({
      cmdFlags: flags,
      state: holdState,
    });

    this.pendingState = posted ? holdState : null;

    if (!posted) {
      this.lastHostState = holdState;
      this.setState(holdState);
    }

    return holdState;
  }

  getState() {
    return Array.from(this.activeById)
      .reduce((state, [id, active]) => (
        active ? state | (STATE_BITS[id] ?? 0) : state
      ), 0) >>> 0;
  }

  getLastHostState() {
    return this.lastHostState;
  }

  setHoldWipersOnLedChange(isEnabled) {
    const enabled = isEnabled === true;

    if (enabled) {
      this.runFindSignalOnStateChange = false;
    }

    this.holdWipersOnLedChange = enabled;
    this.updateHoldWipersOnLedChangeInput();
    this.updateRunFindSignalInput();
    this.onSettingsChange?.();
  }

  setRunFindSignalOnStateChangeValue(isEnabled) {
    const enabled = isEnabled === true;

    if (enabled) {
      this.holdWipersOnLedChange = false;
      this.commandFlags?.setFlag(COMMAND_FLAGS.HOLD_WIPERS, false, { post: false });
    }

    this.runFindSignalOnStateChange = enabled;
    this.updateHoldWipersOnLedChangeInput();
    this.updateRunFindSignalInput();
    this.onSettingsChange?.();
  }

  getSettings() {
    return {
      holdWipersOnLedChange: this.holdWipersOnLedChange,
      runFindSignalOnStateChange: this.runFindSignalOnStateChange,
    };
  }

  getToggledState(id) {
    const bit = STATE_BITS[normaliseStateId(id)] ?? 0;
    const baseState = this.pendingState
      ?? this.lastHostState
      ?? this.getState();

    return (baseState ^ bit) >>> 0;
  }

  updateButtons() {
    this.buttons.forEach((button) => {
      const isActive = this.activeById.get(button.dataset.stateToggle) === true;

      button.dataset.active = String(isActive);
      button.setAttribute("aria-pressed", String(isActive));
      button.classList.toggle(ACTIVE_CLASS, isActive);
      button.classList.toggle(
        RED_ACTIVE_CLASS,
        isActive && button.dataset.stateKind === "red",
      );
      button.classList.toggle(
        IR_ACTIVE_CLASS,
        isActive && button.dataset.stateKind === "ir",
      );
    });
  }

  updateHoldWipersOnLedChangeInput() {
    if (!this.holdWipersOnLedChangeInput) {
      return;
    }

    this.holdWipersOnLedChangeInput.checked = this.holdWipersOnLedChange;
  }

  updateRunFindSignalInput() {
    if (!this.runFindSignalInput) {
      return;
    }

    this.runFindSignalInput.checked = this.runFindSignalOnStateChange;
  }
}

function makeStateLedRow(kind, labelPrefix, bitOffset) {
  return Object.freeze(
    Array.from({ length: 8 }, (_, index) => {
      const channel = index + 1;

      return Object.freeze({
        bit: 1 << (bitOffset + index),
        id: `${kind}${channel}`,
        kind,
        label: `${labelPrefix}${channel}`,
      });
    }),
  );
}

function normaliseState(value) {
  const state = Number(value);

  return Number.isFinite(state) && state >= 0
    ? Math.trunc(state) >>> 0
    : null;
}

function normaliseStateId(id) {
  return String(id ?? "").trim().toLowerCase();
}

function getStateForActiveIds(activeIds) {
  const activeSet = new Set(
    Array.from(activeIds ?? [], normaliseStateId),
  );

  return Object.entries(STATE_BITS)
    .reduce((state, [id, bit]) => (
      activeSet.has(normaliseStateId(id)) ? state | bit : state
    ), 0) >>> 0;
}
