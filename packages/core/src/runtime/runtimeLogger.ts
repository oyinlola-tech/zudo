import type { RuntimeIdentity } from "./runtimeContext/index.js";

import type { RuntimeEnvironment } from "./runtimeEnvironment/index.js";

import type { Logger } from "../logging/core/logger.js";

export function logRuntimeEvent(
  logger: Logger,
  identity: RuntimeIdentity,
  environment: RuntimeEnvironment,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  metadata?: Record<string, unknown>,
): void {
  try {
    const log = logger as unknown as Record<string, unknown>;
    const method = log[level];

    if (typeof method === "function") {
      (
        method as (message: string, metadata?: Record<string, unknown>) => void
      ).call(logger, message, {
        runtimeId: identity.id,
        runtimeName: identity.name,
        environment: environment.engine,
        ...metadata,
      });
    }
  } catch {
    /* Logging must never break runtime operations. */
  }
}
