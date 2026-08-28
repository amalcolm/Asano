import {
  FLOATING_GRAPH_CHANNEL_PREFIX,
  FLOATING_GRAPH_PROTOCOL,
  createGraphId,
  isRecord,
  requireNonEmptyString,
} from "./utilities.js";

const MAX_SEEN_MESSAGE_IDS = 4096;

export class FloatingGraphCommunication {
  constructor({ graphId, peerWindow = null, windowRef = window } = {}) {
    this.graphId = requireNonEmptyString(graphId, "graphId");
    this.peerWindow = peerWindow;
    this.acceptedPeerWindow = peerWindow;
    this.windowRef = windowRef;
    this.senderId = createGraphId("graph-peer");
    this.channel = null;
    this.handlers = new Set();
    this.messageSequence = 0;
    this.seenMessageIds = new Set();
    this.started = false;

    this.handleChannelMessage = this.handleChannelMessage.bind(this);
    this.handleWindowMessage = this.handleWindowMessage.bind(this);
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;

    const BroadcastChannelClass = this.windowRef.BroadcastChannel
      ?? globalThis.BroadcastChannel;

    if (typeof BroadcastChannelClass === "function") {
      try {
        this.channel = new BroadcastChannelClass(
          `${FLOATING_GRAPH_CHANNEL_PREFIX}:${this.graphId}`,
        );
        this.channel.addEventListener("message", this.handleChannelMessage);
      } catch {
        this.channel = null;
      }
    }

    this.windowRef.addEventListener("message", this.handleWindowMessage);
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.started = false;

    if (this.channel) {
      this.channel.removeEventListener("message", this.handleChannelMessage);
      this.channel.close();
      this.channel = null;
    }

    this.windowRef.removeEventListener("message", this.handleWindowMessage);
    this.acceptedPeerWindow = this.peerWindow;
    this.handlers.clear();
    this.seenMessageIds.clear();
  }

  subscribe(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("A floating-graph message handler is required.");
    }

    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  setPeerWindow(peerWindow) {
    this.peerWindow = peerWindow;

    if (peerWindow) {
      this.acceptedPeerWindow = peerWindow;
    }
  }

  clearAcceptedPeerWindow() {
    if (!this.peerWindow) {
      this.acceptedPeerWindow = null;
    }
  }

  send(type, payload = {}, { revision = 0 } = {}) {
    if (!this.started || typeof type !== "string" || !type) {
      return false;
    }

    const envelope = {
      graphId: this.graphId,
      messageId: `${this.senderId}-${this.messageSequence += 1}`,
      payload,
      protocol: FLOATING_GRAPH_PROTOCOL,
      revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
      senderId: this.senderId,
      type,
    };

    let sent = false;

    if (this.channel) {
      try {
        this.channel.postMessage(envelope);
        sent = true;
      } catch {
        // The peer-window transport below may still be available.
      }
    }

    const target = this.peerWindow;

    try {
      if (target && !target.closed) {
        const targetOrigin = this.windowRef.location.origin === "null"
          ? "*"
          : this.windowRef.location.origin;

        target.postMessage(envelope, targetOrigin);
        sent = true;
      }
    } catch {
      // A closing popup can invalidate its WindowProxy between checks.
    }

    return sent;
  }

  handleChannelMessage(event) {
    this.receive(event.data);
  }

  handleWindowMessage(event) {
    if (
      this.windowRef.location.origin !== "null"
      && event.origin !== this.windowRef.location.origin
    ) {
      return;
    }

    const expectedSource = this.peerWindow
      ?? this.acceptedPeerWindow;

    if (!expectedSource || event.source !== expectedSource) {
      return;
    }

    this.receive(event.data);
  }

  receive(message) {
    if (!isValidEnvelope(message, this.graphId, this.senderId)) {
      return;
    }

    if (this.seenMessageIds.has(message.messageId)) {
      return;
    }

    this.seenMessageIds.add(message.messageId);

    if (this.seenMessageIds.size > MAX_SEEN_MESSAGE_IDS) {
      this.seenMessageIds.clear();
      this.seenMessageIds.add(message.messageId);
    }

    this.handlers.forEach((handler) => handler(message));
  }
}

function isValidEnvelope(message, graphId, senderId) {
  return isRecord(message)
    && message.protocol === FLOATING_GRAPH_PROTOCOL
    && message.graphId === graphId
    && message.senderId !== senderId
    && typeof message.senderId === "string"
    && typeof message.messageId === "string"
    && typeof message.type === "string"
    && Number.isInteger(message.revision)
    && message.revision >= 0
    && isRecord(message.payload);
}
