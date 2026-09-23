import type { RPCRequest } from "../../types/rpcRequest.type.js";

import type { RPCResponse } from "../../types/rpcResponse.type.js";

import type { RPCAuthContext, RPCContextOptions } from "../../context/rpcContext.type.js";

import type { RPCTransport } from "../rpcTransport.type.js";

import type { RPCFrameSerializer } from "../codec/rpcCodec.helper.js";

import { createRPCJsonSerializer } from "../codec/rpcCodec.helper.js";

import { createRPCErrorResponse } from "../../types/rpcResponse.type.js";

import {
  RPCSerializationError,
  RPCUnavailableError,
} from "../../errors/rpc.errors.js";

import { INTERNAL_ERROR_MESSAGE } from "../../constants/rpcConstants.core.js";

import { raceAbort } from "../../reliability/cancellation/rpcAbort.helper.js";

/**
 * The part of an `RPCServer` a transport delivers frames to.
 */
export interface RPCFrameHandler {
  handle(request: RPCRequest, trusted?: RPCContextOptions): Promise<RPCResponse>;
}

/**
 * Options for {@link createRPCMemoryTransport}.
 */
export interface RPCMemoryTransportOptions {
  /**
   * Trusted identity handed to the server as `context.auth` — a fixed
   * value, or a function of the request. This is what an HTTP transport
   * would derive from a verified credential; in memory the caller's own
   * code supplies it.
   */
  readonly auth?:
    | RPCAuthContext
    | ((request: RPCRequest) => RPCAuthContext | undefined | Promise<RPCAuthContext | undefined>);
  /**
   * How frames cross the boundary. By default each request and response is
   * round-tripped through a JSON serializer, so the server can never see or
   * mutate the caller's objects and a payload that could not travel over a
   * network fails here too. Pass another serializer to match a remote
   * transport, or `false` to pass frames by reference.
   */
  readonly serializer?: RPCFrameSerializer | false;
}

/**
 * Creates a transport that delivers frames to a server in the same
 * process — for tests, and for modular monoliths that may later split a
 * module into its own service without touching callers.
 *
 * Honours `options.signal`: an aborted call stops waiting at once and the
 * server's dispatch is cancelled with it. After `close()` every send fails
 * with `RPCUnavailableError`.
 */
export function createRPCMemoryTransport(
  server: RPCFrameHandler,
  options: RPCMemoryTransportOptions = {},
): RPCTransport {
  const serializer =
    options.serializer === false
      ? undefined
      : (options.serializer ?? createRPCJsonSerializer());
  let closed = false;

  const resolveAuth = async (
    request: RPCRequest,
  ): Promise<RPCAuthContext | undefined> =>
    typeof options.auth === "function" ? options.auth(request) : options.auth;

  return {
    async send(request, sendOptions = {}): Promise<RPCResponse> {
      if (closed) {
        throw new RPCUnavailableError(
          "RPC memory transport has been closed.",
          request.procedure,
        );
      }

      const frame = copy(serializer, request, request.procedure);

      const exchange = async (): Promise<RPCResponse> => {
        const auth = await resolveAuth(request);
        const signal = sendOptions.signal;
        const response = await server.handle(frame, {
          ...(auth === undefined ? {} : { auth }),
          ...(signal === undefined ? {} : { signal }),
        });
        return copyResponse(serializer, response);
      };

      return raceAbort(exchange(), sendOptions.signal, request.procedure);
    },

    async close(): Promise<void> {
      closed = true;
    },
  };
}

function copy<T>(
  serializer: RPCFrameSerializer | undefined,
  value: T,
  procedure: string,
): T {
  if (serializer === undefined) {
    return value;
  }
  try {
    return serializer.deserialize<T>(serializer.serialize(value));
  } catch {
    throw new RPCSerializationError(
      "RPC request could not be serialized.",
      procedure,
    );
  }
}

/**
 * A response the server produced but that cannot cross the boundary (a
 * `BigInt` result under plain JSON, a cycle) is answered the way a
 * network transport would: a generic internal error frame.
 */
function copyResponse(
  serializer: RPCFrameSerializer | undefined,
  response: RPCResponse,
): RPCResponse {
  if (serializer === undefined) {
    return response;
  }
  try {
    return serializer.deserialize<RPCResponse>(serializer.serialize(response));
  } catch {
    return createRPCErrorResponse(response.id, {
      code: "RPC_SERIALIZATION_ERROR",
      message: INTERNAL_ERROR_MESSAGE,
    });
  }
}
