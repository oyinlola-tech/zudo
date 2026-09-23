/**
 * An explicit class registration with no `inject` list must not build a
 * class whose constructor needs arguments. 1.2.0 fixed this for
 * auto-registration only: `registerClass(TOKEN, Service)` still called
 * `new Service()` and handed it `undefined` for every dependency.
 *
 * Registering stays allowed; resolving is what fails.
 */

import { describe, expect, it } from "vitest";

import { ProviderResolutionError } from "@zudojs/errors";

import {
  classProvider,
  createContainer,
  createToken,
  provideClass,
} from "../src/index.js";

class Db {
  readonly kind = "db";
}

class Service {
  constructor(
    readonly db: Db,
    readonly name: string,
  ) {}
}

class NoArgs {
  readonly ok = true;
}

class Defaulted {
  constructor(readonly retries: number = 3) {}
}

const SERVICE = createToken<Service>("Service");

function resolveError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected resolution to throw");
}

describe("class registrations without an inject list", () => {
  it("registers, then refuses to build a constructor that needs arguments", () => {
    const container = createContainer();

    expect(() => container.registerClass(SERVICE, Service)).not.toThrow();

    const error = resolveError(() => container.resolve(SERVICE));

    expect(error).toBeInstanceOf(ProviderResolutionError);
    expect(error.message).toContain('"Service"');
    expect(error.message).toContain("2 parameters");
    expect(error.message).toContain("inject: [");
  });

  it("applies to the provider-object, classProvider and provideClass forms", () => {
    const container = createContainer();
    const viaObject = createToken<Service>("ViaObject");
    const viaHelper = createToken<Service>("ViaHelper");
    const viaProvide = createToken<Service>("ViaProvide");

    container.register(viaObject, { useClass: Service });
    container.register(viaHelper, classProvider(Service));
    container.register(viaProvide, provideClass(viaProvide, Service));

    for (const token of [viaObject, viaHelper, viaProvide]) {
      expect(resolveError(() => container.resolve(token))).toBeInstanceOf(
        ProviderResolutionError,
      );
    }
  });

  it("fails a dependent's resolution with the same error, not undefined fields", () => {
    const container = createContainer();
    const CONSUMER = createToken<{ service: Service }>("Consumer");

    container.registerClass(SERVICE, Service);
    container.registerFactory(CONSUMER, (service) => ({ service }), [SERVICE]);

    const error = resolveError(() => container.resolve(CONSUMER));

    expect(error).toBeInstanceOf(ProviderResolutionError);
    expect(error.message).toContain('"Service"');
  });

  it("still builds zero-argument and defaulted constructors, and injected ones", () => {
    const container = createContainer();
    const NAME = createToken<string>("Name");

    container.registerClass(NoArgs, NoArgs);
    container.registerClass(Defaulted, Defaulted);
    container.registerClass(Db, Db);
    container.registerValue(NAME, "api");
    container.registerClass(SERVICE, Service, { inject: [Db, NAME] });

    expect(container.resolve(NoArgs).ok).toBe(true);
    expect(container.resolve(Defaulted).retries).toBe(3);
    expect(container.resolve(SERVICE).db.kind).toBe("db");
    expect(container.resolve(SERVICE).name).toBe("api");
  });
});
