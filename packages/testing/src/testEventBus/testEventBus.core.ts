/**
 * Test event bus helpers.
 *
 * A real EventBus that records every publication, whichever method it
 * came through.
 */

import { EventBus, isEvent } from "@zudojs/events";

import type {
  Event,
  EventInput,
  EventBusOptions,
  EventPublishResult,
  PublishOptions,
} from "@zudojs/events";

import type { RecordedEvent, TestEventBus } from "./testEventBus.type.js";

export type { RecordedEvent, TestEventBus } from "./testEventBus.type.js";

/**
 * EventBus subclass that records at the publish entry points every other
 * path (`emit`, a bus handed to code under test) funnels into.
 */
class RecordingEventBus extends EventBus implements TestEventBus {
  private readonly recorded: RecordedEvent[] = [];

  constructor(options: EventBusOptions) {
    super(options);
    // Bound, so `const { publish, clear } = createTestEventBus()` keeps
    // working as it did with the earlier closure-based wrapper.
    this.publish = this.publish.bind(this);
    this.publishEvent = this.publishEvent.bind(this);
    this.emit = this.emit.bind(this);
    this.findByType = this.findByType.bind(this);
    this.clear = this.clear.bind(this);
    this.dispose = this.dispose.bind(this);
  }

  get bus(): EventBus {
    return this;
  }

  get published(): readonly RecordedEvent[] {
    return [...this.recorded];
  }

  override publish<TEvent extends Event>(
    event: TEvent,
    options?: PublishOptions,
  ): Promise<EventPublishResult<TEvent>>;
  override publish<TPayload>(
    input: EventInput<TPayload>,
    options?: PublishOptions,
  ): Promise<EventPublishResult<Event<TPayload>>>;
  override async publish(
    input: Event | EventInput,
    options: PublishOptions = {},
  ): Promise<EventPublishResult<Event>> {
    const result = isEvent(input)
      ? await super.publish(input, options)
      : await super.publishEvent(input, options);
    return this.record(result);
  }

  override async publishEvent<TPayload>(
    input: EventInput<TPayload>,
    options: PublishOptions = {},
  ): Promise<EventPublishResult<Event<TPayload>>> {
    return this.record(await super.publishEvent(input, options));
  }

  findByType(type: string): readonly RecordedEvent[] {
    return this.recorded.filter((entry) => entry.event.type === type);
  }

  clear(): void {
    this.recorded.length = 0;
  }

  private record<TResult extends EventPublishResult<Event>>(
    result: TResult,
  ): TResult {
    this.recorded.push(
      Object.freeze({ event: result.event, result, timestamp: new Date() }),
    );
    return result;
  }
}

/**
 * Creates a started test event bus that records every publication.
 *
 * @param options - EventBus options.
 * @returns A TestEventBus, which is itself an `EventBus`.
 *
 * @example
 * ```ts
 * const events = createTestEventBus();
 * const service = new UserService(events); // takes an EventBus
 *
 * await service.register("ann");            // calls events.publishEvent(...)
 *
 * expect(events.findByType("user.created")).toHaveLength(1);
 * events.dispose();
 * ```
 */
export function createTestEventBus(
  options: EventBusOptions = {},
): TestEventBus {
  const bus = new RecordingEventBus(options);
  bus.start();
  return bus;
}
