/**
 * Wire encoding shared by the built-in transports: the frame serializer
 * (`@zudojs/serialization` JSON with size and depth limits), a response
 * frame shape guard, and a bounded Fetch API body reader.
 */

export type {
  RPCFrameSerializer,
  RPCJsonSerializerOptions,
} from "./rpcCodec.helper.js";

export { createRPCJsonSerializer, isRPCResponseFrame } from "./rpcCodec.helper.js";

export type { RPCBodyReadResult, RPCBodySource } from "./rpcBody.helper.js";

export { readBoundedBody } from "./rpcBody.helper.js";
