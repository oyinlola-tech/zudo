import type {
  Event,
  EventBus,
  EventInput,
  EventPublishResult,
  PublishOptions,
} from "@zudojs/events";

/**
 * A recorded event publication.
 */
export interface RecordedEvent<TPayload = unknown> {
  readonly event: Event<TPayload>;
  readonly result: EventPublishResult<Event<TPayload>>;
  readonly timestamp: Date;
}

/**
 * A test event bus: an `EventBus` (so it can be handed to any code that
 * takes one) that records every publication.
 *
 * `publish`, `publishEvent` and `emit` all record, whether called on the
 * test bus or on `bus` (the same instance).
 */
export interface TestEventBus extends EventBus {
  /** This bus. Kept for code written against the earlier wrapper. */
  readonly bus: EventBus;

  /**
   * All recorded publications, oldest first.
   */
  readonly published: readonly RecordedEvent[];

  /**
   * Publishes an event and records the result. Accepts a full `Event`,
   * like `EventBus.publish`, or an `EventInput` (`{ type, payload }`),
   * like `publishEvent`.
   */
  publish<TEvent extends Event>(
    event: TEvent,
    options?: PublishOptions,
  ): Promise<EventPublishResult<TEvent>>;
  publish<TPayload>(
    input: EventInput<TPayload>,
    options?: PublishOptions,
  ): Promise<EventPublishResult<Event<TPayload>>>;

  /**
   * Find published events by type.
   */
  findByType(type: string): readonly RecordedEvent[];

  /**
   * Clear recorded publications.
   */
  clear(): void;
}
