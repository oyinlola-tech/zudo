/**
 * @zudojs/serialization — Serialize-side walker (`preserveTypes: true`).
 *
 * Replaces values that have a registered transformer with their tagged form,
 * and escapes plain objects that would otherwise read back as a tag.
 */

import { SerializationDepthError } from "@zudojs/errors";
import { isPlainObject } from "@zudojs/types";
import type { SerializeOptions } from "../serializerTypes/index.js";
import type { TransformerRegistry } from "../serializerTransforms/index.js";
import { escapeObject, needsEscape } from "./jsonSerializer.escape.js";
import { defineKey } from "./jsonSerializer.keys.js";

/** What the walker needs besides the value. */
export interface TransformWalk {
  readonly transformers: TransformerRegistry;
  readonly maxDepth: number;
  readonly options: SerializeOptions;
}

/** Converts a value into its JSON-safe, tagged representation. */
export function transformValue(
  walk: TransformWalk,
  value: unknown,
  depth: number,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") {
    const transformer = walk.transformers.findForValue(value);
    return transformer
      ? transformer.serialize(value, walk.options)
      : value.toString();
  }
  if (typeof value !== "object") return value;
  if (depth >= walk.maxDepth) {
    // Depth is pre-checked by assertDepthWithinLimit, so this is a belt-and
    // braces guard. Returning the raw value would silently emit an untagged
    // Map or Date, which cannot round-trip — fail loudly instead.
    throw new SerializationDepthError(depth + 1, walk.maxDepth);
  }

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      out.push(transformValue(walk, value[i] as unknown, depth + 1));
    }
    return out;
  }

  const transformer = walk.transformers.findForValue(value);
  if (transformer) {
    const raw = transformer.serialize(value, walk.options);
    // The transformer's own tag object is not user data: its children are
    // walked, but it is never escaped.
    return isPlainObject(raw)
      ? transformEntries(walk, raw, depth + 1)
      : transformValue(walk, raw, depth + 1);
  }

  if (isPlainObject(value)) {
    const body = transformEntries(walk, value, depth);
    return needsEscape(value) ? escapeObject(body) : body;
  }

  return value;
}

/** Transforms each own enumerable key of a plain object. */
function transformEntries(
  walk: TransformWalk,
  value: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    defineKey(
      result,
      key,
      transformValue(walk, value[key], depth + 1),
      walk.options.allowUnsafeKeys === true,
    );
  }
  return result;
}
