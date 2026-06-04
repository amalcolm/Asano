export const MODEL_TRACKS = Object.freeze({
  MATH: "math",
  PHYSICS: "physics",
});

const TEST_DEFINITIONS = Object.freeze([
  {
    category: "Single",
    id: "mid",
    name: "Sweep mid",
    source: "mid-sweep",
  },
  {
    category: "Stacked",
    id: "offset",
    name: "Sweep offset",
    source: "offset-sweep",
  },
  {
    category: "Stacked",
    id: "gain",
    name: "Sweep gain",
    source: "gain-mid-sweep",
  },
  {
    category: "Custom",
    id: "test2",
    name: "Test2",
    source: "test2",
  },
  {
    category: "Custom",
    id: "test3",
    name: "Test3",
    source: "test3",
  },
  {
    category: "Calibration",
    id: "test1",
    legacyNames: ["test1", "test1 calib"],
    modelTracks: [MODEL_TRACKS.MATH, MODEL_TRACKS.PHYSICS],
    name: "Diff.Amp.",
    source: "test1",
  },
  {
    category: "Calibration",
    id: "test4",
    legacyNames: ["test4"],
    name: "Mid Step",
    source: "test4",
  },
]);

// Dataset naming convention:
// - Test-panel headers provide the Category.
// - Button labels provide the Name.
// - Saved files use "[Category]; [Name] - descriptive notes.csv".
// - Only Category and Name are used to choose model tracks.
export class ModelMapping {
  constructor({
    definitions = TEST_DEFINITIONS,
  } = {}) {
    this.definitions = definitions.map((definition) => ({
      legacyNames: [],
      modelTracks: [],
      ...definition,
    }));
    this.definitionsById = new Map();
    this.definitionsBySource = new Map();
    this.definitionsByCategoryName = new Map();
    this.definitionsByLegacyName = new Map();

    this.definitions.forEach((definition) => {
      this.definitionsById.set(getLookupKey(definition.id), definition);
      this.definitionsBySource.set(getLookupKey(definition.source), definition);
      this.definitionsByCategoryName.set(
        getCategoryNameKey(definition.category, definition.name),
        definition,
      );

      definition.legacyNames.forEach((legacyName) => {
        this.definitionsByLegacyName.set(getLookupKey(legacyName), definition);
      });
    });
  }

  getTest(testId) {
    return this.definitionsById.get(getLookupKey(testId)) ?? null;
  }

  getTestForSource(source) {
    return this.definitionsBySource.get(getLookupKey(source)) ?? null;
  }

  getCsvLabelForTest(testId) {
    const definition = this.getTest(testId);

    return definition ? this.formatCsvLabel(definition) : null;
  }

  findDefinitionByCategoryName(category, name) {
    const exactDefinition = this.definitionsByCategoryName.get(getCategoryNameKey(category, name));

    if (exactDefinition) {
      return exactDefinition;
    }

    const categoryKey = getLookupKey(category);
    const nameKey = getLookupKey(name);

    if (!categoryKey || !nameKey) {
      return null;
    }

    return this.definitions.find((definition) => (
      getLookupKey(definition.category) === categoryKey
        && isCompatibleNameKey(definition, nameKey)
    )) ?? null;
  }

  formatCsvLabel({
    category,
    name,
  } = {}) {
    const normalisedCategory = normaliseLabelPart(category);
    const normalisedName = normaliseLabelPart(name);

    if (normalisedCategory && normalisedName) {
      return `${normalisedCategory}; ${normalisedName}`;
    }

    return normalisedName ?? normalisedCategory ?? null;
  }

  parseCsvLabel(label) {
    const stem = getFilenameStem(label);
    const [category, ...nameParts] = stem.split(";");
    const nameWithNotes = nameParts.join(";").trim();
    const {
      description,
      name,
    } = splitNameAndDescription(nameWithNotes);

    if (!name) {
      return null;
    }

    return {
      category: normaliseLabelPart(category),
      description,
      name: normaliseLabelPart(name),
    };
  }

  resolveDataset({
    category = null,
    filename = null,
    label = null,
    name = null,
    source = null,
    testId = null,
  } = {}) {
    const explicitDefinition = this.getTest(testId);
    const sourceDefinition = this.getTestForSource(source);
    const parsed = this.parseCsvLabel(filename ?? label);
    const parsedDefinition = parsed
      ? this.findDefinitionByCategoryName(parsed.category, parsed.name)
      : null;
    const categoryNameDefinition = category || name
      ? this.findDefinitionByCategoryName(category, name)
      : null;
    const legacyDefinition = this.definitionsByLegacyName.get(getLookupKey(getFilenameStem(label ?? filename))) ?? null;
    const definition = explicitDefinition
      ?? categoryNameDefinition
      ?? parsedDefinition
      ?? sourceDefinition
      ?? legacyDefinition
      ?? null;
    const resolvedCategory = normaliseLabelPart(category)
      ?? parsed?.category
      ?? definition?.category
      ?? null;
    const resolvedName = normaliseLabelPart(name)
      ?? parsed?.name
      ?? definition?.name
      ?? normaliseLabelPart(label)
      ?? null;
    const labelText = this.formatCsvLabel({
      category: resolvedCategory,
      name: resolvedName,
    }) ?? normaliseLabelPart(label);

    return {
      category: resolvedCategory,
      label: labelText,
      modelTracks: [...(definition?.modelTracks ?? [])],
      name: resolvedName,
      source: definition?.source ?? source ?? null,
      testId: definition?.id ?? testId ?? null,
    };
  }

  hasModelTrack(datasetMetadata, track) {
    return this.getModelTracks(datasetMetadata).includes(track);
  }

  getModelTracks(datasetMetadata) {
    return Array.isArray(datasetMetadata?.modelTracks)
      ? [...datasetMetadata.modelTracks]
      : [];
  }
}

export const DEFAULT_MODEL_MAPPING = new ModelMapping();

function getCategoryNameKey(category, name) {
  return `${getLookupKey(category)};${getLookupKey(name)}`;
}

function getLookupKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bcallibration\b/g, "calibration")
    .replace(/\bcallibrartion\b/g, "calibration");
}

function getFilenameStem(value) {
  const filename = String(value ?? "").split(/[\\/]/u).pop() ?? "";

  return filename.replace(/\.csv$/iu, "").trim();
}

function normaliseLabelPart(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();

  return text || null;
}

function splitNameAndDescription(value) {
  const text = normaliseLabelPart(value);

  if (!text) {
    return {
      description: null,
      name: null,
    };
  }

  const separatorIndex = text.indexOf("-");

  if (separatorIndex < 0) {
    return {
      description: null,
      name: text,
    };
  }

  return {
    description: normaliseLabelPart(text.slice(separatorIndex + 1)),
    name: normaliseLabelPart(text.slice(0, separatorIndex)),
  };
}

function isCompatibleNameKey(definition, nameKey) {
  const allowedNameKeys = [definition.name, ...definition.legacyNames]
    .map(getLookupKey)
    .filter(Boolean);

  return allowedNameKeys.some((allowedNameKey) => (
    nameKey === allowedNameKey || nameKey.startsWith(`${allowedNameKey} `)
  ));
}
