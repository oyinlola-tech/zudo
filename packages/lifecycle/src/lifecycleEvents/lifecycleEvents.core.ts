/**
 * @zudojs/lifecycle/events
 *
 * Lifecycle event emitter — emits typed events for observability integration.
 */

/** Lifecycle event types. */
export type LifecycleEventType =
  | "component:registered"
  | "component:initializing"
  | "component:initialized"
  | "component:starting"
  | "component:started"
  | "component:ready"
  | "component:stopping"
  | "component:stopped"
  | "component:failed"
  | "application:initializing"
  | "application:initialized"
  | "application:starting"
  | "application:ready"
  | "application:stopping"
  | "application:stopped"
  | "application:disposed";

/** Event payload for component events. */
export interface LifecycleComponentEvent {
  /** Component ID. */
  readonly componentId: string;
  /** Duration in ms (for completion events). */
  readonly duration?: number;
  /** Error if the event represents a failure. */
  readonly error?: unknown;
}

/** Event payload for application events. */
export interface LifecycleApplicationEvent {
  /** Timestamp. */
  readonly timestamp: number;
  /** Duration in ms (for completion events). */
  readonly duration?: number;
}

/** A lifecycle event with its type and payload. */
export interface LifecycleEvent {
  /** The event type. */
  readonly type: LifecycleEventType;
  /** Component payload (for component events). */
  readonly component?: LifecycleComponentEvent;
  /** Duration in ms (for completion events). */
  readonly duration?: number;
  /** Error if the event represents a failure. */
  readonly error?: unknown;
  /** Timestamp. */
  readonly timestamp: number;
}

/** Event listener function. */
export type LifecycleEventListener = (event: LifecycleEvent) => void;

/**
 * Simple event emitter for lifecycle events.
 * Integrates with observability without depending on the events package.
 */
export class LifecycleEventEmitter {
  private readonly _listeners = new Map<
    LifecycleEventType,
    Set<LifecycleEventListener>
  >();

  /** Subscribes to an event type. */
  public on(
    type: LifecycleEventType,
    listener: LifecycleEventListener,
  ): () => void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);

    return () => {
      this._listeners.get(type)?.delete(listener);
    };
  }

  /** Emits an event. */
  public emit(
    type: LifecycleEventType,
    data: Omit<LifecycleEvent, "type" | "timestamp">,
  ): void {
    const event: LifecycleEvent = {
      type,
      timestamp: Date.now(),
      ...data,
    };

    const listeners = this._listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Intentional no-op: event listeners must not crash lifecycle operations.
        }
      }
    }
  }

  /** Removes all listeners. */
  public clear(): void {
    this._listeners.clear();
  }
}
