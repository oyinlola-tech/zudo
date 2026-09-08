/**
 * @zudojs/testing — Spy logger for testing.
 *
 * Records all log calls for assertion without side effects.
 */

import type { LoggerLevel } from "@zudojs/logger";
import type { SpyLogger } from "./spyLogger.type.js";
import { LEVELS, createRecordingLogger } from "./spyLogger.recording.js";

/**
 * Creates a spy logger that records all log calls.
 *
 * A logger derived with `child()` or `withContext()` writes into the *same*
 * recording as its parent, the way a real logger shares a transport. Giving
 * the derived logger its own array meant code under test that called
 * `logger.child({ module })` — the normal pattern — logged into an array
 * nobody held, so assertions on the parent silently saw nothing.
 *
 * @param name - Logger name.
 * @param level - Minimum level recorded. Defaults to TRACE (everything).
 * @returns A SpyLogger instance.
 */
export function createSpyLogger(
  name = "test",
  level: LoggerLevel = LEVELS.trace as LoggerLevel,
): SpyLogger {
  return createRecordingLogger({ calls: [] }, { name }, level, true);
}
