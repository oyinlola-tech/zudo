import { describe, it, expect } from "vitest";
import {
  createContextStorage,
  createExecutionContext,
  createExecutionId,
  createContextKey,
  createContextValues,
  createContextSnapshot,
  createContext,
  createContextProvider,
  defaultContextStorage,
  getDefaultContextStorage,
  DefaultContextProvider,
  ExecutionContextNotFoundError,
} from "../src/index.js";
import type {
  Context,
  CreateContextOptions,
  CreateExecutionContextInput,
  ExecutionContext,
} from "../src/index.js";

describe("createExecutionId", () => {
  it("produces UUIDs", () => {
    const id = createExecutionId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(createExecutionId()).not.toBe(id);
  });
});

describe("execution context metadata", () => {
  it("is deep-frozen", () => {
    const context = createExecutionContext({
      metadata: { nested: { list: [1, 2], deep: { flag: true } } },
    });

    expect(Object.isFrozen(context.metadata)).toBe(true);
    const nested = context.metadata.nested as Record<string, unknown>;
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(nested.list)).toBe(true);
    expect(Object.isFrozen(nested.deep)).toBe(true);

    expect(() => {
      "use strict";
      (nested.deep as Record<string, unknown>).flag = false;
    }).toThrow(TypeError);
  });
});

describe("single execution-context model", () => {
  it("exposes the deprecated Context names as aliases of the canonical ones", () => {
    /* The alias IS the canonical function, not a second implementation. */
    expect(createContext).toBe(createExecutionContext);

    const context: Context = createContext({ transport: "http" });
    const canonical: ExecutionContext = context;
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(canonical.transport).toBe("http");

    const options: CreateContextOptions = { operation: "op" };
    const canonicalOptions: CreateExecutionContextInput = options;
    expect(canonicalOptions.operation).toBe("op");
  });

  it("does not expose a mutable Context class anymore", () => {
    const context = createContext({ transport: "http" }) as unknown as Record<
      string,
      unknown
    >;
    expect(typeof context.set).toBe("undefined");
    expect(typeof context.getMetadata).toBe("undefined");
    expect(() => {
      "use strict";
      context.executionId = "changed";
    }).toThrow(TypeError);
  });

  it("shares one default storage across providers and consumers", () => {
    expect(getDefaultContextStorage()).toBe(defaultContextStorage);

    const provider = createContextProvider();
    expect(provider).toBeInstanceOf(DefaultContextProvider);

    const context = createExecutionContext({ operation: "shared" });
    defaultContextStorage.run(context, () => {
      expect(provider.get()).toBe(context);
      expect(createContextProvider(createContextStorage()).has()).toBe(false);
    });
    expect(provider.has()).toBe(false);
  });
});

describe("ContextStorage", () => {
  it("propagates the context across await boundaries", async () => {
    const storage = createContextStorage();
    const context = createExecutionContext({ operation: "test-op" });

    const result = await storage.run(context, async () => {
      expect(storage.get()?.operation).toBe("test-op");
      await new Promise((resolve) => setTimeout(resolve, 10));
      /* Still available after crossing the await boundary. */
      expect(storage.get()?.operation).toBe("test-op");
      await Promise.resolve();
      return storage.require().executionId;
    });

    expect(result).toBe(context.executionId);
    expect(storage.get()).toBeUndefined();
  });

  it("keeps concurrent executions isolated", async () => {
    const storage = createContextStorage();

    const run = (name: string) =>
      storage.run(createExecutionContext({ operation: name }), async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return storage.require().operation;
      });

    const [a, b] = await Promise.all([run("first"), run("second")]);
    expect(a).toBe("first");
    expect(b).toBe("second");
  });

  it("runDerived derives from the current context", () => {
    const storage = createContextStorage();
    const parent = createExecutionContext({
      correlationId: "corr-1",
      operation: "parent",
    });

    storage.run(parent, () => {
      storage.runDerived({ operation: "child" }, () => {
        const derived = storage.require();
        expect(derived.operation).toBe("child");
        /* Inherited from the current context, not reset. */
        expect(derived.correlationId).toBe("corr-1");
        expect(derived.executionId).toBe(parent.executionId);
      });

      /* The parent context is restored afterwards. */
      expect(storage.require().operation).toBe("parent");
    });
  });

  it("runDerived throws outside a managed execution", () => {
    const storage = createContextStorage();
    expect(() => storage.runDerived({}, () => 1)).toThrow(
      ExecutionContextNotFoundError,
    );
    expect(() => storage.require()).toThrow(/No active execution context/);
  });

  it("no longer exposes the runWith alias of run", () => {
    const storage = createContextStorage();
    expect(
      (storage as unknown as Record<string, unknown>).runWith,
    ).toBeUndefined();
    const context = createExecutionContext({ operation: "direct" });
    expect(storage.run(context, () => storage.require().operation)).toBe(
      "direct",
    );
  });

  it("runWithoutContext clears the active context", () => {
    const storage = createContextStorage();
    storage.run(createExecutionContext(), () => {
      expect(storage.has()).toBe(true);
      storage.runWithoutContext(() => {
        expect(storage.has()).toBe(false);
      });
      expect(storage.has()).toBe(true);
    });
  });

  it("carries typed context values alongside the execution", async () => {
    const storage = createContextStorage();
    const userKey = createContextKey<string>("user");
    const values = createContextValues().set(userKey, "alice");
    const context = createExecutionContext();

    await storage.runWithValues(context, values, async () => {
      await Promise.resolve();
      expect(storage.getValues()?.get(userKey)).toBe("alice");
    });

    expect(storage.getValues()).toBeUndefined();
  });

  it("captures and restores snapshots with values", () => {
    const storage = createContextStorage();
    const key = createContextKey<number>("count");
    const values = createContextValues().set(key, 42);
    const context = createExecutionContext({ operation: "snap" });

    const snapshot = storage.runWithValues(context, values, () =>
      storage.capture(),
    );

    expect(snapshot.context.operation).toBe("snap");

    storage.runSnapshot(snapshot, () => {
      expect(storage.require().operation).toBe("snap");
      expect(storage.getValues()?.get(key)).toBe(42);
    });
  });

  it("capture() outside an execution throws", () => {
    const storage = createContextStorage();
    expect(() => storage.capture()).toThrow(ExecutionContextNotFoundError);
  });

  it("snapshots remain usable via createContextSnapshot directly", () => {
    const context = createExecutionContext();
    const snapshot = createContextSnapshot(context);
    expect(snapshot.context).toBe(context);
    expect(snapshot.values.isEmpty()).toBe(true);
  });
});
