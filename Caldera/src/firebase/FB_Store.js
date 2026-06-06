import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { addDoc, collection, getFirestore, serverTimestamp } from "firebase/firestore/lite";
import { getAI, getGenerativeModel, VertexAIBackend, GoogleAIBackend } from "firebase/ai";


const DEFAULT_APP_NAME = "[DEFAULT]";
const DEFAULT_COLLECTION_NAME = "modelRuns";
const DEFAULT_SCHEMA_VERSION = 1;

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
    this.schemaVersion = options.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
    this.signInPromise = null;

    this.app = getOrCreateApp(this.config, this.appName);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    // Initialize the Vertex AI Gemini API backend service
    this.ai = getAI(this.app, { backend: new GoogleAIBackend() });

    // Create a `GenerativeModel` instance with a model that supports your use case
    this.model = getGenerativeModel(this.ai, { model: "gemini-3.5-flash" });
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
      modelType: safePayload.modelType ?? "",
      ownerUid: user.uid,
      payload: safePayload,
      schemaVersion: this.schemaVersion,
      sourceCsvName: safePayload.sourceCsvName ?? "",
    });
  }

async testAI() {
  let output = document.querySelector("#aiOutput");

  if (!output) {
    output = document.createElement("div");
    output.id = "aiOutput";
    output.className = "ai-output";
    document.body.appendChild(output);
  }

  const prompt = "Write a short paragraph about a magic backpack.";

  // Clear previous output.
  output.replaceChildren();

  // One text node, updated as chunks arrive.
  const textNode = document.createTextNode("");
  output.appendChild(textNode);

  const result = await this.model.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const chunkText = chunk.text();

    if (!chunkText)
      continue;

    textNode.appendData(chunkText);

    // Optional: keep scrolled to bottom if the div is scrollable.
    output.scrollTop = output.scrollHeight;
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
