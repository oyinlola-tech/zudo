/**
 * Test message bus helpers.
 *
 * Wraps the real MessageBus with recording and assertion support.
 */

import { createMessageBus } from "@zudojs/messaging";

import { randomUUID } from "node:crypto";

import type {
  Message,
  MessageInput,
  MessageBus,
  MessageBusOptions,
  MessageId,
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
 * A test message bus with recording capabilities.
 */
export interface TestMessageBus {
  readonly bus: MessageBus;

  /**
   * All recorded dispatches.
   */
  readonly dispatched: readonly RecordedMessage[];

  /**
   * Send a message and record the result.
   */
  send: <TPayload>(
    input: MessageInput<TPayload>,
    options?: DispatchOptions,
  ) => Promise<DispatchResult>;

  /**
   * Find dispatched messages by type.
   */
  findByType: (type: string) => readonly RecordedMessage[];

  /**
   * Clear recorded dispatches.
   */
  clear: () => void;

  /**
   * Dispose the message bus.
   */
  dispose: () => void;
}

/**
 * Creates a test message bus with recording.
 *
 * @param options - MessageBus options.
 * @returns A TestMessageBus instance.
 *
 * @example
 * ```ts
 * const testBus = createTestMessageBus();
 *
 * testBus.bus.on("user.created", handler);
 * await testBus.send({ type: "user.created", payload: { id: "123" } });
 *
 * expect(testBus.dispatched).toHaveLength(1);
 * expect(testBus.findByType("user.created")).toHaveLength(1);
 *
 * testBus.dispose();
 * ```
 */
export function createTestMessageBus(
  options: MessageBusOptions = {},
): TestMessageBus {
  const bus = createMessageBus(options);
  const dispatched: RecordedMessage[] = [];

  const send = async <TPayload>(
    input: MessageInput<TPayload>,
    dispatchOptions?: DispatchOptions,
  ): Promise<DispatchResult> => {
    const message: Message<TPayload> = {
      id: `msg_${randomUUID()}` as MessageId,
      type: input.type,
      payload: input.payload,
      timestamp: new Date(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    const result = await bus.send(message, dispatchOptions);

    dispatched.push({
      message,
      result,
      timestamp: new Date(),
    });

    return result;
  };

  const findByType = (type: string): readonly RecordedMessage[] =>
    dispatched.filter((d) => d.message.type === type);

  const clear = (): void => {
    dispatched.length = 0;
  };

  const dispose = (): void => {
    bus.dispose();
  };

  return {
    bus,
    get dispatched() {
      return [...dispatched];
    },
    send,
    findByType,
    clear,
    dispose,
  };
}
