/**
 * @zudojs/rpc/validation
 *
 * Request-level checks applied before a payload reaches a handler.
 *
 * Requests arrive from an untrusted peer over a transport, so these are
 * the first checks the server runs, not the last.
 */

import type { Schema, SchemaIssue } from "@zudojs/schema";

import type { RPCRequest } from "../types/rpcRequest.type.js";

import {
  RPCInternalError,
  RPCInvalidRequestError,
  RPCValidationError,
} from "../errors/rpc.errors.js";

import {
  MAX_PROCEDURE_NAME_LENGTH,
  MAX_RPC_PAYLOAD_SIZE,
  PROCEDURE_NAME_PATTERN,
} from "../constants/rpcConstants.core.js";

/**
 * Limits applied to an incoming request.
 */
export interface RPCRequestLimits {
  /**
   * Maximum encoded payload size in bytes. Defaults to
   * {@link MAX_RPC_PAYLOAD_SIZE}. Set to `0` to skip the check when the
   * transport already enforces a frame limit.
   */
  readonly maxPayloadBytes?: number;
  /**
   * Whether procedure names must match {@link PROCEDURE_NAME_PATTERN}.
   * Defaults to `true`.
   */
  readonly enforceProcedureNamePattern?: boolean;
}

/**
 * Validates a procedure name.
 *
 * Length is checked before the pattern so a pathological name cannot
 * drive regex backtracking.
 */
export function assertValidProcedureName(
  name: unknown,
): asserts name is string {
  if (typeof name !== "string" || name.length === 0) {
    throw new RPCInvalidRequestError(
      "Procedure name must be a non-empty string.",
    );
  }

  if (name.length > MAX_PROCEDURE_NAME_LENGTH) {
    throw new RPCInvalidRequestError(
      `Procedure name exceeds ${MAX_PROCEDURE_NAME_LENGTH} characters.`,
    );
  }

  if (!PROCEDURE_NAME_PATTERN.test(name)) {
    throw new RPCInvalidRequestError(
      `Procedure name "${name}" must be dot-separated identifiers, e.g. "users.getUser".`,
    );
  }
}

/**
 * Measures the encoded size of a payload in bytes.
 *
 * Returns `undefined` for a payload that cannot be encoded, which the
 * caller reports as an invalid request rather than passing on.
 */
export function measurePayloadBytes(payload: unknown): number | undefined {
  if (payload === undefined) {
    return 0;
  }

  try {
    const encoded = JSON.stringify(payload);
    if (encoded === undefined) {
      return undefined;
    }
    return Buffer.byteLength(encoded, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Validates the shape and size of an incoming request.
 *
 * @throws {RPCInvalidRequestError} when the frame is malformed or the
 * payload exceeds the configured limit.
 */
export function assertValidRequest(
  request: unknown,
  limits: RPCRequestLimits = {},
): asserts request is RPCRequest {
  if (typeof request !== "object" || request === null) {
    throw new RPCInvalidRequestError("Request must be an object.");
  }

  const candidate = request as Partial<RPCRequest>;

  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new RPCInvalidRequestError("Request id must be a non-empty string.");
  }

  if (limits.enforceProcedureNamePattern ?? true) {
    assertValidProcedureName(candidate.procedure);
  } else if (
    typeof candidate.procedure !== "string" ||
    candidate.procedure.length === 0
  ) {
    throw new RPCInvalidRequestError(
      "Procedure name must be a non-empty string.",
      undefined,
    );
  }

  if (
    candidate.metadata !== undefined &&
    (typeof candidate.metadata !== "object" || candidate.metadata === null)
  ) {
    throw new RPCInvalidRequestError(
      "Request metadata must be an object.",
      candidate.procedure,
    );
  }

  const maxBytes = limits.maxPayloadBytes ?? MAX_RPC_PAYLOAD_SIZE;

  if (maxBytes > 0) {
    const size = measurePayloadBytes(candidate.payload);

    if (size === undefined) {
      throw new RPCInvalidRequestError(
        "Request payload could not be encoded.",
        candidate.procedure,
      );
    }

    if (size > maxBytes) {
      throw new RPCInvalidRequestError(
        `Request payload of ${size} bytes exceeds the ${maxBytes} byte limit.`,
        candidate.procedure,
      );
    }
  }
}

/**
 * Converts schema issues into metadata safe to return to a caller.
 *
 * Only the path, code and message travel; the received input is dropped
 * so a validation response cannot echo back data the caller sent.
 */
export function toValidationIssues(
  issues: readonly SchemaIssue[],
): readonly { path: string; code: string; message: string }[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: String(issue.code),
    message: issue.message,
  }));
}

/**
 * The part of a `@zudojs/schema` Schema this package depends on.
 *
 * Structural so any schema-like validator can be supplied, and so the
 * dependency stays to the parse contract rather than the class.
 */
export type RPCSchema<TOutput = unknown> = Pick<
  Schema<TOutput, never>,
  "safeParse"
>;

/**
 * Parses caller input against a schema.
 *
 * @throws {RPCValidationError} carrying the issues, which are safe to
 * return: they describe the caller's own input.
 */
export function parseInput<T>(
  schema: RPCSchema<T>,
  value: unknown,
  procedureName: string,
): T {
  const result = schema.safeParse(value as never);

  if (result.success) {
    return result.data;
  }

  throw new RPCValidationError(
    `Invalid input for procedure "${procedureName}".`,
    toValidationIssues(result.issues),
    procedureName,
  );
}

/**
 * Parses a handler's result against its output schema.
 *
 * An invalid output is a server defect rather than a caller mistake, so
 * it is thrown as an `RPCInternalError` (`expose: false`): the server
 * answers with the generic internal error and hands the detail — the
 * failing paths and codes — to `onInternalError`. Throwing a validation
 * error here told the caller *its* request was invalid, with an empty
 * issue list, for a fault that is entirely the handler's.
 *
 * @throws {RPCInternalError}
 */
export function parseOutput<T>(
  schema: RPCSchema<T>,
  value: unknown,
  procedureName: string,
): T {
  const result = schema.safeParse(value as never);

  if (result.success) {
    return result.data;
  }

  const where = toValidationIssues(result.issues)
    .map((issue) => `${issue.path || "(root)"}: ${issue.code}`)
    .join(", ");

  throw new RPCInternalError(
    `Procedure "${procedureName}" produced a response that does not match its output schema at ${where}.`,
    procedureName,
  );
}
