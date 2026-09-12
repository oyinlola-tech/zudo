/**
 * Event payload primitives for Zudojs.
 *
 * Payloads contain the application data carried by an event.
 * This module provides type-safe payload contracts and helpers
 * without coupling payloads to the event bus.
 */

/**
 * A generic event payload.
 */
export type EventPayload = unknown;

/**
 * A structured event payload.
 */
export type ObjectEventPayload = Readonly<Record<string, unknown>>;

/**
 * Primitive values that can safely be used as payload data.
 */
export type PrimitiveEventPayload =
  string | number | boolean | bigint | symbol | null | undefined;

/**
 * JSON-compatible event payload value.
 */
export type JsonEventPayload =
  | string
  | number
  | boolean
  | null
  | JsonEventPayload[]
  | {
      readonly [key: string]: JsonEventPayload;
    };

/**
 * Payload type map used by strongly typed event systems.
 */
export type EventPayloadMap = Record<string, unknown>;

/**
 * Extracts the payload associated with an event type.
 */
export type PayloadOf<
  TMap extends EventPayloadMap,
  TType extends keyof TMap,
> = TMap[TType];

/**
 * Creates a payload map from event definitions.
 */
export type PayloadMap<TTypes extends string, TPayload> = {
  readonly [TType in TTypes]: TPayload;
};

/**
 * Event payload factory.
 */
export type EventPayloadFactory<TPayload = EventPayload, TInput = TPayload> = (
  input: TInput,
) => TPayload;

/**
 * Options used when creating a payload.
 */
export interface EventPayloadOptions {
  /**
   * Whether the payload should be frozen recursively.
   *
   * Defaults to false.
   */
  readonly deepFreeze?: boolean;

  /**
   * Whether undefined values should be removed from
   * object payloads.
   *
   * Defaults to false.
   */
  readonly stripUndefined?: boolean;
}

/**
 * Determines whether a value is a primitive payload.
 */
export function isPrimitiveEventPayload(
  value: unknown,
): value is PrimitiveEventPayload {
  return (
    value === null ||
    value === undefined ||
    (typeof value !== "object" && typeof value !== "function")
  );
}

/**
 * Determines whether a value is a structured object payload.
 */
export function isObjectEventPayload(
  value: unknown,
): value is ObjectEventPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Determines whether a value can be represented as a JSON
 * event payload.
 */
export function isJsonEventPayload(value: unknown): value is JsonEventPayload {
  return isJsonValue(value, new WeakSet<object>(), 0);
}

/**
 * Maximum nesting depth accepted by isJsonEventPayload.
 */
const MAX_JSON_PAYLOAD_DEPTH = 256;

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(
  value: unknown,
  visited: WeakSet<object>,
  depth: number,
): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "object") {
    return false;
  }

  if (depth > MAX_JSON_PAYLOAD_DEPTH) {
    return false;
  }

  if (visited.has(value)) {
    // A cycle can never be serialized to JSON.
    return false;
  }

  visited.add(value);

  try {
    if (Array.isArray(value)) {
      return value.every((item) => isJsonValue(item, visited, depth + 1));
    }

    if (!isPlainObject(value)) {
      // Date, Map, Set, class instances, typed arrays, ... are not
      // JSON values even though JSON.stringify may accept them.
      return false;
    }

    return Object.values(value as Record<string, unknown>).every((item) =>
      isJsonValue(item, visited, depth + 1),
    );
  } finally {
    visited.delete(value);
  }
}

/**
 * Creates a payload object from an input object.
 */
export function createEventPayload<TPayload extends EventPayload>(
  payload: TPayload,
  options: EventPayloadOptions = {},
): TPayload {
  let result = payload;

  if (options.stripUndefined && isObjectEventPayload(result)) {
    result = stripUndefinedValues(result) as TPayload;
  }

  if (options.deepFreeze) {
    result = deepFreeze(result);
  }

  return result;
}

/**
 * Creates a structured object payload.
 */
export function createObjectEventPayload<
  const TPayload extends ObjectEventPayload,
>(payload: TPayload, options: EventPayloadOptions = {}): TPayload {
  return createEventPayload(payload, options);
}

/**
 * Creates a JSON-compatible event payload.
 */
export function createJsonEventPayload<const TPayload extends JsonEventPayload>(
  payload: TPayload,
  options: EventPayloadOptions = {},
): TPayload {
  if (!isJsonEventPayload(payload)) {
    throw new TypeError(
      "Event payload must contain only JSON-compatible values.",
    );
  }

  return createEventPayload(payload, options);
}

/**
 * Clones a payload using structuredClone when available.
 *
 * Falls back to returning the original payload when cloning
 * is not possible.
 */
export function cloneEventPayload<TPayload extends EventPayload>(
  payload: TPayload,
): TPayload {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(payload);
    } catch {
      // Fall through to the original payload.
    }
  }

  return payload;
}

/**
 * Deeply freezes an event payload.
 *
 * Cyclic and shared references are handled (each object is
 * visited once), and an already frozen parent is still traversed
 * so that unfrozen children are frozen too. ArrayBuffer views are
 * left untouched because they cannot be frozen.
 */
export function deepFreeze<T>(value: T): T {
  freezeRecursively(value, new WeakSet<object>());

  return value;
}

function freezeRecursively(value: unknown, visited: WeakSet<object>): void {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  ) {
    return;
  }

  if (visited.has(value)) {
    return;
  }

  visited.add(value);

  if (ArrayBuffer.isView(value)) {
    return;
  }

  const object = value as Record<PropertyKey, unknown>;

  for (const key of Reflect.ownKeys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);

    if (descriptor && "value" in descriptor) {
      freezeRecursively(descriptor.value, visited);
    }
  }

  Object.freeze(value);
}

/**
 * Removes undefined properties from an object payload.
 */
export function stripUndefinedValues<T extends ObjectEventPayload>(
  payload: T,
): T {
  /**
   * Object.fromEntries defines every entry as an own data
   * property, so a key such as "__proto__" (e.g. from JSON.parse)
   * is copied as data instead of replacing the result's prototype.
   */
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Merges two object payloads.
 *
 * Values from the second payload override values from the
 * first payload.
 */
export function mergeEventPayloads<
  TFirst extends ObjectEventPayload,
  TSecond extends ObjectEventPayload,
>(first: TFirst, second: TSecond): TFirst & TSecond {
  return {
    ...first,
    ...second,
  } as TFirst & TSecond;
}

/**
 * Creates a payload factory that always returns the supplied
 * static payload.
 */
export function staticPayload<TPayload>(
  payload: TPayload,
): EventPayloadFactory<TPayload, void> {
  return () => payload;
}

/**
 * Creates a payload factory from a transformation function.
 */
export function definePayloadFactory<TInput, TPayload>(
  factory: EventPayloadFactory<TPayload, TInput>,
): EventPayloadFactory<TPayload, TInput> {
  return factory;
}

/**
 * Validates a payload using a custom predicate.
 */
export function validateEventPayload<TPayload>(
  payload: unknown,
  validator: (payload: unknown) => payload is TPayload,
): TPayload {
  if (!validator(payload)) {
    throw new TypeError("Event payload validation failed.");
  }

  return payload;
}

/**
 * Returns a human-readable payload type.
 */
export function describeEventPayload(payload: unknown): string {
  if (payload === null) {
    return "null";
  }

  if (Array.isArray(payload)) {
    return "array";
  }

  return typeof payload;
}
