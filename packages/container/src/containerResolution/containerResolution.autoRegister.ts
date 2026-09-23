/**
 * @zudojs/container/containerResolution/containerResolution.autoRegister
 *
 * Guards for `autoRegisterClasses`: resolving an unregistered class builds
 * it with no arguments, which is only correct for a constructor that
 * declares none.
 */

import { RegistrationNotFoundError } from "@zudojs/errors";

import { describeToken } from "../containerToken/containerToken.type.js";

/**
 * Whether an unregistered token may be auto-registered: a class whose
 * constructor declares no required parameters (`Class.length === 0`).
 *
 * Parameters with a default value do not count, so
 * `constructor(value = 7)` still qualifies.
 */
export function isAutoRegistrable(token: unknown): boolean {
  return typeof token === "function" && token.length === 0;
}

/**
 * Throws when a class cannot be auto-registered because its constructor
 * declares parameters. Auto-registration has no inject list, so building
 * it would pass `undefined` for every dependency.
 *
 * @throws {RegistrationNotFoundError} naming the class and how to
 *   register it.
 */
export function assertAutoRegistrable(token: {
  readonly length: number;
}): void {
  if (isAutoRegistrable(token)) return;

  const name = describeToken(token as never);
  const count = token.length;

  throw new RegistrationNotFoundError(
    name,
    `Cannot auto-register class "${name}": its constructor declares ` +
      `${count} parameter${count === 1 ? "" : "s"} and no inject list is ` +
      `registered, so it would be built with undefined dependencies. ` +
      `Register it with container.registerClass(${name}, ${name}, ` +
      `{ inject: [/* one token per parameter */] }) or ` +
      `container.registerFactory(${name}, (...deps) => new ${name}(...deps), [/* tokens */]).`,
  );
}
