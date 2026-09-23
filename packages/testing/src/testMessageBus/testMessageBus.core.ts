/**
 * Test message bus helpers.
 *
 * A real in-memory MessageBus that records every dispatch, whichever
 * method it came through.
 */

import { InMemoryMessageBus } from "@zudojs/messaging";

import type {
  Message,
  MessageBus,
  MessageBusOptions,
  DispatchResult,
  DispatchOptions,
} from "@zudojs/messaging";

/**
 * A recorded message dispatch.
 */
export interface RecordedMessage<TPayload = unknown> {
  readonly message: Message<TPayload>;
  readonly result: DispatchResult;
  readonly timestamp: Date;
}

/**
 * A test message bus: a `MessageBus` (so it can be handed to any code
 * that takes one) that records every dispatch.
 *
 * `send` and `dispatch` both record, whether called on the test bus or on
 * `bus` (the same instance).
 */
export interface TestMessageBus extends MessageBus {
  /** This bus. Kept for code written against the earlier wrapper. */
  readonly bus: MessageBus;

  /**
   * All recorded dispatches, oldest first.
   */
  readonly dispatched: readonly RecordedMessage[];

  /**
   * Find dispatched messages by type.
   */
  findByType(type: string): readonly RecordedMessage[];

  /**
   * Clear recorded dispatches.
   */
  clear(): void;
}

/**
 * InMemoryMessageBus subclass that records at `dispatch`, the entry point
 * `send` funnels into.
 */
class RecordingMessageBus extends InMemoryMessageBus implements TestMessageBus {
  private readonly recorded: RecordedMessage[] = [];

  constructor(options: MessageBusOptions) {
    super(options);
    // Bound, so destructured methods keep working as they did with the
    // earlier closure-based wrapper.
    this.send = this.send.bind(this);
    this.dispatch = this.dispatch.bind(this);
    this.findByType = this.findByType.bind(this);
    this.clear = this.clear.bind(this);
    this.dispose = this.dispose.bind(this);
  }

  get bus(): MessageBus {
    return this;
  }

  get dispatched(): readonly RecordedMessage[] {
    return [...this.recorded];
  }

  override async dispatch<TPayload, TResult>(
    message: Message<TPayload>,
    options?: DispatchOptions<TResult>,
  ): Promise<DispatchResult<TResult>> {
    const result = await super.dispatch(message, options);
    this.recorded.push(
      Object.freeze({ message, result, timestamp: new Date() }),
    );
    return result;
  }

  findByType(type: string): readonly RecordedMessage[] {
    return this.recorded.filter((entry) => entry.message.type === type);
  }

  clear(): void {
    this.recorded.length = 0;
  }
}

/**
 * Creates a test message bus that records every dispatch.
 *
 * @param options - MessageBus options.
 * @returns A TestMessageBus, which is itself a `MessageBus`.
 *
 * @example
 * ```ts
 * const messages = createTestMessageBus();
 * messages.on("user.created", handler);
 *
 * await notifier.run(messages); // takes a MessageBus, calls send(...)
 *
 * expect(messages.findByType("user.created")).toHaveLength(1);
 * messages.dispose();
 * ```
 */
export function createTestMessageBus(
  options: MessageBusOptions = {},
): TestMessageBus {
  return new RecordingMessageBus(options);
}
