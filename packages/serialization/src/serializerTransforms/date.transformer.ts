/**
 * @zudojs/serialization — Date transformer.
 *
 * Preserves Date instances across serialization boundaries
 * using ISO-8601 string representation.
 */

import type { TypeTransformer } from "../serializerTypes/index.js";
import { SerializationTags } from "@zudojs/constants";
import { InvalidSerializedDataError, SerializeError } from "@zudojs/errors";

const DATE_TYPE = "Date" as const;

/** Transformer that handles Date round-trips. */
export const DateTransformer: TypeTransformer<Date> = {
  type: DATE_TYPE,

  canSerialize(value: unknown): value is Date {
    return value instanceof Date;
  },

  serialize(value: Date): unknown {
    if (Number.isNaN(value.getTime())) {
      throw new SerializeError("Cannot serialize an invalid Date.");
    }
    return {
      [SerializationTags.TYPE]: DATE_TYPE,
      [SerializationTags.VALUE]: value.toISOString(),
    };
  },

  deserialize(value: unknown): Date {
    const data = value as Record<string, unknown>;
    const raw = data[SerializationTags.VALUE];
    if (typeof raw !== "string") {
      throw new InvalidSerializedDataError(
        `Invalid Date serialized value: expected string, got ${typeof raw}`,
      );
    }
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new InvalidSerializedDataError(`Invalid Date value: "${raw}"`);
    }
    return date;
  },
};
