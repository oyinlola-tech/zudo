/**
 * @zudojs/serialization — Set transformer.
 *
 * Preserves Set instances across serialization boundaries
 * using an array representation.
 */

import type { TypeTransformer } from "../serializerTypes/index.js";
import { SerializationTags } from "@zudojs/constants";
import { InvalidSerializedDataError } from "@zudojs/errors";

const SET_TYPE = "Set" as const;

/** Transformer that handles Set round-trips. */
export const SetTransformer: TypeTransformer<Set<unknown>> = {
  type: SET_TYPE,

  canSerialize(value: unknown): value is Set<unknown> {
    return value instanceof Set;
  },

  serialize(value: Set<unknown>): unknown {
    return {
      [SerializationTags.TYPE]: SET_TYPE,
      [SerializationTags.VALUE]: [...value],
    };
  },

  deserialize(value: unknown): Set<unknown> {
    const data = value as Record<string, unknown>;
    const raw = data[SerializationTags.VALUE];
    if (!Array.isArray(raw)) {
      throw new InvalidSerializedDataError(
        `Invalid Set serialized value: expected array, got ${typeof raw}`,
      );
    }
    return new Set(raw);
  },
};
