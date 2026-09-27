// In-process event bus carrying the stream events of contracts/hub-surface.
import { EventEmitter } from "node:events";
import type { StreamEvent, StreamEventMap, StreamEventType } from "@orbis/shared";

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish<T extends StreamEventType>(type: T, data: StreamEventMap[T]): StreamEvent<T> {
    const event: StreamEvent<T> = { type, data, ts: new Date().toISOString() };
    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
