/**
 * @zudojs/serialization — Map transformer.
 *
 * Preserves Map instances across serialization boundaries
 * using an array-of-entries representation.
 */

import type { TypeTransformer } from "../serializerTypes/index.js";
import { SerializationTags } from "@zudojs/constants";
import { InvalidSerializedDataError } from "@zudojs/errors";

const MAP_TYPE = "Map" as const;

/** Transformer that handles Map round-trips. */
export const MapTransformer: TypeTransformer<Map<unknown, unknown>> = {
  type: MAP_TYPE,

  canSerialize(value: unknown): value is Map<unknown, unknown> {
    return value instanceof Map;
  },

  serialize(value: Map<unknown, unknown>): unknown {
    const entries: Array<[unknown, unknown]> = [];
    for (const [k, v] of value) {
      entries.push([k, v]);
    }
    return {
      [SerializationTags.TYPE]: MAP_TYPE,
      [SerializationTags.VALUE]: entries,
    };
  },

  deserialize(value: unknown): Map<unknown, unknown> {
    const data = value as Record<string, unknown>;
    const raw = data[SerializationTags.VALUE];
    if (!Array.isArray(raw)) {
      throw new InvalidSerializedDataError(
        `Invalid Map serialized value: expected array, got ${typeof raw}`,
      );
    }
    return new Map(raw as Array<[unknown, unknown]>);
  },
};
