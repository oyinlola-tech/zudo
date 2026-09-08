/**
 * @zudojs/testing — Recording logger construction.
 *
 * Split from the factory so a derived logger — `child()` or `withContext()` —
 * is built the same way as its parent and shares the same recording.
 *
 * @module spyLogger/spyLogger.recording
 */

import type {
  LoggerLevel,
  LogMetadata,
  ChildLoggerOptions,
  LoggerContext,
} from "@zudojs/logger";
import type { LogCall, SpyLogger } from "./spyLogger.type.js";
import {
  deepMatches,
  mergeContext,
  mergeLoggerContext,
} from "./spyLogger.context.js";

/** Numeric level for each method, ascending in verbosity. */
export const LEVELS = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
} as const;

/** Shared recording state, so derived loggers report to their parent. */
export interface Recorder {
  readonly calls: LogCall[];
}

/** Options controlling a derived logger's identity. */
export interface DerivedOptions {
  readonly name: string;
  readonly context?: LoggerContext;
}

/** Builds a logger over an existing recording. */
export function createRecordingLogger(
  recorder: Recorder,
  derived: DerivedOptions,
  initialLevel: LoggerLevel,
  initiallyEnabled: boolean,
): SpyLogger {
  let level = initialLevel;
  let enabled = initiallyEnabled;

  /** Records a call, honouring the configured level and enabled state. */
  const record = (
    method: string,
    callLevel: LoggerLevel,
    message: string,
    metadata?: LogMetadata,
  ): void => {
    if (!enabled) return;
    if ((callLevel as number) > (level as number)) return;

    recorder.calls.push({
      method,
      level: callLevel,
      message,
      metadata: mergeContext(derived.context, metadata),
      timestamp: new Date(),
    });
  };

  const at =
    (method: keyof typeof LEVELS) =>
    (message: string, metadata?: LogMetadata): void => {
      record(method, LEVELS[method] as LoggerLevel, message, metadata);
    };

  return {
    get name(): string {
      return derived.name;
    },
    get level(): LoggerLevel {
      return level;
    },
    get enabled(): boolean {
      return enabled;
    },
    get calls(): readonly LogCall[] {
      return [...recorder.calls];
    },

    fatal: at("fatal"),
    error: at("error"),
    warn: at("warn"),
    info: at("info"),
    debug: at("debug"),
    trace: at("trace"),

    log: (
      logLevel: LoggerLevel,
      message: string,
      options?: { metadata?: LogMetadata },
    ) => {
      record("log", logLevel, message, options?.metadata);
    },

    child: (options?: ChildLoggerOptions) =>
      createRecordingLogger(
        recorder,
        {
          name: `${derived.name}.${options?.name ?? "child"}`,
          ...(derived.context ? { context: derived.context } : {}),
        },
        level,
        enabled,
      ),

    withContext: (context: LoggerContext) =>
      createRecordingLogger(
        recorder,
        {
          name: derived.name,
          context: mergeLoggerContext(derived.context, context),
        },
        level,
        enabled,
      ),

    setLevel: (newLevel: LoggerLevel) => {
      level = newLevel;
    },
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
    },
    flush: async () => {},
    close: async () => {},

    clear: () => {
      recorder.calls.length = 0;
    },
    findByMethod: (method: string) =>
      recorder.calls.filter((call) => call.method === method),
    findByMessage: (substring: string) =>
      recorder.calls.filter((call) => call.message.includes(substring)),
    findByMetadata: (key: string, value: unknown) =>
      recorder.calls.filter(
        (call) =>
          call.metadata !== undefined && deepMatches(call.metadata[key], value),
      ),
  };
}
