/**
 * @zudojs/container/containerResolution/containerResolution.autoRegister
 *
 * Guards against building a class with no arguments when its constructor
 * declares some: an unregistered class under `autoRegisterClasses`, and a
 * class registration with no `inject` list.
 */

import {
  ProviderResolutionError,
  RegistrationNotFoundError,
} from "@zudojs/errors";

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

/**
 * Throws when a class registration has no `inject` list but its constructor
 * declares parameters. Without one the class is built with no arguments,
 * so every dependency would be `undefined`. Registering it is allowed;
 * resolving it is what fails.
 *
 * Parameters with a default value do not count (`Function.length` stops at
 * the first one).
 *
 * @throws {ProviderResolutionError} naming the class and the `inject` fix.
 */
export function assertClassInjectable(
  token: string,
  ctor: { readonly length: number; readonly name: string },
  inject: readonly unknown[],
): void {
  const count = ctor.length;

  if (inject.length > 0 || count === 0) return;

  const name = ctor.name || "anonymous class";

  throw new ProviderResolutionError(
    token,
    `Cannot build class "${name}" for token "${token}": its constructor ` +
      `declares ${count} parameter${count === 1 ? "" : "s"} and the ` +
      `registration has no inject list, so it would be built with undefined ` +
      `dependencies. Register it with container.registerClass(${token}, ` +
      `${name}, { inject: [/* one token per parameter */] }).`,
  );
}
