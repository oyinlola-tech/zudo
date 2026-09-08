/**
 * Event assertion helpers.
 *
 * Assert events, event types, and event payloads.
 */

import type { Event } from "@zudojs/events";

import type { RecordedEvent } from "../testEventBus/testEventBus.core.js";

import type { RecordedMessage } from "../testMessageBus/testMessageBus.core.js";

import { findDifference } from "./deepEqual.core.js";

/**
 * Asserts that an event has a specific type.
 *
 * @param event - The event to check.
 * @param type - Expected event type.
 */
export function assertEventType<TPayload>(
  event: Event<TPayload>,
  type: string,
): void {
  if (event.type !== type) {
    throw new Error(`Expected event type "${type}", got "${event.type}".`);
  }
}

/**
 * Asserts that an event payload matches expected value.
 *
 * @param event - The event to check.
 * @param expected - Expected payload.
 */
export function assertEventPayload<TPayload>(
  event: Event<TPayload>,
  expected: TPayload,
): void {
  const difference = findDifference(event.payload, expected, "payload");
  if (difference) {
    throw new Error(
      `Event payload mismatch at ${difference.path}: ${difference.reason}.`,
    );
  }
}

/**
 * Asserts that a recorded event has a specific type.
 *
 * @param recorded - The recorded event.
 * @param type - Expected event type.
 */
export function assertRecordedEventType<TPayload>(
  recorded: RecordedEvent<TPayload>,
  type: string,
): void {
  assertEventType(recorded.event, type);
}

/**
 * Asserts that an array of recorded events contains at least one event of a type.
 *
 * @param events - Array of recorded events.
 * @param type - Expected event type.
 */
export function assertEventPublished<TPayload>(
  events: readonly RecordedEvent<TPayload>[],
  type: string,
): void {
  const found = events.some((e) => e.event.type === type);
  if (!found) {
    throw new Error(
      `Expected event "${type}" to be published, but it was not found.`,
    );
  }
}

/**
 * Asserts that an array of recorded messages contains at least one message of a type.
 *
 * @param messages - Array of recorded messages.
 * @param type - Expected message type.
 */
export function assertMessageDispatched<TPayload>(
  messages: readonly RecordedMessage<TPayload>[],
  type: string,
): void {
  const found = messages.some((m) => m.message.type === type);
  if (!found) {
    throw new Error(
      `Expected message "${type}" to be dispatched, but it was not found.`,
    );
  }
}

/**
 * Asserts that no event of a given type was published.
 *
 * The negative counterpart matters as much as the positive one: "this request
 * must not emit a refund event" is a real assertion, and without this helper
 * it gets written as a hand-rolled `.some()` that is easy to invert.
 */
export function assertEventNotPublished<TPayload>(
  events: readonly RecordedEvent<TPayload>[],
  type: string,
): void {
  const found = events.filter((e) => e.event.type === type);
  if (found.length > 0) {
    throw new Error(
      `Expected event "${type}" not to be published, but it was published ${found.length} time(s).`,
    );
  }
}

/**
 * Asserts that no message of a given type was dispatched.
 */
export function assertMessageNotDispatched<TPayload>(
  messages: readonly RecordedMessage<TPayload>[],
  type: string,
): void {
  const found = messages.filter((m) => m.message.type === type);
  if (found.length > 0) {
    throw new Error(
      `Expected message "${type}" not to be dispatched, but it was dispatched ${found.length} time(s).`,
    );
  }
}
