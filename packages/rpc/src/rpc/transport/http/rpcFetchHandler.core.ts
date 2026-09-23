import type { RPCResponse } from "../../types/rpcResponse.type.js";

import type { RPCAuthContext } from "../../context/rpcContext.type.js";

import type { RPCFrameHandler } from "../memory/rpcMemoryTransport.core.js";

import type { RPCFrameSerializer } from "../codec/rpcCodec.helper.js";

import { createRPCJsonSerializer } from "../codec/rpcCodec.helper.js";

import { readBoundedBody } from "../codec/rpcBody.helper.js";

import { createRPCErrorResponse } from "../../types/rpcResponse.type.js";

import { mapRPCError } from "../../server/rpcErrorMapping.helper.js";

import {
  DEFAULT_RPC_HTTP_MAX_BODY_BYTES,
  INTERNAL_ERROR_MESSAGE,
  MAX_RPC_REQUEST_ID_LENGTH,
} from "../../constants/rpcConstants.core.js";

import { rpcHttpStatus } from "./rpcHttpStatus.helper.js";

/** Options for {@link createRPCFetchHandler}. */
export interface RPCFetchHandlerOptions {
  /**
   * Derives trusted identity from the HTTP request (verify a bearer token,
   * read an mTLS peer, look up a session). The result reaches middleware
   * and handlers as `context.auth`. Throw an `RPCAuthenticationError` to
   * refuse the call; any other error is answered as an internal error.
   */
  readonly auth?: (request: Request) => RPCAuthContext | undefined | Promise<RPCAuthContext | undefined>;
  /** Frame serializer. Must match the clients'. Defaults to plain JSON. */
  readonly serializer?: RPCFrameSerializer;
  /** Largest request body accepted, in bytes. */
  readonly maxBodyBytes?: number;
  /** Receives failures answered with the generic internal error. */
  readonly onInternalError?: (error: unknown, requestId: string) => void;
}

const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i;

/**
 * Creates a web-standard handler, `(request: Request) => Promise<Response>`,
 * that serves an `RPCServer` over HTTP. Mount it on any server that speaks
 * the Fetch API (`@zudojs/http`, Node's `http` via an adapter, Bun, Deno,
 * edge runtimes) at one POST endpoint.
 *
 * Every reply is an RPC frame: a request that is not POST, not JSON,
 * oversized, or unparseable is answered with an `RPC_INVALID_REQUEST` or
 * `RPC_DESERIALIZATION_ERROR` frame, never an HTML page. Stack traces and
 * internal messages never leave the process — the server replaces them
 * with `INTERNAL_ERROR_MESSAGE`, and this handler does the same for
 * failures of its own (a result that cannot be serialized, a throwing
 * `auth` hook). The call runs under `request.signal`: a client that
 * disconnects cancels the procedure (its `context.signal` aborts).
 */
export function createRPCFetchHandler(
  server: RPCFrameHandler,
  options: RPCFetchHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const serializer = options.serializer ?? createRPCJsonSerializer();
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_RPC_HTTP_MAX_BODY_BYTES;

  const reply = (frame: RPCResponse, extra?: Record<string, string>): Response => {
    let text: string;
    let status = rpcHttpStatus(frame);
    try {
      text = serializer.serialize(frame);
    } catch (error) {
      options.onInternalError?.(error, frame.id);
      const fallback = createRPCErrorResponse(frame.id, {
        code: "RPC_SERIALIZATION_ERROR",
        message: INTERNAL_ERROR_MESSAGE,
      });
      text = serializer.serialize(fallback);
      status = rpcHttpStatus(fallback);
    }
    return new Response(text, {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...extra,
      },
    });
  };

  const refuse = (code: string, message: string, extra?: Record<string, string>): Response =>
    reply(createRPCErrorResponse("", { code, message }), extra);

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return refuse("RPC_INVALID_REQUEST", "RPC requests must use POST.", { allow: "POST" });
    }

    if (!JSON_TYPE.test(request.headers.get("content-type") ?? "")) {
      return refuse("RPC_INVALID_REQUEST", "RPC requests must be sent as application/json.");
    }

    const body = await readBoundedBody(request, maxBodyBytes);
    if (!body.ok) {
      return refuse(
        "RPC_INVALID_REQUEST",
        body.reason === "too-large"
          ? `RPC request body exceeds ${maxBodyBytes} bytes.`
          : "RPC request body could not be read.",
      );
    }

    let frame: unknown;
    try {
      frame = serializer.deserialize(body.text);
    } catch {
      return refuse("RPC_DESERIALIZATION_ERROR", "RPC request body is not valid JSON.");
    }

    const frameId = readFrameId(frame);

    let auth: RPCAuthContext | undefined;
    try {
      auth = await options.auth?.(request);
    } catch (error) {
      const mapped = mapRPCError(error);
      if (mapped.internal) {
        options.onInternalError?.(error, frameId);
      }
      return reply(createRPCErrorResponse(frameId, mapped.payload));
    }

    const response = await server.handle(
      frame as Parameters<RPCFrameHandler["handle"]>[0],
      auth === undefined ? { signal: request.signal } : { auth, signal: request.signal },
    );
    return reply(response);
  };
}

/**
 * Reads a frame's id for error replies built before the server has
 * validated the frame. Only a short, safe id is echoed, so the handler
 * never reflects arbitrary caller input.
 */
function readFrameId(frame: unknown): string {
  const id = (frame as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.length <= MAX_RPC_REQUEST_ID_LENGTH && /^[\w.:-]+$/.test(id) ? id : "";
}
