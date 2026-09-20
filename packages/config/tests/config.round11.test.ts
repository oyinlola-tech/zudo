/**
 * Regression tests for the round-11 audit findings (MSG-C-*).
 */

import { describe, it, expect } from "vitest";

import {
  createConfigLoader,
  createConfigManager,
  createConfigStore,
  createConfigurationFromValues,
  createMemoryConfigSource,
  serializeConfigEntry,
} from "../src/index.js";

describe("MSG-C-01", () => {
  it("redacts initialValues in toSafeObject() without a source", () => {
    const manager = createConfigurationFromValues({
      "db.password": "hunter2",
      api_key: "AKIA",
      "app.name": "demo",
    });

    const safe = manager.toSafeObject();

    expect(safe["db.password"]).toBe("[REDACTED]");
    expect(safe["api_key"]).toBe("[REDACTED]");
    expect(safe["app.name"]).toBe("demo");

    // Raw access is unchanged.
    expect(manager.toObject()["db.password"]).toBe("hunter2");
  });

  it("marks a secret written through ConfigStore.set as sensitive", () => {
    const store = createConfigStore();
    const entry = store.set("service.token", "t0ken");

    expect(entry.sensitive).toBe(true);
    expect(store.toSafeObject()["service.token"]).toBe("[REDACTED]");
    expect(serializeConfigEntry(entry).value).toBe("[REDACTED]");
  });

  it("marks secrets written through setMany() and replace()", () => {
    const store = createConfigStore();

    store.setMany({ "service.token": "t0ken", "app.port": 8080 });
    expect(store.toSafeObject()["service.token"]).toBe("[REDACTED]");
    expect(store.toSafeObject()["app.port"]).toBe(8080);

    store.replace({ "db.password": "hunter2" });
    expect(store.toSafeObject()["db.password"]).toBe("[REDACTED]");
  });

  it("marks a secret written through ConfigManager.set", () => {
    const manager = createConfigManager();
    const entry = manager.set("stripe.secret", "sk_live_1");

    expect(entry.sensitive).toBe(true);
    expect(manager.toSafeObject()["stripe.secret"]).toBe("[REDACTED]");
  });

  it("detects a credential URL by value, not just by key name", () => {
    const store = createConfigStore();
    store.set("service.endpoint", "postgres://user:pw@host/db");

    expect(store.toSafeObject()["service.endpoint"]).toBe("[REDACTED]");
  });

  it("honours an explicit sensitive: false opt-out", () => {
    const store = createConfigStore();
    const entry = store.set("public.token", "not-a-secret", {
      sensitive: false,
    });

    expect(entry.sensitive).toBe(false);
    expect(store.toSafeObject()["public.token"]).toBe("not-a-secret");
  });
});

describe("MSG-C-02", () => {
  it("keeps initialValues after a load from a default-priority source", async () => {
    const manager = createConfigManager({
      initialValues: { "app.name": "fromInitial" },
      sources: [
        createMemoryConfigSource({ "app.name": "fromSource" }, { name: "mem" }),
      ],
    });

    await manager.load();

    expect(manager.get("app.name")).toBe("fromInitial");
  });

  it("keeps initialValues when the manager is given an external store", async () => {
    const store = createConfigStore();

    const manager = createConfigManager({
      store,
      initialValues: { "app.name": "fromInitial" },
      sources: [
        createMemoryConfigSource({ "app.name": "fromSource" }, { name: "mem" }),
      ],
    });

    await manager.load();

    expect(manager.get("app.name")).toBe("fromInitial");
    expect(store.getEntry("app.name")?.source).toBe("initialValues");
  });

  it("still lets a source that declares a priority override initialValues", async () => {
    const manager = createConfigManager({
      initialValues: { "app.name": "fromInitial" },
      sources: [
        createMemoryConfigSource(
          { "app.name": "fromSource" },
          { name: "mem", priority: 0 },
        ),
      ],
    });

    await manager.load();

    expect(manager.get("app.name")).toBe("fromSource");
  });

  it("still lets sources provide keys initialValues does not define", async () => {
    const manager = createConfigManager({
      initialValues: { "app.name": "fromInitial" },
      sources: [
        createMemoryConfigSource(
          { "app.name": "fromSource", "app.port": 8080 },
          { name: "mem" },
        ),
      ],
    });

    await manager.load();

    expect(manager.get("app.port")).toBe(8080);
  });
});

describe("MSG-C-03", () => {
  it("applies only the first source when two share a name", async () => {
    const loader = createConfigLoader({
      sources: [
        createMemoryConfigSource({ k: "A" }, { name: "dup" }),
        createMemoryConfigSource({ k: "B" }, { name: "dup" }),
      ],
    });

    const result = await loader.load();

    expect(loader.getSources()).toHaveLength(1);
    expect(result.store.get("k")).toBe("A");
  });

  it("deduplicates constructor sources for a manager too", async () => {
    const manager = createConfigManager({
      sources: [
        createMemoryConfigSource({ k: "A" }, { name: "dup" }),
        createMemoryConfigSource({ k: "B" }, { name: "dup" }),
      ],
    });

    await manager.load();

    expect(manager.get("k")).toBe("A");
  });
});
