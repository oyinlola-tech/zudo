/**
 * @zudojs/testing — Identity checks that run before the structural walk.
 *
 * The structural walk compares own enumerable keys. That alone treats every
 * Error as `{}` (`message`, `name` and `stack` are not enumerable), a class
 * instance as a plain object, `new Number(1)` as `new Number(2)`, and a
 * `Uint8Array` as any typed array with the same bytes. These checks reject
 * those pairs first, so an assertion built on `deepEqual` can fail when the
 * value lost its type or its payload.
 *
 * @module assertions/deepEqual.identity
 */

import { describeValue } from "./deepEqual.describe.js";

/** A mismatch reason, or undefined when the pair passes this check. */
export type IdentityMismatch = string | undefined;

/** Whether a prototype marks a plain record (`{}` or `Object.create(null)`). */
function isPlainPrototype(proto: object | null): boolean {
  return proto === null || proto === Object.prototype;
}

/** A readable name for the prototype of a value. */
function prototypeName(value: object): string {
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto === null) return "null-prototype object";
  const ctor = (proto as { constructor?: { name?: string } }).constructor;
  return ctor?.name ? ctor.name : "anonymous prototype";
}

/**
 * Boxed primitives (`new Number(1)`, `Object(1n)`) carry their value in an
 * internal slot, not in an own key. Returns the unboxed value, or a sentinel
 * when `value` is not boxed.
 */
function unbox(value: object): {
  readonly boxed: boolean;
  readonly value?: unknown;
} {
  const tag = Object.prototype.toString.call(value);
  switch (tag) {
    case "[object Number]":
    case "[object String]":
    case "[object Boolean]":
    case "[object BigInt]":
    case "[object Symbol]":
      return {
        boxed: true,
        value: (value as { valueOf(): unknown }).valueOf(),
      };
    default:
      return { boxed: false };
  }
}

/** Values whose contents cannot be observed, so only identity can make them equal. */
function isOpaque(value: object): boolean {
  return (
    value instanceof Promise ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    (typeof WeakRef !== "undefined" && value instanceof WeakRef)
  );
}

/**
 * Compares the parts of two objects that are invisible to a key walk:
 * prototype, boxed value, Error name/message/cause, typed-array constructor,
 * and the unobservable contents of Promises and weak collections.
 *
 * @param actual - The observed object.
 * @param expected - The object it should equal.
 * @returns A mismatch reason, or undefined when the pair may be walked.
 */
export function compareIdentity(
  actual: object,
  expected: object,
): IdentityMismatch {
  const actualProto = Object.getPrototypeOf(actual) as object | null;
  const expectedProto = Object.getPrototypeOf(expected) as object | null;
  const bothPlain =
    isPlainPrototype(actualProto) && isPlainPrototype(expectedProto);
  if (!bothPlain && actualProto !== expectedProto) {
    return `expected instance of ${prototypeName(expected)}, received ${prototypeName(actual)}`;
  }

  if (isOpaque(expected)) {
    return `expected the same ${prototypeName(expected)} instance, received a different one`;
  }

  const actualBox = unbox(actual);
  const expectedBox = unbox(expected);
  if (actualBox.boxed || expectedBox.boxed) {
    if (!Object.is(actualBox.value, expectedBox.value)) {
      return `expected boxed ${describeValue(expectedBox.value)}, received boxed ${describeValue(actualBox.value)}`;
    }
  }

  if (actual instanceof Error && expected instanceof Error) {
    if (actual.name !== expected.name) {
      return `expected error name ${describeValue(expected.name)}, received ${describeValue(actual.name)}`;
    }
    if (actual.message !== expected.message) {
      return `expected error message ${describeValue(expected.message)}, received ${describeValue(actual.message)}`;
    }
  }

  return undefined;
}

/**
 * The Error `cause`, when either side has one. `cause` is an own
 * non-enumerable property, so the key walk never reaches it.
 */
export function errorCauses(
  actual: object,
  expected: object,
): { readonly actual: unknown; readonly expected: unknown } | undefined {
  if (!(actual instanceof Error) || !(expected instanceof Error))
    return undefined;
  if (!("cause" in actual) && !("cause" in expected)) return undefined;
  return { actual: actual.cause, expected: expected.cause };
}
