/**
 * @zudojs/serialization — BigInt transformer.
 *
 * Preserves BigInt values across serialization boundaries
 * using string representation.
 */

import type { TypeTransformer } from "../serializerTypes/index.js";
import { SerializationTags } from "@zudojs/constants";
import { InvalidSerializedDataError, SerializeError } from "@zudojs/errors";

const BIGINT_TYPE = "BigInt" as const;

/**
 * Most decimal digits a BigInt may carry across the wire. `BigInt(raw)` is
 * super-linear in the digit count, so one 10 MB `{"$type":"BigInt"}` payload
 * used to stall a consumer for seconds. Matches `@zudojs/schema`'s coercion
 * cap.
 */
const MAX_BIGINT_DIGITS = 4096;

/** Plain decimal integer, bounded, as `bigint.toString()` writes it. */
const BIGINT_PATTERN = new RegExp(`^-?\\d{1,${MAX_BIGINT_DIGITS}}$`);

/** Transformer that handles BigInt round-trips. */
export const BigIntTransformer: TypeTransformer<bigint> = {
  type: BIGINT_TYPE,

  canSerialize(value: unknown): value is bigint {
    return typeof value === "bigint";
  },

  serialize(value: bigint): unknown {
    const text = value.toString();
    if (!BIGINT_PATTERN.test(text)) {
      throw new SerializeError(
        `BigInt exceeds ${MAX_BIGINT_DIGITS} digits and could not be read back.`,
      );
    }
    return {
      [SerializationTags.TYPE]: BIGINT_TYPE,
      [SerializationTags.VALUE]: text,
    };
  },

  deserialize(value: unknown): bigint {
    const data = value as Record<string, unknown>;
    const raw = data[SerializationTags.VALUE];
    if (typeof raw !== "string") {
      throw new InvalidSerializedDataError(
        `Invalid BigInt serialized value: expected string, got ${typeof raw}`,
      );
    }
    // Checked before `BigInt()` runs, so an oversized value costs a regex
    // scan bounded by the digit limit rather than a multi-second parse.
    if (!BIGINT_PATTERN.test(raw)) {
      throw new InvalidSerializedDataError(
        `Invalid BigInt serialized value: expected at most ${MAX_BIGINT_DIGITS} decimal digits`,
      );
    }
    return BigInt(raw);
  },
};
