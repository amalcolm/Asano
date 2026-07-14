import { DIFF_AMP_COMPONENT } from "./components/diff-amp/DA_Adapter.js";
import { MID_STEP_COMPONENT } from "./components/mid-step/MS_Payload.js";

const KNOWN_MODELS_STORAGE_KEY = "caldera:knownModels:v1";
const MODEL_STORAGE_PREFIX = "caldera:model:v1:";
const KNOWN_MODELS_SCHEMA_VERSION = 1;
const COMPONENT_ALIASES = new Map([
  ["diffamp", DIFF_AMP_COMPONENT],
  ["differentialamp", DIFF_AMP_COMPONENT],
  ["differentialamplifier", DIFF_AMP_COMPONENT],
  ["midstep", MID_STEP_COMPONENT],
]);

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
    const normalisedComponent = normaliseComponent(component);
    const componentEntry = normalisedComponent
      ? knownModels.components[normalisedComponent]
      : null;

    if (!componentEntry) {
      return null;
    }

    const activeType = modelType || componentEntry.activeModelType;
    const summary = activeType ? componentEntry.models?.[activeType] : null;

    if (!summary) {
      return null;
    }

    const installedModel = this.readInstalledModel(summary.storageKey, summary)
      ?? this.readInstalledModel(getModelStorageKey(normalisedComponent, activeType), {
        ...summary,
        storageKey: getModelStorageKey(normalisedComponent, activeType),
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
    const normalisedComponent = normaliseComponent(component);
    const componentEntry = normalisedComponent
      ? this.knownModels.components[normalisedComponent]
      : null;

    if (!componentEntry) {
      return null;
    }

    const activeType = modelType || componentEntry.activeModelType;
    const summary = activeType ? componentEntry.models?.[activeType] : null;

    if (!summary) {
      return null;
    }

    const storageKey = summary.storageKey;
    const stableStorageKey = getModelStorageKey(normalisedComponent, activeType);
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
      diffAmp: this.getActiveModel(DIFF_AMP_COMPONENT),
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

  const knownModels = createEmptyKnownModels();
  const components = value.components && typeof value.components === "object"
    ? value.components
    : {};

  Object.entries(components).forEach(([componentName, componentEntry]) => {
    const component = normaliseComponent(componentName);

    if (!component || !componentEntry || typeof componentEntry !== "object") {
      return;
    }

    mergeComponentEntry(
      knownModels.components,
      component,
      normaliseComponentEntry(component, componentEntry),
    );
  });

  knownModels.updatedAt = normaliseText(value.updatedAt) || null;

  return knownModels;
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
  const text = normaliseText(value);

  if (!text) {
    return null;
  }

  return COMPONENT_ALIASES.get(getComponentLookupText(text)) ?? text;
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

function normaliseComponentEntry(component, value) {
  const models = {};
  const sourceModels = value.models && typeof value.models === "object"
    ? value.models
    : {};

  Object.entries(sourceModels).forEach(([modelTypeKey, summary]) => {
    const modelType = normaliseModelType(summary?.modelType) ?? normaliseModelType(modelTypeKey);

    if (!modelType) {
      return;
    }

    models[modelType] = normaliseModelSummary(summary, { component, modelType });
  });

  return {
    activeModelType: normaliseModelType(value.activeModelType) ?? Object.keys(models)[0] ?? null,
    models,
  };
}

function normaliseModelSummary(summary, { component, modelType }) {
  const source = summary && typeof summary === "object" ? summary : {};

  return {
    ...source,
    component,
    modelType,
    storageKey: normaliseText(source.storageKey) ?? getModelStorageKey(component, modelType),
  };
}

function mergeComponentEntry(components, component, componentEntry) {
  components[component] ??= {
    activeModelType: null,
    models: {},
  };

  const targetEntry = components[component];

  Object.entries(componentEntry.models).forEach(([modelType, summary]) => {
    targetEntry.models[modelType] = summary;
  });

  targetEntry.activeModelType = componentEntry.activeModelType
    ?? targetEntry.activeModelType
    ?? null;
}

function getComponentLookupText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}
