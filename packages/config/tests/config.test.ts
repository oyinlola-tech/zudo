import { describe, it, expect } from "vitest";

import {
  validateConfigObject,
  validateConfigValue,
} from "../src/configSchema/configSchema.validator.js";

import { ConfigValueType } from "../src/configSchema/configSchema.type.js";

import {
  ConfigSourceType,
  createConfigSource,
  createMemoryConfigSource,
  sortConfigSources,
} from "../src/configSource/configSource.core.js";

import {
  createConfigLoader,
  loadConfiguration,
} from "../src/configLoader/configLoader.core.js";

import { createConfigStore } from "../src/configStore/configStore.factory.js";

import {
  createConfigEntry,
  isConfigEntry,
} from "../src/configEntry/configEntry.type.js";

import {
  isConfigPrimitive,
  isConfigValue,
  cloneConfigValue,
  freezeConfigValue,
  configValueToString,
} from "../src/configValue/configValue.core.js";

import { redactConfigValue } from "../src/configEntry/configEntry.type.js";

import type { ConfigValue } from "../src/configValue/configValue.core.js";

import type { ConfigSource } from "../src/configSource/configSource.core.js";

import { createConfigManager } from "../src/configManager/configManager.factory.js";

import { ConfigManagerState } from "../src/configManager/configManager.type.js";

import { createConfigResolver } from "../src/configResolver/core/configResolver.factory.js";

// ---------------------------------------------------------------------------
// ConfigValue
// ---------------------------------------------------------------------------

describe("ConfigValue", () => {
  it("recognizes primitives", () => {
    expect(isConfigPrimitive("hello")).toBe(true);
    expect(isConfigPrimitive(42)).toBe(true);
    expect(isConfigPrimitive(true)).toBe(true);
    expect(isConfigPrimitive(null)).toBe(true);
    expect(isConfigPrimitive(undefined)).toBe(true);
    expect(isConfigPrimitive({})).toBe(false);
  });

  it("recognizes config values", () => {
    expect(isConfigValue("hello")).toBe(true);
    expect(isConfigValue(42)).toBe(true);
    expect(isConfigValue({ a: 1 })).toBe(true);
    expect(isConfigValue([1, 2, 3])).toBe(true);
  });

  it("clones values", () => {
    const original = { a: { b: 1 } };
    const cloned = cloneConfigValue(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it("freezes values", () => {
    const obj = { a: 1 };
    const frozen = freezeConfigValue(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it("converts to string", () => {
    expect(configValueToString("hello")).toBe("hello");
    expect(configValueToString(42)).toBe("42");
    expect(configValueToString(true)).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// ConfigEntry
// ---------------------------------------------------------------------------

describe("ConfigEntry", () => {
  it("creates a config entry", () => {
    const entry = createConfigEntry({ key: "db.host", value: "localhost" });
    expect(entry.key).toBe("db.host");
    expect(entry.value).toBe("localhost");
    expect(isConfigEntry(entry)).toBe(true);
  });

  it("rejects non-entries", () => {
    expect(isConfigEntry({ key: "x" })).toBe(false);
    expect(isConfigEntry(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConfigStore
// ---------------------------------------------------------------------------

describe("ConfigStore", () => {
  it("creates a store with initial values", () => {
    const store = createConfigStore({
      initialValues: {
        "app.name": "test",
        "app.port": 3000,
      },
    });

    expect(store.get("app.name")).toBe("test");
    expect(store.get("app.port")).toBe(3000);
    expect(store.size).toBe(2);
  });

  it("sets and gets values", () => {
    const store = createConfigStore();
    store.set("key", "value");
    expect(store.get("key")).toBe("value");
  });

  it("deletes values", () => {
    const store = createConfigStore();
    store.set("key", "value");
    expect(store.delete("key")).toBe(true);
    expect(store.get("key")).toBeUndefined();
  });

  it("freezes values when configured", () => {
    const store = createConfigStore({ freeze: true });
    store.set("key", { nested: true });
    const entry = store.getEntry("key");
    expect(entry).toBeDefined();
  });

  it("converts to object", () => {
    const store = createConfigStore({
      initialValues: { a: 1, b: "two" },
    });
    const obj = store.toObject();
    expect(obj.a).toBe(1);
    expect(obj.b).toBe("two");
  });

  it("disposes cleanly", () => {
    const store = createConfigStore();
    store.set("key", "value");
    store.dispose();
    expect(store.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ConfigResolver
// ---------------------------------------------------------------------------

describe("ConfigResolver", () => {
  it("gets values from the store", () => {
    const store = createConfigStore({
      initialValues: { "app.host": "localhost" },
    });
    const resolver = createConfigResolver(store);

    expect(resolver.get("app.host")).toBe("localhost");
  });

  it("returns undefined for missing keys", () => {
    const store = createConfigStore();
    const resolver = createConfigResolver(store);

    expect(resolver.get("missing")).toBeUndefined();
  });

  it("creates scoped resolvers", () => {
    const store = createConfigStore({
      initialValues: {
        "db.host": "localhost",
        "db.port": 5432,
      },
    });
    const resolver = createConfigResolver(store);
    const scoped = resolver.scoped("db");

    expect(scoped.get("host")).toBe("localhost");
    expect(scoped.get("port")).toBe(5432);
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema validation
// ---------------------------------------------------------------------------

describe("ConfigSchema validation", () => {
  it("validates an object against a schema", () => {
    const result = validateConfigObject(
      { name: "test", port: 3000 },
      {
        type: "object",
        properties: {
          name: { type: "string" },
          port: { type: "number" },
        },
      },
    );

    expect(result.valid).toBe(true);
  });

  it("detects type mismatches", () => {
    const result = validateConfigObject(
      { name: 42 },
      {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    );

    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ConfigSource
// ---------------------------------------------------------------------------

describe("ConfigSource", () => {
  it("creates a source with loader", async () => {
    const source = createConfigSource({ name: "test-source" }, async () => ({
      values: { key: "value" },
      source: "test",
      type: ConfigSourceType.CUSTOM,
    }));

    expect(source.name).toBe("test-source");
    expect(source.type).toBe(ConfigSourceType.CUSTOM);

    const result = await source.load({
      environment: "test",
    });
    expect(result.values.key).toBe("value");
  });
});

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

describe("ConfigManager", () => {
  it("creates in CREATED state", () => {
    const manager = createConfigManager();
    expect(manager.getState()).toBe(ConfigManagerState.CREATED);
  });

  it("loads and transitions to READY", async () => {
    const manager = createConfigManager();
    await manager.load();
    expect(manager.getState()).toBe(ConfigManagerState.READY);
    expect(manager.isReady).toBe(true);
  });

  it("gets values set before load", async () => {
    const manager = createConfigManager({
      initialValues: {
        "app.name": "zudojs",
      },
    });

    // Initial values are in the store before load
    expect(manager.get("app.name")).toBe("zudojs");

    await manager.load();
    expect(manager.isReady).toBe(true);

    // Finding 1: initialValues must SURVIVE load() — the manager's
    // loader must not clear the store it seeded.
    expect(manager.get("app.name")).toBe("zudojs");
  });

  it("sets runtime values", async () => {
    const manager = createConfigManager();
    await manager.load();

    manager.set("runtime.key", "runtime-value");
    expect(manager.get("runtime.key")).toBe("runtime-value");
  });

  it("deletes values", async () => {
    const manager = createConfigManager({
      initialValues: { "to.delete": true },
    });

    expect(manager.get("to.delete")).toBe(true);
    expect(manager.delete("to.delete")).toBe(true);
    expect(manager.get("to.delete")).toBeUndefined();
  });

  it("tracks status", async () => {
    const manager = createConfigManager();

    const status1 = manager.getStatus();
    expect(status1.state).toBe(ConfigManagerState.CREATED);

    await manager.load();

    const status2 = manager.getStatus();
    expect(status2.state).toBe(ConfigManagerState.READY);
    expect(status2.loaded).toBe(true);
  });

  it("subscribes to state changes", async () => {
    const manager = createConfigManager();

    const states: string[] = [];
    manager.subscribe((status) => {
      states.push(status.state);
    });

    await manager.load();

    expect(states).toContain(ConfigManagerState.READY);
  });

  it("converts to object", async () => {
    const manager = createConfigManager({
      initialValues: { a: 1, b: "two" },
    });

    const obj = manager.toObject();
    expect(obj.a).toBe(1);
    expect(obj.b).toBe("two");
  });

  it("disposes cleanly", async () => {
    const manager = createConfigManager();
    await manager.dispose();

    expect(manager.getState()).toBe(ConfigManagerState.DISPOSED);
    expect(() => manager.get("key")).toThrow();
  });

  it("rejects operations after dispose", async () => {
    const manager = createConfigManager();
    await manager.dispose();

    expect(() => manager.get("key")).toThrow("disposed");
  });

  it("manages lifecycle states", async () => {
    const manager = createConfigManager();

    expect(manager.getState()).toBe(ConfigManagerState.CREATED);
    expect(manager.isLoading).toBe(false);

    await manager.load();
    expect(manager.getState()).toBe(ConfigManagerState.READY);
    expect(manager.isLoading).toBe(false);

    // Reload
    await manager.reload();
    expect(manager.getState()).toBe(ConfigManagerState.READY);
  });
});

// ---------------------------------------------------------------------------
// Regression tests
// ---------------------------------------------------------------------------

function memorySource(
  name: string,
  values: Readonly<Record<string, ConfigValue>>,
  priority = 0,
): ConfigSource {
  return createMemoryConfigSource(values, { name, priority });
}

describe("Finding 1: initialValues and runtime set() survive load()", () => {
  it("keeps initialValues and runtime values across load and reload", async () => {
    const manager = createConfigManager({
      initialValues: { "seed.key": "seeded" },
      sources: [memorySource("defaults", { "loaded.key": "loaded" }, -1000)],
    });

    manager.set("runtime.key", "runtime");

    await manager.load();

    expect(manager.get("seed.key")).toBe("seeded");
    expect(manager.get("runtime.key")).toBe("runtime");
    expect(manager.get("loaded.key")).toBe("loaded");

    await manager.reload();

    expect(manager.get("seed.key")).toBe("seeded");
    expect(manager.get("runtime.key")).toBe("runtime");
    expect(manager.get("loaded.key")).toBe("loaded");
  });

  it("still lets sources overwrite by priority", async () => {
    const manager = createConfigManager({
      initialValues: { "app.port": 3000 },
      sources: [memorySource("override", { "app.port": 8080 }, 10)],
    });

    await manager.load();

    expect(manager.get("app.port")).toBe(8080);
  });
});

describe("Finding 2: caller-supplied loader shares the manager store", () => {
  it("resolves values loaded through a custom loader", async () => {
    const loader = createConfigLoader({
      sources: [memorySource("mem", { "from.loader": "value" })],
    });

    const manager = createConfigManager({ loader });

    await manager.load();

    expect(manager.get("from.loader")).toBe("value");
    expect(manager.getStore()).toBe(loader.getStore());
  });
});

describe("Finding 4: prototype pollution protection", () => {
  const payload = () =>
    JSON.parse('{"a":1,"__proto__":{"isAdmin":true}}') as Record<
      string,
      ConfigValue
    >;

  it("cloneConfigValue does not turn __proto__ keys into a prototype", () => {
    const clone = cloneConfigValue(payload());

    expect(clone.a).toBe(1);
    expect((clone as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it("resolver clone mode does not pollute prototypes", () => {
    const store = createConfigStore({ freeze: false });
    store.set("payload", payload());

    const resolver = createConfigResolver(store, { clone: true });
    const value = resolver.get<Record<string, ConfigValue>>("payload");

    expect(value?.a).toBe(1);
    expect((value as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });

  it("validateConfigObject does not pollute prototypes", () => {
    const result = validateConfigObject(payload(), {
      type: ConfigValueType.OBJECT,
      properties: { a: { type: ConfigValueType.NUMBER } },
      additionalProperties: true,
    });

    expect(result.valid).toBe(true);
    expect((result.value as Record<string, unknown>).a).toBe(1);
    expect((result.value as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
  });
});

describe("Finding 5: loadSources preserves the store and callbacks", () => {
  it("retains previous values and invokes onSourceLoaded", async () => {
    const store = createConfigStore();
    store.set("keep", "kept");

    const loadedSources: string[] = [];

    const loader = createConfigLoader({
      store,
      onSourceLoaded: (source) => {
        loadedSources.push(source.name);
      },
    });

    await loader.loadSources([memorySource("extra", { added: "yes" })]);

    expect(store.get("keep")).toBe("kept");
    expect(store.get("added")).toBe("yes");
    expect(loadedSources).toContain("extra");
  });
});

describe("Finding 6: sensitive values and redaction", () => {
  it("marks source sensitiveKeys as sensitive and redacts them", async () => {
    const source = createConfigSource({ name: "secrets" }, async () => ({
      values: { "db.password": "hunter2", "db.host": "localhost" },
      sensitiveKeys: ["db.password"],
      source: "secrets",
      type: ConfigSourceType.CUSTOM,
    }));

    const loader = createConfigLoader({ sources: [source] });
    await loader.load();

    const store = loader.getStore();

    expect(store.getEntry("db.password")?.sensitive).toBe(true);
    expect(store.getEntry("db.host")?.sensitive).toBe(false);

    const safe = store.toSafeObject();
    expect(safe["db.password"]).toBe("[REDACTED]");
    expect(safe["db.host"]).toBe("localhost");

    // toObject() is documented to return raw values.
    expect(store.toObject()["db.password"]).toBe("hunter2");
  });

  it("collapses sensitive arrays without leaking their length", () => {
    expect(redactConfigValue([1, 2, 3])).toBe("[REDACTED]");
    expect(redactConfigValue({ a: 1 })).toBe("[REDACTED]");
    expect(redactConfigValue("secret")).toBe("[REDACTED]");
  });

  it("wires schema secret flags into entry sensitivity via validate()", () => {
    const manager = createConfigManager({
      initialValues: { "api.key": "abc", "api.url": "https://example.test" },
    });

    manager.validate({
      properties: {
        "api.key": { type: ConfigValueType.STRING, secret: true },
        "api.url": { type: ConfigValueType.STRING },
      },
      additionalProperties: true,
    });

    expect(manager.toSafeObject()["api.key"]).toBe("[REDACTED]");
    expect(manager.toSafeObject()["api.url"]).toBe("https://example.test");
    expect(manager.toObject()["api.key"]).toBe("abc");
  });
});

describe("Finding 7: equal-priority sources follow registration order", () => {
  it("keeps registration order in sortConfigSources for ties", () => {
    const b = memorySource("b-source", { shared: "from-b" }, 5);
    const a = memorySource("a-source", { shared: "from-a" }, 5);

    const sorted = sortConfigSources([b, a]);

    expect(sorted.map((source) => source.name)).toEqual([
      "b-source",
      "a-source",
    ]);
  });

  it("lets the last-registered equal-priority source win", async () => {
    // Registered: b-source first, a-source second. Alphabetical
    // ordering would make b-source win; registration order must make
    // a-source (registered last) win.
    const b = memorySource("b-source", { shared: "from-b" }, 5);
    const a = memorySource("a-source", { shared: "from-a" }, 5);

    const result = await loadConfiguration([b, a]);

    expect(result.store.get("shared")).toBe("from-a");
  });

  it("still lets higher priority win regardless of order", async () => {
    const low = memorySource("low", { shared: "low" }, 1);
    const high = memorySource("high", { shared: "high" }, 10);

    const result = await loadConfiguration([low, high]);

    expect(result.store.get("shared")).toBe("high");
  });
});

describe("Finding 8: autoLoad", () => {
  it("starts loading on construction and resolves via ready()", async () => {
    const manager = createConfigManager({
      autoLoad: true,
      sources: [memorySource("auto", { "auto.key": "auto-value" })],
    });

    expect(manager.isLoading).toBe(true);

    await manager.ready();

    expect(manager.isReady).toBe(true);
    expect(manager.get("auto.key")).toBe("auto-value");
  });

  it("reuses the in-flight promise for concurrent load() calls", async () => {
    let loadCount = 0;

    const source = createConfigSource({ name: "counting" }, async () => {
      loadCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        values: { counted: loadCount },
        source: "counting",
        type: ConfigSourceType.CUSTOM,
      };
    });

    const manager = createConfigManager({ sources: [source] });

    const [first, second] = await Promise.all([
      manager.load(),
      manager.load(),
    ]);

    expect(loadCount).toBe(1);
    expect(first).toBe(second);
  });

  it("surfaces autoLoad failures through ready()", async () => {
    const failing = createConfigSource({ name: "broken" }, async () => {
      throw new Error("boom");
    });

    const manager = createConfigManager({
      autoLoad: true,
      sources: [failing],
    });

    await expect(manager.ready()).rejects.toThrow("boom");
    expect(manager.getState()).toBe(ConfigManagerState.FAILED);
  });
});

describe("Finding 9: dispose during in-flight load", () => {
  it("keeps the manager DISPOSED when a load finishes after dispose", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const slow = createConfigSource({ name: "slow" }, async () => {
      await gate;
      return {
        values: { "slow.key": "slow-value" },
        source: "slow",
        type: ConfigSourceType.CUSTOM,
      };
    });

    const manager = createConfigManager({ sources: [slow] });

    const loadPromise = manager.load();

    await manager.dispose();
    expect(manager.getState()).toBe(ConfigManagerState.DISPOSED);

    release();

    await expect(loadPromise).rejects.toThrow();
    expect(manager.getState()).toBe(ConfigManagerState.DISPOSED);
  });
});

describe("Finding 11: invalid Date resolution", () => {
  it("routes invalid Date instances through strict/fallback handling", () => {
    const store = createConfigStore({ freeze: false });
    store.set("when", new Date("not-a-date"));

    const strict = createConfigResolver(store, { strict: true });
    expect(() => strict.date("when")).toThrow();

    const lax = createConfigResolver(store, { strict: false });
    const fallback = new Date(0);
    expect(lax.date("when", fallback)).toBe(fallback);
    expect(lax.date("when")).toBeUndefined();
  });
});

describe("Finding 12: freezeConfigValue deep-freezes shallow-frozen trees", () => {
  it("recurses into already-frozen containers", () => {
    const inner = { a: 1 };
    const outer = Object.freeze({ inner });

    freezeConfigValue(outer);

    expect(Object.isFrozen(inner)).toBe(true);
  });

  it("returns class instances by reference without freezing them", () => {
    class Custom {
      value = 1;
    }

    const instance = new Custom();

    const frozen = freezeConfigValue(instance as unknown as ConfigValue);
    expect(frozen).toBe(instance);
    expect(Object.isFrozen(instance)).toBe(false);

    const cloned = cloneConfigValue(instance as unknown as ConfigValue);
    expect(cloned).toBe(instance);
  });
});

describe("Finding 13: ConfigStore.set no-op returns the stored entry", () => {
  it("returns the existing entry when nothing changes", () => {
    const store = createConfigStore();

    const first = store.set("key", "value");
    const second = store.set("key", "value");

    expect(second).toBe(first);
    expect(second).toBe(store.getEntry("key"));
  });
});

describe("Finding 14: validation failures never yield invalid values", () => {
  it("returns the schema default in non-strict mode", () => {
    const store = createConfigStore({
      initialValues: { port: "not-a-number" },
    });

    const resolver = createConfigResolver(store, { strict: false });

    expect(
      resolver.resolve("port", {
        type: ConfigValueType.NUMBER,
        default: 3000,
      }),
    ).toBe(3000);

    expect(
      resolver.resolve("port", { type: ConfigValueType.NUMBER }),
    ).toBeUndefined();
  });

  it("does not run transform on invalid values", () => {
    let transformCalls = 0;

    const result = validateConfigValue("nope", {
      type: ConfigValueType.NUMBER,
      transform: (value) => {
        transformCalls += 1;
        return value;
      },
    });

    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(transformCalls).toBe(0);
  });

  it("validates and transforms applied defaults", () => {
    const good = validateConfigValue(undefined, {
      type: ConfigValueType.NUMBER,
      default: 5,
      transform: (value) => (value as number) * 2,
    });

    expect(good.valid).toBe(true);
    expect(good.value).toBe(10);

    const bad = validateConfigValue(undefined, {
      type: ConfigValueType.NUMBER,
      default: "oops",
    } as never);

    expect(bad.valid).toBe(false);
    expect(bad.value).toBeUndefined();
  });
});

describe("Finding 15: loader honors context.signal", () => {
  it("stops loading between sources once aborted", async () => {
    const controller = new AbortController();
    const invoked: string[] = [];

    const first = createConfigSource(
      { name: "first", priority: 10 },
      async () => {
        invoked.push("first");
        controller.abort();
        return {
          values: { "first.key": "first" },
          source: "first",
          type: ConfigSourceType.CUSTOM,
        };
      },
    );

    const second = createConfigSource(
      { name: "second", priority: 0 },
      async () => {
        invoked.push("second");
        return {
          values: { "second.key": "second" },
          source: "second",
          type: ConfigSourceType.CUSTOM,
        };
      },
    );

    const loader = createConfigLoader({
      sources: [first, second],
      context: { signal: controller.signal },
    });

    await expect(loader.load()).rejects.toThrow();

    expect(invoked).toEqual(["first"]);

    // Values applied before the abort remain in the store.
    expect(loader.getStore().get("first.key")).toBe("first");
    expect(loader.getStore().get("second.key")).toBeUndefined();
  });
});

describe("Finding 16: loadConfiguration leaves caller sources open", () => {
  it("does not close sources owned by the caller", async () => {
    let closed = false;

    const source: ConfigSource = {
      name: "owned",
      type: ConfigSourceType.MEMORY,
      priority: 0,
      optional: false,
      load: async () => ({
        values: { owned: "yes" },
        source: "owned",
        type: ConfigSourceType.MEMORY,
      }),
      close: () => {
        closed = true;
      },
    };

    const result = await loadConfiguration([source]);

    expect(result.store.get("owned")).toBe("yes");
    expect(closed).toBe(false);
  });
});

describe("Finding 17: toObject returns a defensive snapshot", () => {
  it("does not leak mutable references from an unfrozen store", () => {
    const store = createConfigStore({ freeze: false });
    store.set("obj", { nested: { a: 1 } });

    const snapshot = store.toObject() as {
      obj: { nested: { a: number } };
    };

    snapshot.obj.nested.a = 42;

    expect(
      (store.get("obj") as { nested: { a: number } }).nested.a,
    ).toBe(1);
  });
});
