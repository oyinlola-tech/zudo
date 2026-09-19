/**
 * @zudojs/serialization — Buffer transformer.
 *
 * Preserves Uint8Array and Buffer instances across serialization boundaries
 * using base64 encoding.
 */

import type { TypeTransformer } from "../serializerTypes/index.js";
import { SerializationTags } from "@zudojs/constants";
import { InvalidSerializedDataError } from "@zudojs/errors";
import { toBase64, fromBase64 } from "./encoding.utils.js";

const BUFFER_TYPE = "Buffer" as const;

/** Transformer that handles Uint8Array round-trips. */
export const BufferTransformer: TypeTransformer<Uint8Array> = {
  type: BUFFER_TYPE,

  canSerialize(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
  },

  serialize(value: Uint8Array): unknown {
    return {
      [SerializationTags.TYPE]: BUFFER_TYPE,
      [SerializationTags.ENCODING]: "base64",
      [SerializationTags.VALUE]: toBase64(value),
    };
  },

  deserialize(value: unknown): Uint8Array {
    const data = value as Record<string, unknown>;
    const raw = data[SerializationTags.VALUE];
    if (typeof raw !== "string") {
      throw new InvalidSerializedDataError(
        `Invalid Buffer serialized value: expected string, got ${typeof raw}`,
      );
    }
    return fromBase64(raw);
  },
};
