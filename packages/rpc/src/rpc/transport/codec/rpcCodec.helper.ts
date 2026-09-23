import { createSerializer } from "@zudojs/serialization";
import type { Serializer } from "@zudojs/serialization";

import type { RPCResponse } from "../../types/rpcResponse.type.js";

import {
  DEFAULT_RPC_HTTP_MAX_BODY_BYTES,
  MAX_RPC_FRAME_DEPTH,
} from "../../constants/rpcConstants.core.js";

/**
 * Serializer that turns RPC frames into wire text and back.
 *
 * Any `@zudojs/serialization` string serializer fits. Both ends of a
 * connection must use compatible serializers: a server created with
 * `preserveTypes: true` should be called by a client that uses it too.
 */
export type RPCFrameSerializer = Serializer<unknown, string>;

/**
 * Options for {@link createRPCJsonSerializer}.
 */
export interface RPCJsonSerializerOptions {
  /** Largest accepted encoded frame, in bytes. */
  readonly maxSize?: number;
  /** Deepest accepted nesting. Defaults to {@link MAX_RPC_FRAME_DEPTH}. */
  readonly maxDepth?: number;
  /**
   * Tag `Date`, `BigInt`, `Map`, `Set` and friends so they survive the
   * trip. Defaults to `false` (plain JSON), which any HTTP client can
   * speak.
   */
  readonly preserveTypes?: boolean;
}

/**
 * Creates the default frame serializer: `@zudojs/serialization` JSON with
 * size and depth limits, so decoding an untrusted frame is bounded.
 */
export function createRPCJsonSerializer(
  options: RPCJsonSerializerOptions = {},
): RPCFrameSerializer {
  return createSerializer("json", {
    maxSize: options.maxSize ?? DEFAULT_RPC_HTTP_MAX_BODY_BYTES,
    maxDepth: options.maxDepth ?? MAX_RPC_FRAME_DEPTH,
    preserveTypes: options.preserveTypes ?? false,
  });
}

/**
 * Determines whether a decoded value has the shape of an
 * {@link RPCResponse}: a string `id`, a boolean `success`, and — when
 * present — an `error` with string `code` and `message`.
 *
 * Transports check this before handing a peer's reply to the client, so
 * a proxy's HTML error page or a truncated body is reported as a
 * transport failure instead of being read as a result.
 */
export function isRPCResponseFrame(value: unknown): value is RPCResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const frame = value as { id?: unknown; success?: unknown; error?: unknown };

  if (typeof frame.id !== "string" || typeof frame.success !== "boolean") {
    return false;
  }

  if (frame.success) {
    return true;
  }

  const error = frame.error as { code?: unknown; message?: unknown } | undefined;

  return (
    typeof error === "object" &&
    error !== null &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  );
}
