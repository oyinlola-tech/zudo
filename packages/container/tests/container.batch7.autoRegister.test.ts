/**
 * Batch-7 (second report): auto-registration must not build a class whose
 * constructor needs arguments with none.
 */

import { describe, it, expect } from "vitest";

import { RegistrationNotFoundError } from "@zudojs/errors";

import { createContainer } from "../src/index.js";

class Dep {
  readonly name = "dep";
}

class NeedsDep {
  constructor(readonly dep: Dep) {}
}

class NoArgs {
  readonly ok = true;
}

class Defaulted {
  constructor(readonly value: number = 7) {}
}

describe("BATCH7-CONTAINER-6: auto-registration refuses classes with parameters", () => {
  it("throws a clear error instead of constructing with undefined", () => {
    const container = createContainer();

    let caught: unknown;
    try {
      container.resolve(NeedsDep);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RegistrationNotFoundError);
    const message = (caught as Error).message;
    expect(message).toContain("NeedsDep");
    expect(message).toMatch(/1 parameter/);
    expect(message).toContain("registerClass");
  });

  it("reports it through canResolve and resolveOptional", () => {
    const container = createContainer();

    expect(container.canResolve(NeedsDep)).toBe(false);
    expect(container.resolveOptional(NeedsDep)).toBeUndefined();
  });

  it("still auto-registers zero-argument and defaulted constructors", () => {
    const container = createContainer();

    expect(container.resolve(NoArgs).ok).toBe(true);
    expect(container.resolve(Defaulted).value).toBe(7);
    expect(container.canResolve(NoArgs)).toBe(true);
  });

  it("resolves the class once it is registered with an inject list", () => {
    const container = createContainer();

    container.registerClass(NeedsDep, NeedsDep, { inject: [Dep] });

    expect(container.resolve(NeedsDep).dep.name).toBe("dep");
  });
});
