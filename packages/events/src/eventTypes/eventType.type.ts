/**
 * Event type utilities for Zudojs.
 *
 * EventType is the string identifier used to route events.
 * This module provides validation, normalization, matching,
 * and strongly typed event-type helpers.
 */

import type { Event, EventType } from "../eventTypes/eventDefinition.type.js";

import type { EventPayloadMap } from "./eventPayload.type.js";

export type { EventPayloadMap } from "./eventPayload.type.js";

/**
 * A collection of event types.
 */
export type EventTypeList = readonly EventType[];

/**
 * Event type pattern.
 *
 * Supported forms:
 *
 * "user.created"
 * "user.*"
 * "*"
 */
export type EventTypePattern = EventType | `${string}.*` | "*";

/**
 * Extracts the event type keys from a payload map.
 */
export type EventTypeOf<TMap extends EventPayloadMap> = keyof TMap & string;

/**
 * Creates an Event union from a payload map.
 */
export type EventUnion<TMap extends EventPayloadMap> = {
  [TType in EventTypeOf<TMap>]: Event<TMap[TType]> & {
    readonly type: TType;
  };
}[EventTypeOf<TMap>];

/**
 * Validates an event type string.
 *
 * Zudojs event types use dot-separated lowercase names. Wildcards
 * are not part of an event type; they are only valid in patterns
 * (see isValidEventTypePattern).
 *
 * Examples:
 *
 * user.created
 * module.loaded
 * runtime.started
 * database.connection.failed
 */
export function isValidEventType(value: unknown): value is EventType {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return false;
  }

  if (normalized.length > 255) {
    return false;
  }

  return /^[a-z0-9_]+(?:[.-][a-z0-9_]+)*$/.test(normalized);
}

/**
 * Validates an event type pattern.
 *
 * Supported forms are an exact event type, a namespace wildcard
 * ("user.*") and the catch-all "*". Wildcards in any other
 * position ("user.*.created", "user.cre*") are rejected.
 */
export function isValidEventTypePattern(
  value: unknown,
): value is EventTypePattern {
  if (value === "*") {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  if (value.endsWith(".*")) {
    return isValidEventType(value.slice(0, -2));
  }

  return isValidEventType(value);
}

/**
 * Normalizes an event type.
 *
 * Normalization:
 *
 * 1. Trims whitespace
 * 2. Converts to lowercase
 * 3. Converts repeated separators into one separator
 * 4. Removes leading/trailing separators
 */
export function normalizeEventType(type: string): EventType {
  if (typeof type !== "string") {
    throw new TypeError(`Invalid event type: "${String(type)}".`);
  }

  const lower = type.trim().toLowerCase();

  let result = "";
  let lastWasDot = false;

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]!;
    if (ch === "/" || ch === "\\" || ch === ":" || ch === ".") {
      if (!lastWasDot) {
        result += ".";
        lastWasDot = true;
      }
    } else {
      result += ch;
      lastWasDot = false;
    }
  }

  let start = 0;
  let end = result.length;

  while (start < end && result.charCodeAt(start) === 46) start++;
  while (end > start && result.charCodeAt(end - 1) === 46) end--;

  const trimmed = result.slice(start, end);

  if (!isValidEventType(trimmed)) {
    throw new TypeError(`Invalid event type: "${type}".`);
  }

  return trimmed;
}

/**
 * Creates an event type from individual segments.
 */
export function createEventType(...segments: readonly string[]): EventType {
  if (segments.length === 0) {
    throw new TypeError("At least one event type segment is required.");
  }

  return normalizeEventType(segments.join("."));
}

/**
 * Returns the namespace portion of an event type.
 *
 * Example:
 *
 * user.created
 * ↓
 * user
 */
export function getEventNamespace(type: EventType): string {
  const index = type.indexOf(".");

  if (index === -1) {
    return type;
  }

  return type.slice(0, index);
}

/**
 * Returns the final action portion of an event type.
 *
 * Example:
 *
 * user.created
 * ↓
 * created
 */
export function getEventAction(type: EventType): string {
  const index = type.lastIndexOf(".");

  if (index === -1) {
    return type;
  }

  return type.slice(index + 1);
}

/**
 * Returns all segments in an event type.
 */
export function getEventTypeSegments(type: EventType): readonly string[] {
  return type.split(".");
}

/**
 * Normalizes an event type pattern.
 *
 * "*" is returned unchanged, "User.*" becomes "user.*" and any
 * other value is normalized as an event type.
 */
export function normalizeEventTypePattern(
  pattern: string,
): EventTypePattern {
  if (pattern === "*") {
    return "*";
  }

  if (typeof pattern === "string" && pattern.trim().endsWith(".*")) {
    return `${normalizeEventType(pattern.trim().slice(0, -2))}.*`;
  }

  return normalizeEventType(pattern);
}

/**
 * Checks whether an event type matches a pattern.
 *
 * Supported:
 *
 * "user.created" matches "user.created"
 * "user.created" matches "user.*"
 * "user"         matches "user.*" (a namespace pattern also
 *                matches the bare namespace event)
 * "user.created" matches "*"
 * "order.created" does not match "user.*"
 *
 * Both arguments are expected to be normalized (see
 * normalizeEventType / normalizeEventTypePattern); no
 * normalization happens here.
 */
export function matchesEventType(
  type: EventType,
  pattern: EventTypePattern,
): boolean {
  if (pattern === "*") {
    return true;
  }

  if (pattern === type) {
    return true;
  }

  if (pattern.endsWith(".*")) {
    const namespace = pattern.slice(0, -2);

    return type === namespace || type.startsWith(`${namespace}.`);
  }

  return false;
}

/**
 * Determines whether two event types belong to the same
 * namespace.
 */
export function isSameEventNamespace(
  first: EventType,
  second: EventType,
): boolean {
  return getEventNamespace(first) === getEventNamespace(second);
}

/**
 * Determines whether an event type is a child of another
 * namespace.
 */
export function isChildEventType(type: EventType, parent: EventType): boolean {
  return type.startsWith(`${parent}.`);
}

/**
 * Creates a wildcard pattern for an event namespace.
 *
 * Example:
 *
 * createEventTypePattern("user")
 * → "user.*"
 */
export function createEventTypePattern(namespace: string): EventTypePattern {
  const normalized = normalizeEventType(namespace);

  return `${normalized}.*`;
}

/**
 * Creates a strongly typed event type map.
 */
export function defineEventTypes<const TMap extends EventPayloadMap>(
  map: TMap,
): Readonly<TMap> {
  return Object.freeze({
    ...map,
  });
}

/**
 * Creates a type-safe event type constant.
 *
 * Example:
 *
 * const USER_CREATED =
 *   defineEventType("user.created");
 */
export function defineEventType<const TType extends EventType>(
  type: TType,
): TType {
  return normalizeEventType(type) as TType;
}

/**
 * Returns whether an event belongs to a type pattern.
 */
export function eventMatchesType<TPayload>(
  event: Event<TPayload>,
  pattern: EventTypePattern,
): boolean {
  return matchesEventType(event.type, pattern);
}

/**
 * Filters events by type pattern.
 */
export function filterEventsByType<TPayload>(
  events: readonly Event<TPayload>[],
  pattern: EventTypePattern,
): readonly Event<TPayload>[] {
  return events.filter((event) => matchesEventType(event.type, pattern));
}

/**
 * Creates a normalized event type from an arbitrary string.
 *
 * Unlike normalizeEventType(), this function returns undefined
 * instead of throwing for invalid input.
 */
export function tryNormalizeEventType(type: string): EventType | undefined {
  try {
    return normalizeEventType(type);
  } catch {
    return undefined;
  }
}

/**
 * Asserts that an event type is valid.
 */
export function assertEventType(type: unknown): asserts type is EventType {
  if (!isValidEventType(type)) {
    throw new TypeError(`Invalid event type: "${String(type)}".`);
  }
}
