import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore/lite";
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { FB_Panel } from "./FB_Panel.js";
import { ModelStorage } from "../model/ModelStorage.js";

const DEFAULT_APP_NAME = "[DEFAULT]";
const DEFAULT_COLLECTION_NAME = "modelRuns";
const DEFAULT_RECENT_MODEL_LIMIT = 50;
const DIFF_AMP_COMPONENT = "Diff.Amp.";

const firebaseConfig = {
  apiKey: "AIzaSyDDSldQJS7SbUyIXh9r3TZNE5bxZ_P_iOk",
  authDomain: "uow-fnirs.firebaseapp.com",
  projectId: "uow-fnirs",
  storageBucket: "uow-fnirs.firebasestorage.app",
  messagingSenderId: "45048077367",
  appId: "1:45048077367:web:9b19ed917c97ad2ad333b2",
  measurementId: "G-SP2YGHJ1F7"
};

export class FB_Store {
  constructor(nameOrOptions = {}, maybeOptions = {}) {
    const options = typeof nameOrOptions === "string"
      ? { ...maybeOptions, appName: nameOrOptions }
      : { ...nameOrOptions };

    this.appName = options.appName ?? DEFAULT_APP_NAME;
    this.collectionName = options.collectionName ?? DEFAULT_COLLECTION_NAME;
    this.config = options.config ?? firebaseConfig;
    this.signInPromise = null;
    this.testAIStartPromise = null;
    this.panel = options.panel ?? new FB_Panel(this);
    this.modelStorage = options.modelStorage ?? new ModelStorage();
    this.onPreviewModel = typeof options.onPreviewModel === "function"
      ? options.onPreviewModel
      : null;

    this.app = getOrCreateApp(this.config, this.appName);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    // Initialize the Vertex AI Gemini API backend service
    this.ai = getAI(this.app, { backend: new GoogleAIBackend() });

    // Create a `GenerativeModel` instance with a model that supports your use case
    this.ai_textModel = getGenerativeModel(this.ai, { model: "gemini-3.5-flash" });

    const autoTest = options.autoTest ?? this.testConnection;
    if (autoTest) {
      this.runWhenStable(autoTest);
    }
  }

  async signIn() {
    if (this.auth.currentUser) {
      return this.auth.currentUser;
    }

    this.signInPromise ??= signInAnonymously(this.auth)
      .then((credential) => credential.user)
      .finally(() => {
        this.signInPromise = null;
      });

    return this.signInPromise;
  }

  async saveModelRun(payload = {}) {
    const user = await this.signIn();
    const safePayload = cleanFirestoreValue(payload) ?? {};

    return addDoc(collection(this.db, this.collectionName), {
      createdAt: serverTimestamp(),
      ownerUid: user.uid,
      payload: safePayload,
    });
  }


  async testConnection() {
    this.panel.clear();
    this.panel.appendText("Testing Firebase connection...\n");
    try {
      await this.signIn();
      this.panel.appendText("Firebase connection successful!\n");

      const latestModelRun = await this.getLatestModelRun({ component: DIFF_AMP_COMPONENT });

      if (!latestModelRun) {
        this.panel.appendText("No Diff.Amp. model runs found in Firestore.\n");
        return;
      }

      if (isLatestModelRunInstalled(this.modelStorage, latestModelRun)) {
        this.panel.appendText(`Up to date\n`);
        return;
      }

      this.panel.clear();
      this.panel.setBrightText();
      this.panel.appendText("New Diff.Amp. model run found:\n");
      this.panel.appendText(`- Created At: ${formatTimestamp(latestModelRun.createdAt)}\n`);
      this.panel.appendText(`- Source Filename:\n ${trimFilename(getModelRunSourceFilename(latestModelRun))}\n`);

      this.panel.showModelPreviewButton(
        () => {
          if (!this.onPreviewModel) {
            this.panel.appendText("Preview unavailable in this view.\n");
            return;
          }

          if (!this.onPreviewModel(latestModelRun)) {
            this.panel.appendText("Preview unavailable: no local source filename found.\n");
          }
          this.panel.clear();
        },
        {
          componentType: getModelRunComponent(latestModelRun),
          modelType: getModelRunModelType(latestModelRun),
        },
      );

    } catch (error) {
      this.panel.appendText(`Firebase connection failed: ${error?.message || "Unknown error"}\n`);
    }
  }


  async getLatestModelRun({
    component = null,
    limitCount = DEFAULT_RECENT_MODEL_LIMIT,
    source = null,
  } = {}) {
    await this.signIn();

    const modelRunsQuery = query(
      collection(this.db, this.collectionName),
      orderBy("createdAt", "desc"),
      limit(limitCount),
    );
    const snapshot = await getDocs(modelRunsQuery);
    const runs = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));

    return runs.find((run) => matchesModelRun(run, { component, source })) ?? null;
  }

  runWhenStable(method) {
    this.testAIStartPromise ??= waitForStableBrowserFrame()
      .then(() => this.auth.authStateReady?.())
      .then(() => method.call(this))
      .catch((error) => this.panel.showError(`Firebase action failed: ${error?.message || "Unknown error"}`));

    return this.testAIStartPromise;
  }

  async testAI() {
    const prompt = "Write a short paragraph about a magic backpack.";

    try {
      await this.signIn();
    } catch (error) {
      console.warn("Firebase anonymous sign-in failed before AI test; trying AI anyway.", error);
    }

    // Clear previous output.
    this.panel.clear();

    const result = await this.ai_textModel.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();

      if (!chunkText) {
        continue;
      }

      this.panel.appendText(chunkText);
    }

    // Optional final aggregated response.
    const finalResponse = await result.response;
    console.log("Complete:", finalResponse.text());
  }
}

function getOrCreateApp(config, appName) {
  const existingApp = getApps().find((app) => app.name === appName);

  return existingApp ?? (
    appName === DEFAULT_APP_NAME
      ? initializeApp(config)
      : initializeApp(config, appName)
  );
}

function waitForStableBrowserFrame() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const resolveAfterFrame = () => window.setTimeout(resolve, 0);

    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(resolveAfterFrame);
      return;
    }

    resolveAfterFrame();
  });
}

function matchesModelRun(run, {
  component = null,
  source = null,
} = {}) {
  if (component && !matchesLookupText(getModelRunComponent(run), component)) {
    return false;
  }

  if (source && !matchesLookupText(getModelRunSource(run), source)) {
    return false;
  }

  return true;
}

function getModelRunDataset(run) {
  return run?.payload?.dataset ?? {};
}

function getModelRunDetails(run) {
  return run?.payload?.details ?? {};
}

function getModelRunComponent(run) {
  const dataset = getModelRunDataset(run);
  const details = getModelRunDetails(run);

  return dataset.component ?? details.component ?? "";
}

function getModelRunModelType(run) {
  return getModelRunDetails(run).modelType ?? "";
}

function getModelRunSource(run) {
  return getModelRunDataset(run).source ?? "";
}

function getModelRunSourceFilename(run) {
  return getModelRunDataset(run).sourceFilename ?? "";
}

function matchesLookupText(value, expected) {
  return getLookupText(value) === getLookupText(expected);
}

function getLookupText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatTimestamp(timestamp) {
  const date = timestamp?.toDate?.() ?? (
    timestamp instanceof Date ? timestamp : null
  );

  return date ? date.toLocaleString() : "-";
}

function trimFilename(filename) {
  if (typeof filename !== "string") {
    return "";
  }

  const parts = filename.split(/[/\\]/);
  return parts[parts.length - 1] ?? filename;
}

function getTimestampMillis(timestamp) {
  if (typeof timestamp?.toMillis === "function") {
    return timestamp.toMillis();
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  return null;
}

function isLatestModelRunInstalled(modelStorage, modelRun) {
  const summary = getInstalledModelSummary(modelStorage, modelRun);

  if (!summary) {
    return false;
  }

  if (modelRun?.id && summary.modelRunId) {
    return summary.modelRunId === modelRun.id;
  }

  const modelRunCreatedAtMillis = getTimestampMillis(modelRun?.createdAt);
  const summaryCreatedAtMillis = getDateMillis(summary.createdAt);
  const summaryInstalledAtMillis = getDateMillis(summary.installedAt);
  const summaryLatestMillis = Math.max(
    summaryCreatedAtMillis ?? 0,
    summaryInstalledAtMillis ?? 0,
  );

  return modelRunCreatedAtMillis !== null
    && summaryLatestMillis > 0
    && modelRunCreatedAtMillis <= summaryLatestMillis;
}

function getInstalledModelSummary(modelStorage, modelRun) {
  const component = getModelRunComponent(modelRun) || DIFF_AMP_COMPONENT;
  const modelType = getModelRunModelType(modelRun) || null;

  try {
    const knownModels = modelStorage?.getKnownModels?.();
    const componentEntry = knownModels?.components?.[component];

    if (!componentEntry) {
      return null;
    }

    const activeType = modelType || componentEntry.activeModelType;

    return activeType
      ? componentEntry.models?.[activeType] ?? null
      : null;
  } catch {
    return null;
  }
}

function getDateMillis(value) {
  if (!value) {
    return null;
  }

  const millis = Date.parse(value);

  return Number.isFinite(millis) ? millis : null;
}

function cleanFirestoreValue(value) {
  if (value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cleanFirestoreValue(item));
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, cleanFirestoreValue(entryValue)]),
  );
}
