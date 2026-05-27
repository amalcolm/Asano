const DEFAULT_STORAGE_KEY = "caldera:debug-settings:v1";

export class DebugSettingsControl {
  constructor({
    applySettings,
    getSettings,
    loadButton,
    saveButton,
    status,
    storageKey = DEFAULT_STORAGE_KEY,
  }) {
    this.applySettings = applySettings;
    this.getSettings = getSettings;
    this.loadButton = loadButton;
    this.saveButton = saveButton;
    this.status = status;
    this.storageKey = storageKey;

    this.saveButton?.addEventListener("click", () => this.save());
    this.loadButton?.addEventListener("click", () => this.load());

    this.updateStatus(this.hasSavedSettings() ? "stored" : "empty");
  }

  save() {
    const settings = this.getSettings?.();

    if (!settings || typeof settings !== "object") {
      this.updateStatus("save failed");
      return false;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        ...settings,
        savedAt: new Date().toISOString(),
        version: 1,
      }));
      this.updateStatus("saved");
      return true;
    } catch {
      this.updateStatus("save failed");
      return false;
    }
  }

  load() {
    const settings = this.read();

    if (!settings) {
      this.updateStatus("empty");
      return false;
    }

    if (this.applySettings?.(settings) === false) {
      this.updateStatus("load failed");
      return false;
    }

    this.updateStatus("loaded");
    return true;
  }

  read() {
    try {
      const settings = JSON.parse(localStorage.getItem(this.storageKey));

      return settings && typeof settings === "object" ? settings : null;
    } catch {
      return null;
    }
  }

  hasSavedSettings() {
    return Boolean(this.read());
  }

  updateStatus(text) {
    if (this.status) {
      this.status.textContent = text;
    }
  }
}
