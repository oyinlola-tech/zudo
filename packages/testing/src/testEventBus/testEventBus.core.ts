/**
 * Test event bus helpers.
 *
 * Wraps the real EventBus with recording and assertion support.
 */

import { EventBus } from "@zudojs/events";

import { randomUUID } from "node:crypto";

import type {
  Event,
  EventInput,
  EventBusOptions,
  EventPublishResult,
} from "@zudojs/events";

import type { EventId } from "@zudojs/constants";

/**
 * A recorded event publication.
 */
export interface RecordedEvent<TPayload = unknown> {
  readonly event: Event<TPayload>;
  readonly result: EventPublishResult<Event<TPayload>>;
  readonly timestamp: Date;
}

/**
 * A test event bus with recording capabilities.
 */
export interface TestEventBus {
  readonly bus: EventBus;

  /**
   * All recorded publications.
   */
  readonly published: readonly RecordedEvent[];

  /**
   * Publish an event and record the result.
   */
  publish: <TPayload>(
    input: EventInput<TPayload>,
  ) => Promise<EventPublishResult<Event<TPayload>>>;

  /**
   * Find published events by type.
   */
  findByType: (type: string) => readonly RecordedEvent[];

  /**
   * Clear recorded publications.
   */
  clear: () => void;

  /**
   * Dispose the event bus.
   */
  dispose: () => void;
}

/**
 * Creates a test event bus with recording.
 *
 * @param options - EventBus options.
 * @returns A TestEventBus instance.
 *
 * @example
 * ```ts
 * const testBus = createTestEventBus();
 *
 * await testBus.publish({ type: "user.created", payload: { id: "123" } });
 *
 * expect(testBus.published).toHaveLength(1);
 * expect(testBus.findByType("user.created")).toHaveLength(1);
 *
 * testBus.dispose();
 * ```
 */
export function createTestEventBus(
  options: EventBusOptions = {},
): TestEventBus {
  const bus = new EventBus(options);
  const published: RecordedEvent[] = [];

  bus.start();

  const publish = async <TPayload>(
    input: EventInput<TPayload>,
  ): Promise<EventPublishResult<Event<TPayload>>> => {
    const event: Event<TPayload> = {
      id: `evt_${randomUUID()}` as EventId,
      type: input.type,
      payload: input.payload,
      timestamp: new Date(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    const result = await bus.publish(event);

    published.push({
      event: result.event,
      result,
      timestamp: new Date(),
    });

    return result;
  };

  const findByType = (type: string): readonly RecordedEvent[] =>
    published.filter((e) => e.event.type === type);

  const clear = (): void => {
    published.length = 0;
  };

  const dispose = (): void => {
    bus.dispose();
  };

  return {
    bus,
    get published() {
      return [...published];
    },
    publish,
    findByType,
    clear,
    dispose,
  };
}
