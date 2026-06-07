const KNOWN_MODELS_STORAGE_KEY = "caldera:knownModels:v1";
const MODEL_STORAGE_PREFIX = "caldera:model:v1:";
const KNOWN_MODELS_SCHEMA_VERSION = 1;

export class ModelStorage {
  constructor({
    storage = getDefaultStorage(),
  } = {}) {
    this.storage = storage;
  }

  installModelPacket(packet, {
    modelRunId = null,
    ownerUid = null,
  } = {}) {
    if (!this.storage) {
      throw new Error("localStorage unavailable");
    }

    const summary = createModelSummary(packet, { modelRunId, ownerUid });
    const storageKey = summary.storageKey;
    const installedModel = {
      schemaVersion: KNOWN_MODELS_SCHEMA_VERSION,
      installedAt: summary.installedAt,
      modelRunId: summary.modelRunId,
      ownerUid: summary.ownerUid,
      packet,
    };
    const knownModels = this.readKnownModels();

    knownModels.components[summary.component] ??= {
      activeModelType: null,
      models: {},
    };
    const componentEntry = knownModels.components[summary.component];
    const previousSummary = componentEntry.models?.[summary.modelType];

    if (previousSummary?.storageKey && previousSummary.storageKey !== storageKey) {
      this.storage.removeItem(previousSummary.storageKey);
    }

    componentEntry.activeModelType = summary.modelType;
    componentEntry.models[summary.modelType] = summary;
    knownModels.updatedAt = summary.installedAt;

    this.storage.setItem(storageKey, JSON.stringify(installedModel));
    this.writeKnownModels(knownModels);

    return {
      model: installedModel,
      summary,
    };
  }

  getActiveModel(component, modelType = null) {
    const knownModels = this.readKnownModels();
    const componentEntry = knownModels.components[component];

    if (!componentEntry) {
      return null;
    }

    const activeType = modelType || componentEntry.activeModelType;
    const summary = activeType ? componentEntry.models?.[activeType] : null;

    if (!summary) {
      return null;
    }

    const installedModel = this.readInstalledModel(summary.storageKey, summary)
      ?? this.readInstalledModel(getModelStorageKey(component, activeType), {
        ...summary,
        storageKey: getModelStorageKey(component, activeType),
      });

    if (installedModel && installedModel.storageKey !== summary.storageKey) {
      componentEntry.models[activeType] = {
        ...summary,
        storageKey: installedModel.storageKey,
      };
      this.writeKnownModels(knownModels);
    }

    return installedModel;
  }

  getKnownModels() {
    return this.readKnownModels();
  }

  clearInstalledModels() {
    if (!this.storage) {
      return;
    }

    const knownModels = this.readKnownModels();

    Object.values(knownModels.components).forEach((componentEntry) => {
      Object.values(componentEntry.models ?? {}).forEach((summary) => {
        if (summary?.storageKey) {
          this.storage.removeItem(summary.storageKey);
        }
      });
    });

    this.storage.removeItem(KNOWN_MODELS_STORAGE_KEY);
  }

  readInstalledModel(storageKey, summary = null) {
    if (!this.storage || !storageKey) {
      return null;
    }

    try {
      const parsed = JSON.parse(this.storage.getItem(storageKey));

      if (!parsed?.packet) {
        return null;
      }

      return {
        ...parsed,
        summary: summary ?? parsed.summary ?? null,
        storageKey,
      };
    } catch {
      return null;
    }
  }

  readKnownModels() {
    if (!this.storage) {
      return createEmptyKnownModels();
    }

    try {
      return normaliseKnownModels(JSON.parse(this.storage.getItem(KNOWN_MODELS_STORAGE_KEY)));
    } catch {
      return createEmptyKnownModels();
    }
  }

  writeKnownModels(knownModels) {
    if (!this.storage) {
      return;
    }

    this.storage.setItem(
      KNOWN_MODELS_STORAGE_KEY,
      JSON.stringify(normaliseKnownModels(knownModels)),
    );
  }
}

export class ModelStore {
  constructor({
    storage = new ModelStorage(),
  } = {}) {
    this.storage = storage;
    this.reload();
  }

  reload() {
    this.knownModels = this.storage.getKnownModels();
    this.modelCache = new Map();
    return this;
  }

  getActiveModel(component, modelType = null) {
    const componentEntry = this.knownModels.components[component];

    if (!componentEntry) {
      return null;
    }

    const activeType = modelType || componentEntry.activeModelType;
    const summary = activeType ? componentEntry.models?.[activeType] : null;

    if (!summary) {
      return null;
    }

    const storageKey = summary.storageKey;
    const stableStorageKey = getModelStorageKey(component, activeType);
    const cacheKey = storageKey || stableStorageKey;

    if (cacheKey && !this.modelCache.has(cacheKey)) {
      this.modelCache.set(
        cacheKey,
        this.storage.readInstalledModel(storageKey, summary)
          ?? this.storage.readInstalledModel(stableStorageKey, {
            ...summary,
            storageKey: stableStorageKey,
          }),
      );
    }

    return cacheKey ? this.modelCache.get(cacheKey) : null;
  }

  getComponentModels() {
    return {
      diffAmp: this.getActiveModel("Diff.Amp."),
    };
  }
}

function createModelSummary(packet, {
  modelRunId = null,
  ownerUid = null,
} = {}) {
  const component = normaliseComponent(packet?.dataset?.component)
    || normaliseComponent(packet?.details?.component);
  const modelType = normaliseModelType(packet?.details?.modelType)
    || normaliseModelType(packet?.details?.model);

  if (!component) {
    throw new Error("model packet is missing dataset.component");
  }

  if (!modelType) {
    throw new Error("model packet is missing details.modelType");
  }

  const createdAt = normaliseText(packet?.createdAt) || new Date().toISOString();
  const installedAt = new Date().toISOString();
  const resolvedModelRunId = normaliseText(modelRunId) || normaliseText(packet?.modelRunId) || null;
  const storageKey = getModelStorageKey(component, modelType);

  return {
    component,
    createdAt,
    datasetSourceFilename: normaliseText(packet?.dataset?.sourceFilename) || "",
    installedAt,
    modelRunId: resolvedModelRunId,
    modelType,
    name: normaliseText(packet?.details?.name) || "",
    ownerUid: normaliseText(ownerUid) || normaliseText(packet?.ownerUid) || null,
    revision: Number.isFinite(Number(packet?.details?.revision))
      ? Number(packet.details.revision)
      : null,
    schemaVersion: Number.isFinite(Number(packet?.schemaVersion))
      ? Number(packet.schemaVersion)
      : null,
    storageKey,
  };
}

function normaliseKnownModels(value) {
  if (!value || typeof value !== "object") {
    return createEmptyKnownModels();
  }

  return {
    components: value.components && typeof value.components === "object"
      ? value.components
      : {},
    schemaVersion: KNOWN_MODELS_SCHEMA_VERSION,
    updatedAt: normaliseText(value.updatedAt) || null,
  };
}

function createEmptyKnownModels() {
  return {
    components: {},
    schemaVersion: KNOWN_MODELS_SCHEMA_VERSION,
    updatedAt: null,
  };
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function getModelStorageKey(component, modelType) {
  const normalisedComponent = normaliseComponent(component);
  const normalisedModelType = normaliseModelType(modelType);

  return normalisedComponent && normalisedModelType
    ? `${MODEL_STORAGE_PREFIX}${makeStorageId(`${normalisedComponent}:${normalisedModelType}`)}`
    : null;
}

function makeStorageId(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || `model-${Date.now()}`;
}

function normaliseComponent(value) {
  return normaliseText(value);
}

function normaliseModelType(value) {
  const text = normaliseText(value)?.toLowerCase();

  if (text === "math" || text === "physics") {
    return text;
  }

  return text || null;
}

function normaliseText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
