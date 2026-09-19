import type { Logger } from "../../logging/core/logger.js";
import type { LifecycleParticipant } from "./lifecycle.js";

/**
 * Stops, in reverse order, the first `count` participants after a
 * failed start.
 *
 * Only participants whose `start()` completed are stopped; the one
 * that threw is left to its own error handling, as `stop()` has always
 * done. Stop failures are logged and returned; they never mask the
 * start error.
 *
 * @param participants - Registered participants, in start order.
 * @param count - How many leading participants started successfully.
 * @param logger - Optional logger for rollback diagnostics.
 * @returns The errors raised by `stop()` hooks during the rollback.
 */
export async function rollbackStartedParticipants(
  participants: readonly LifecycleParticipant[],
  count: number,
  logger: Logger | undefined,
): Promise<readonly unknown[]> {
  const errors: unknown[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const participant = participants[i]!;
    try {
      logger?.debug("Rolling back lifecycle participant", {
        participant: participant.name,
      });
      await participant.stop?.();
    } catch (error) {
      errors.push(error);
      logger?.error("Failed to roll back lifecycle participant", error, {
        participant: participant.name,
      });
    }
  }

  return errors;
}
