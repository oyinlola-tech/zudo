import { randomUUID } from "node:crypto";

import { createExecutionContext } from "../../context/core/executionContext.context.js";

import type { RuntimeMode, RuntimeRole } from "../runtimeOptions/index.js";

import type {
  RuntimeExecutionContext,
  RuntimeExecutionMetadata,
  RuntimeIdentity,
} from "./runtimeContext.type.js";

/**
 * Creates a unique runtime identifier.
 */
export function createRuntimeId(name: string): string {
  const normalizedName = name
    .slice(0, 100)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalizedName || "runtime"}-${randomUUID()}`;
}

/**
 * Creates a RuntimeIdentity.
 */
export function createRuntimeIdentity(options: {
  readonly name: string;
  readonly mode: RuntimeMode;
  readonly role: RuntimeRole;
  readonly id?: string;
  readonly processId?: number;
}): RuntimeIdentity {
  const createdAt = new Date();

  return Object.freeze({
    id: options.id ?? createRuntimeId(options.name),
    name: options.name,
    mode: options.mode,
    role: options.role,
    createdAt,
    processId: options.processId ?? getProcessId(),
  });
}

/**
 * Creates the execution context of a runtime from its identity.
 *
 * `metadata` (typically `RuntimeOptions.metadata`) is merged under
 * the identity fields, which always win.
 */
export function createRuntimeExecutionContext(
  identity: RuntimeIdentity,
  metadata: Readonly<Record<string, unknown>> = {},
): RuntimeExecutionContext {
  const runtimeMetadata: RuntimeExecutionMetadata = {
    ...metadata,
    runtimeId: identity.id,
    runtimeName: identity.name,
    runtimeMode: identity.mode,
    runtimeRole: identity.role,
    ...(identity.processId !== undefined
      ? { processId: identity.processId }
      : {}),
  };

  return createExecutionContext({
    executionId: identity.id,
    service: identity.name,
    transport: "runtime",
    operation: "runtime",
    startedAt: identity.createdAt,
    metadata: runtimeMetadata,
  }) as RuntimeExecutionContext;
}

/**
 * @deprecated Use createRuntimeExecutionContext.
 */
export const createRuntimeContext: typeof createRuntimeExecutionContext =
  createRuntimeExecutionContext;

/**
 * Attempts to retrieve the current process ID.
 */
function getProcessId(): number | undefined {
  const runtimeProcess = (
    globalThis as {
      process?: { pid?: number };
    }
  ).process;

  return runtimeProcess?.pid;
}
