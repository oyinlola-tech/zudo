/**
 * @zudojs/serialization — Error transformer.
 *
 * Preserves Error instances across serialization boundaries.
 *
 * Stack traces are omitted unless `includeStack` is set: a stack names
 * absolute file paths and internal call structure, and a serialized error
 * routinely ends up in a queue message, an RPC response, or a log sink.
 */

import type {
  TypeTransformer,
  SerializeOptions,
} from "../serializerTypes/index.js";
import { SerializationTags } from "@zudojs/constants";

const ERROR_TYPE = "Error" as const;

/**
 * Built-in Error subclasses rebuilt with their own constructor, so a
 * deserialized `TypeError` is still `instanceof TypeError`. Any other name
 * falls back to `Error` with `name` set.
 */
const BUILT_IN_ERRORS: Readonly<Record<string, (message: string) => Error>> =
  Object.freeze({
    TypeError: (message: string) => new TypeError(message),
    RangeError: (message: string) => new RangeError(message),
    SyntaxError: (message: string) => new SyntaxError(message),
    ReferenceError: (message: string) => new ReferenceError(message),
    EvalError: (message: string) => new EvalError(message),
    URIError: (message: string) => new URIError(message),
    AggregateError: (message: string) => new AggregateError([], message),
  });

/** Creates the error for a serialized name, preferring a built-in subclass. */
function createError(name: unknown, message: string): Error {
  const build =
    typeof name === "string" && Object.hasOwn(BUILT_IN_ERRORS, name)
      ? BUILT_IN_ERRORS[name]
      : undefined;
  if (build !== undefined) return build(message);
  const error = new Error(message);
  if (typeof name === "string" && name !== "Error") {
    error.name = name;
  }
  return error;
}

/** Transformer that handles Error round-trips. */
export const ErrorTransformer: TypeTransformer<Error> = {
  type: ERROR_TYPE,

  canSerialize(value: unknown): value is Error {
    return value instanceof Error;
  },

  serialize(value: Error, options?: SerializeOptions): unknown {
    const result: Record<string, unknown> = {
      [SerializationTags.TYPE]: ERROR_TYPE,
      name: value.name,
      message: value.message,
    };

    if (options?.includeStack === true && value.stack !== undefined) {
      result.stack = value.stack;
    }

    const code = (value as unknown as Record<string, unknown>).code;
    if (typeof code === "string") {
      result.code = code;
    }

    return result;
  },

  deserialize(value: unknown): Error {
    const data = value as Record<string, unknown>;
    const message = typeof data.message === "string" ? data.message : "";
    const error = createError(data.name, message);

    // The reader's own frames point at this deserializer, not at where the
    // error was thrown, so the rebuilt stack is the header line only.
    error.stack = message === "" ? error.name : `${error.name}: ${message}`;

    // A stack from the wire is attacker-controlled text. Restoring it over the
    // real one would make the reconstructed error lie about where it came
    // from, so it is carried as a separate, clearly-named field instead.
    const stack = data.stack;
    if (typeof stack === "string") {
      Object.defineProperty(error, "originalStack", {
        value: stack,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }

    const code = data.code;
    if (typeof code === "string") {
      (error as unknown as Record<string, unknown>).code = code;
    }

    return error;
  },
};
