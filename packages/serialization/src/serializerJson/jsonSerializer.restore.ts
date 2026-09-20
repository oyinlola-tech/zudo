/**
 * @zudojs/serialization — Deserialize-side walker (`preserveTypes: true`).
 *
 * Revives tagged values through their transformers and unwraps escaped
 * plain objects (see `jsonSerializer.escape.ts`).
 */

import {
  InvalidSerializedDataError,
  SerializationDepthError,
  TransformerError,
  isSerializationError,
} from "@zudojs/errors";
import { SerializationLimits, SerializationTags } from "@zudojs/constants";
import { isPlainObject } from "@zudojs/types";
import type { DeserializeOptions } from "../serializerTypes/index.js";
import type { TransformerRegistry } from "../serializerTransforms/index.js";
import { escapedBody } from "./jsonSerializer.escape.js";
import { defineKey } from "./jsonSerializer.keys.js";

/** What the walker needs besides the value. */
export interface RestoreWalk {
  readonly transformers: TransformerRegistry;
  readonly maxDepth: number;
  readonly options: DeserializeOptions;
}

/** Longest prefix of a rejected tag quoted back in an error message. */
const TAG_EXCERPT_LENGTH = 64;

/** Clips a wire-supplied tag so it cannot flood an error message or a log line. */
function describeTag(tag: string): string {
  return tag.length <= TAG_EXCERPT_LENGTH
    ? tag
    : `${tag.slice(0, TAG_EXCERPT_LENGTH)}…`;
}

/** Rebuilds runtime values from their tagged JSON representation. */
export function restoreValue(
  walk: RestoreWalk,
  value: unknown,
  depth: number,
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= walk.maxDepth) {
    throw new SerializationDepthError(depth + 1, walk.maxDepth);
  }
  if (Array.isArray(value)) {
    return value.map((item) => restoreValue(walk, item, depth + 1));
  }

  const obj = value as Record<string, unknown>;
  const strict = walk.options.strict === true;

  const body = escapedBody(obj);
  if (body) return restoreEntries(walk, body, depth);
  if (body === null && strict) {
    throw new InvalidSerializedDataError(
      'Escaped object tag "Object" must carry a plain-object $value.',
      { format: "json" },
    );
  }

  const tag = obj[SerializationTags.TYPE];
  if (body === undefined && typeof tag === "string") {
    // The tag arrives from the wire, so bound it before it is looked up or
    // quoted into a message: `SerializationLimits.MAX_TYPE_TAG_LENGTH` was
    // exported and tested but never enforced, which let a 100 000-character
    // tag be interpolated verbatim into an error and from there into a log.
    if (tag.length > SerializationLimits.MAX_TYPE_TAG_LENGTH) {
      throw new InvalidSerializedDataError(
        `Serialization type tag exceeds ${SerializationLimits.MAX_TYPE_TAG_LENGTH} characters ` +
          `(got ${tag.length}): "${describeTag(tag)}".`,
        { format: "json" },
      );
    }
    if (walk.transformers.has(tag)) return revive(walk, tag, obj, depth);
    // An unknown tag is ordinary data unless the caller asked for strictness.
    if (strict) {
      throw new InvalidSerializedDataError(
        `Unknown serialization type tag: "${describeTag(tag)}". ` +
          "Register a transformer for it, or deserialize without strict mode.",
        { format: "json" },
      );
    }
  }

  return isPlainObject(obj) ? restoreEntries(walk, obj, depth) : obj;
}

/**
 * Hands a tag to its transformer after restoring the tag's children.
 *
 * A tag the transformer rejects (say an unparseable Date) used to make the
 * whole record permanently unreadable. Outside strict mode it now reads back
 * as the plain object it is; strict mode throws a typed `TransformerError`.
 */
function revive(
  walk: RestoreWalk,
  tag: string,
  obj: Record<string, unknown>,
  depth: number,
): unknown {
  const shell = restoreEntries(walk, obj, depth, SerializationTags.TYPE);
  try {
    return walk.transformers.get(tag).deserialize(shell, walk.options);
  } catch (error) {
    if (walk.options.strict !== true) return shell;
    if (isSerializationError(error)) throw error;
    throw new TransformerError(tag, (error as Error).message, { cause: error });
  }
}

/** Restores each own key of a plain object into a fresh object. */
function restoreEntries(
  walk: RestoreWalk,
  obj: Record<string, unknown>,
  depth: number,
  verbatimKey?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    defineKey(
      result,
      key,
      key === verbatimKey ? obj[key] : restoreValue(walk, obj[key], depth + 1),
      walk.options.allowUnsafeKeys === true,
    );
  }
  return result;
}
