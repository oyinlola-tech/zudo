/**
 * Round-11 audit regression tests for @zudojs/container.
 *
 * One describe block per finding id.
 */

import { describe, it, expect } from "vitest";

import {
  ContainerError,
  ContainerLifecycleError,
} from "@zudojs/errors";

import {
  createContainer,
  createToken,
  ContainerScope,
} from "../src/index.js";

interface Service {
  readonly tag: string;
}

describe("CORE-02", () => {
  it("drops and disposes a scope's SCOPED instance when the registry is restored", () => {
    const container = createContainer();
    const SERVICE = createToken<Service>("service");
    const disposed: string[] = [];

    const provider = (tag: string) => ({
      useFactory: () => ({
        tag,
        dispose: () => {
          disposed.push(tag);
        },
      }),
    });

    container.register(SERVICE, provider("v1"), {
      scope: ContainerScope.SCOPED,
    });
    const snapshot = container.snapshot();

    container.replace(SERVICE, provider("v2"), {
      scope: ContainerScope.SCOPED,
    });

    const scope = container.createScope();
    expect(scope.resolve(SERVICE).tag).toBe("v2");

    container.restoreSnapshot(snapshot);

    expect(scope.resolve(SERVICE).tag).toBe("v1");
    expect(disposed).toContain("v2");
  });

  it("drops and disposes a scope's SCOPED instance when registrations are cleared", () => {
    const container = createContainer();
    const SERVICE = createToken<Service>("service");
    const disposed: string[] = [];

    container.register(
      SERVICE,
      {
        useFactory: () => ({
          tag: "v1",
          dispose: () => {
            disposed.push("v1");
          },
        }),
      },
      { scope: ContainerScope.SCOPED },
    );

    const scope = container.createScope();
    expect(scope.resolve(SERVICE).tag).toBe("v1");

    container.clearRegistrations();

    expect(disposed).toContain("v1");

    container.register(
      SERVICE,
      { useFactory: () => ({ tag: "v2" }) },
      { scope: ContainerScope.SCOPED },
    );

    expect(scope.resolve(SERVICE).tag).toBe("v2");
  });

  it("invalidates a SCOPED consumer of a cleared dependency", () => {
    const container = createContainer();
    const DEP = createToken<Service>("dep");
    const CONSUMER = createToken<{ readonly dep: Service }>("consumer");
    let depTag = "v1";

    container.register(DEP, { useFactory: () => ({ tag: depTag }) }, {
      scope: ContainerScope.SCOPED,
    });
    container.register(
      CONSUMER,
      { useFactory: (dep: unknown) => ({ dep: dep as Service }), inject: [DEP] },
      { scope: ContainerScope.SCOPED },
    );

    const snapshot = container.snapshot();
    const scope = container.createScope();
    expect(scope.resolve(CONSUMER).dep.tag).toBe("v1");

    depTag = "v2";
    container.restoreSnapshot(snapshot);

    expect(scope.resolve(CONSUMER).dep.tag).toBe("v2");
  });
});

describe("CORE-05", () => {
  it("throws typed container errors for disposed containers and scopes", async () => {
    const container = createContainer();
    const scope = container.createScope();

    await scope.dispose();
    expect(() => scope.resolve(createToken("x"))).toThrow(ContainerError);

    const parentContainer = createContainer();
    const parent = parentContainer.createScope();
    const child = parent.createScope();
    await parent.dispose();
    expect(() => child.resolve(createToken("x"))).toThrow(ContainerError);

    const disposedContainer = createContainer();
    const orphan = disposedContainer.createScope();
    await disposedContainer.dispose();
    expect(() => orphan.resolve(createToken("x"))).toThrow(ContainerError);
    expect(() => disposedContainer.resolve(createToken("x"))).toThrow(
      ContainerLifecycleError,
    );
  });

  it("throws a typed container error when registrations are frozen", () => {
    const container = createContainer({ freezeRegistrations: true });
    container.start();
    expect(() => container.registerValue(createToken("a"), 1)).toThrow(
      ContainerError,
    );
  });

  it("throws a typed container error when scopes are disabled", () => {
    const container = createContainer({ allowScopes: false });
    expect(() => container.createScope()).toThrow(ContainerError);
  });

  it("wraps an unregistered useExisting target in a typed container error", () => {
    const container = createContainer();
    const ALIAS = createToken<Service>("alias");
    const MISSING = createToken<Service>("missing");

    container.registerExisting(ALIAS, MISSING);

    expect(() => container.resolve(ALIAS)).toThrow(ContainerError);
  });
});
