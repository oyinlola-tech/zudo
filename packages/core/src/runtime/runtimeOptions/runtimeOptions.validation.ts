import type { RuntimeMode, RuntimeRole } from "./runtimeOptions.type.js";

/**
 * Validates a runtime mode.
 */
export function assertRuntimeMode(
  value: unknown,
): asserts value is RuntimeMode {
  if (!isRuntimeMode(value)) {
    throw new TypeError(
      `Invalid runtime mode "${String(value)}". Expected development, test, or production.`,
    );
  }
}

/**
 * Validates a runtime role.
 */
export function assertRuntimeRole(
  value: unknown,
): asserts value is RuntimeRole {
  if (!isRuntimeRole(value)) {
    throw new TypeError(`Invalid runtime role "${String(value)}".`);
  }
}

/**
 * Checks whether a runtime mode is valid.
 */
export function isRuntimeMode(value: unknown): value is RuntimeMode {
  return value === "development" || value === "test" || value === "production";
}

/**
 * Checks whether a runtime role is valid.
 */
export function isRuntimeRole(value: unknown): value is RuntimeRole {
  return (
    value === "application" ||
    value === "api" ||
    value === "worker" ||
    value === "scheduler" ||
    value === "cli"
  );
}

/**
 * Validates the runtime name.
 */
export function validateRuntimeName(name: string | undefined): void {
  if (name === undefined) {
    return;
  }

  if (typeof name !== "string") {
    throw new TypeError("Runtime name must be a string.");
  }

  if (name.trim().length === 0) {
    throw new TypeError("Runtime name cannot be empty.");
  }
}

/**
 * Validates a runtime timeout.
 */
export function validateRuntimeTimeout(
  timeout: number | undefined,
  field: "startup" | "shutdown",
): void {
  if (timeout === undefined) {
    return;
  }

  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new TypeError(
      `${field} timeout must be a finite number greater than or equal to 0.`,
    );
  }
}
