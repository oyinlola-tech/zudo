/**
 * @zudojs/testing — Test context recorder implementations.
 *
 * Creates log, event, and message recorders for test contexts.
 */

import type {
  CapturedLogEntry,
  CapturedEvent,
  CapturedMessage,
  LogRecorder,
  EventRecorder,
  MessageRecorder,
} from "./testContext.recorder.type.js";

/**
 * Creates a log recorder that captures log entries.
 */
export function createLogRecorder(): LogRecorder {
  const entries: CapturedLogEntry[] = [];

  return {
    get entries(): readonly CapturedLogEntry[] {
      return [...entries];
    },
    record: (
      level: string,
      message: string,
      metadata?: Record<string, unknown>,
    ): void => {
      entries.push({
        level,
        message,
        metadata,
        timestamp: new Date(),
      });
    },
    clear: (): void => {
      entries.length = 0;
    },
    findByLevel: (level: string): readonly CapturedLogEntry[] =>
      entries.filter((e) => e.level === level),
    findByMessage: (substring: string): readonly CapturedLogEntry[] =>
      entries.filter((e) => e.message.includes(substring)),
  };
}

/**
 * Creates an event recorder that captures events.
 */
export function createEventRecorder(): EventRecorder {
  const entries: CapturedEvent[] = [];

  return {
    get entries(): readonly CapturedEvent[] {
      return [...entries];
    },
    record: (type: string, payload: unknown): void => {
      entries.push({
        type,
        payload,
        timestamp: new Date(),
      });
    },
    clear: (): void => {
      entries.length = 0;
    },
    findByType: (type: string): readonly CapturedEvent[] =>
      entries.filter((e) => e.type === type),
  };
}

/**
 * Creates a message recorder that captures messages.
 */
export function createMessageRecorder(): MessageRecorder {
  const entries: CapturedMessage[] = [];

  return {
    get entries(): readonly CapturedMessage[] {
      return [...entries];
    },
    record: (type: string, payload: unknown): void => {
      entries.push({
        type,
        payload,
        timestamp: new Date(),
      });
    },
    clear: (): void => {
      entries.length = 0;
    },
    findByType: (type: string): readonly CapturedMessage[] =>
      entries.filter((e) => e.type === type),
  };
}
