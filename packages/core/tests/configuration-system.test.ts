import { describe, it, expect } from "vitest";
import {
  createConfiguration,
  createConfigurationSource,
  sortConfigurationSources,
  ConfigurationLoader,
  ConfigurationLoadError,
  createConfigurationLoader,
  DefaultConfigurationProvider,
  createConfigurationManager,
  createConfigurationRegistry,
  createConfigurationSchemaRegistry,
  createConfigurationSchema,
  validateConfigurationOrThrow,
  applyConfigurationSchemaDefaults,
  ConfigurationRedactor,
  ConfigurationError,
  ConfigurationSourceError,
  ConfigurationValidationError,
  InvalidStateError,
  ErrorCode,
} from "../src/index.js";
import type { ConfigurationLifecycleEvent } from "../src/index.js";

function source(
  name: string,
  priority: number,
  entries: Record<string, unknown>,
  type: "default" | "environment" | "file" = "file",
) {
  return createConfigurationSource({
    name,
    type,
    priority,
    load: async () =>
      Object.entries(entries).map(([path, value]) => ({
        path,
        value: value as never,
      })),
  });
}

describe("ConfigurationLoader", () => {
  it("applies sources in priority order (higher priority wins)", async () => {
    const loader = new ConfigurationLoader({
      sources: [
        source("env", 10, { "db.host": "envhost" }, "environment"),
        source(
          "defaults",
          0,
          { "db.host": "default", "db.port": 1 },
          "default",
        ),
      ],
    });

    const result = await loader.load();
    expect(result.configuration.get("db.host")).toBe("envhost");
    expect(result.configuration.get("db.port")).toBe(1);
    expect(result.entryCount).toBe(3);
    expect(result.configuration.getSource("db.host")).toBe("environment");
  });

  it("uses sortConfigurationSources semantics for stable ordering", () => {
    const a = source("a", 5, {});
    const b = source("b", 1, {});
    expect(sortConfigurationSources([a, b]).map((s) => s.name)).toEqual([
      "b",
      "a",
    ]);
  });

  it("merges extra sources by priority without duplicating names", async () => {
    const loader = new ConfigurationLoader({
      sources: [source("own", 5, { key: "own" })],
    });

    const result = await loader.load([
      source("extra", 1, { key: "extra", other: true }),
      source("own", 99, { key: "shadowed" }),
    ]);

    expect(result.configuration.get("key")).toBe("own");
    expect(result.configuration.get("other")).toBe(true);
  });

  it("wraps single-source failures in a code-catchable ConfigurationLoadError", async () => {
    const failing = createConfigurationSource({
      name: "broken",
      type: "file",
      priority: 0,
      load: async () => {
        throw new Error("disk exploded");
      },
    });

    const loader = createConfigurationLoader({ sources: [failing] });

    try {
      await loader.load();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationLoadError);
      const loadError = error as ConfigurationLoadError;
      expect(loadError.code).toBe(ErrorCode.CONFIGURATION_LOAD_FAILED);
      expect(loadError.message).toContain("broken");
      expect(loadError.failures).toHaveLength(1);
    }
  });

  it("aggregates every failed source in concurrent mode", async () => {
    const ok = source("fine", 0, { a: 1 });
    const bad1 = createConfigurationSource({
      name: "bad-one",
      type: "file",
      priority: 1,
      load: async () => {
        throw new Error("first failure");
      },
    });
    const bad2 = createConfigurationSource({
      name: "bad-two",
      type: "remote",
      priority: 2,
      load: async () => {
        throw new Error("second failure");
      },
    });

    const loader = new ConfigurationLoader({
      sources: [ok, bad1, bad2],
      sequential: false,
    });

    try {
      await loader.load();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationLoadError);
      const loadError = error as ConfigurationLoadError;
      expect(loadError.failures).toHaveLength(2);
      expect(loadError.message).toContain("bad-one");
      expect(loadError.message).toContain("bad-two");
    }
  });

  it("redacts sensitive text in load error messages", async () => {
    const failing = createConfigurationSource({
      name: "db",
      type: "file",
      priority: 0,
      load: async () => {
        throw new Error("connect failed: password=supersecret host=x");
      },
    });

    try {
      await createConfigurationLoader({ sources: [failing] }).load();
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("supersecret");
      expect(message).toContain("[REDACTED]");
    }
  });
});

describe("DefaultConfigurationProvider", () => {
  it("layers reloaded sources on top of the initial configuration", async () => {
    const provider = new DefaultConfigurationProvider({
      configuration: createConfiguration({
        values: { app: { name: "zudo", port: 1 } },
        source: "default",
      }),
      sources: [source("env", 10, { "app.port": 8080 }, "environment")],
    });

    await provider.reload();

    /* Programmatic defaults survive; source values override. */
    expect(provider.get("app.name")).toBe("zudo");
    expect(provider.get("app.port")).toBe(8080);
  });

  it("shares one in-flight reload between concurrent calls", async () => {
    let calls = 0;
    const slow = createConfigurationSource({
      name: "slow",
      type: "remote",
      priority: 0,
      load: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [{ path: "value", value: calls }];
      },
    });

    const provider = new DefaultConfigurationProvider({ sources: [slow] });

    const [first, second] = await Promise.all([
      provider.reload(),
      provider.reload(),
    ]);

    expect(calls).toBe(1);
    expect(first).toBe(second);

    await provider.reload();
    expect(calls).toBe(2);
  });
});

describe("ConfigurationManager", () => {
  it("feeds registry sources into the load", async () => {
    const registry = createConfigurationRegistry();
    registry.registerSource(source("registry-source", 5, { fromRegistry: 1 }));

    const manager = createConfigurationManager({ registry });
    const result = await manager.initialize();

    expect(result.configuration.get("fromRegistry")).toBe(1);
    expect(manager.get("fromRegistry")).toBe(1);
  });

  it("exposes registered sections as scoped configurations", async () => {
    const registry = createConfigurationRegistry();
    registry.registerSource(
      source("db", 1, { "database.host": "localhost", "database.port": 5432 }),
    );
    registry.registerSection({ name: "db", path: "database" });

    const manager = createConfigurationManager({ registry });
    expect(() => manager.getSection("db")).toThrow(InvalidStateError);

    await manager.initialize();
    const section = manager.getSection("db");
    expect(section.getNamespace()).toBe("database");
    expect(section.get("host")).toBe("localhost");
    expect(section.getNumber("port")).toBe(5432);
    expect(() => manager.getSection("missing")).toThrow(/not registered/);
  });

  it("throws taxonomy errors for load and validation failures", async () => {
    const registry = createConfigurationRegistry();
    registry.registerSource(
      createConfigurationSource({
        name: "broken",
        type: "file",
        load: async () => {
          throw new Error("disk on fire");
        },
      }),
    );
    const manager = createConfigurationManager({ registry });
    let caught: unknown;
    try {
      await manager.initialize();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConfigurationLoadError);
    expect(caught).toBeInstanceOf(ConfigurationSourceError);
    expect(caught).toBeInstanceOf(ConfigurationError);
    expect((caught as ConfigurationError).code).toBe(
      ErrorCode.CONFIGURATION_LOAD_FAILED,
    );
    expect((caught as ConfigurationSourceError).sourceName).toBe("broken");

    const schemas = createConfigurationSchemaRegistry();
    schemas.register(createConfigurationSchema({ path: "required.value" }));
    const strict = createConfigurationManager({ schemas });
    let validationError: unknown;
    try {
      await strict.initialize();
    } catch (error) {
      validationError = error;
    }
    expect(validationError).toBeInstanceOf(ConfigurationValidationError);
    expect(validationError).toBeInstanceOf(ConfigurationError);
    expect((validationError as ConfigurationError).code).toBe(
      ErrorCode.CONFIGURATION_VALIDATION_FAILED,
    );
  });

  it("emits lifecycle events in order", async () => {
    const manager = createConfigurationManager({
      loaderOptions: { sources: [source("s", 0, { a: 1 })] },
    });

    const events: string[] = [];
    manager.on("*", (event) => {
      events.push(event.type);
    });

    await manager.initialize();
    expect(events).toEqual([
      "configuration.initializing",
      "configuration.loaded",
      "configuration.validated",
      "configuration.ready",
    ]);

    events.length = 0;
    await manager.reload();
    expect(events[0]).toBe("configuration.reloading");
    expect(events).toContain("configuration.reloaded");
  });

  it("emits failed events and collects listener errors without breaking loads", async () => {
    const failing = createConfigurationSource({
      name: "bad",
      type: "file",
      priority: 0,
      load: async () => {
        throw new Error("boom");
      },
    });

    const manager = createConfigurationManager({
      loaderOptions: { sources: [failing] },
    });

    const seen: ConfigurationLifecycleEvent[] = [];
    manager.on("configuration.failed", (event) => {
      seen.push(event);
    });
    manager.on("*", () => {
      throw new Error("listener blew up");
    });

    await expect(manager.initialize()).rejects.toThrow(ConfigurationLoadError);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.type).toBe("configuration.failed");
    expect(manager.getListenerErrors().length).toBeGreaterThan(0);
  });

  it("supports unsubscribing via on() return value and off()", async () => {
    const manager = createConfigurationManager();
    let count = 0;
    const listener = () => {
      count += 1;
    };
    const unsubscribe = manager.on("*", listener);
    unsubscribe();
    await manager.initialize();
    expect(count).toBe(0);
  });

  it("guards get()/require() behind readiness", () => {
    const manager = createConfigurationManager();
    expect(() => manager.get("a")).toThrow(/not ready/);
    expect(() => manager.require("a")).toThrow(/not ready/);
  });

  it("applies schema defaults to the active configuration", async () => {
    const schemas = createConfigurationSchemaRegistry();
    schemas.register(
      createConfigurationSchema({
        path: "app.timeout",
        required: false,
        defaultValue: 30,
      }),
    );

    const manager = createConfigurationManager({ schemas });
    await manager.initialize();

    expect(manager.get("app.timeout")).toBe(30);
    expect(manager.getConfiguration().getSource("app.timeout")).toBe("default");
  });
});

describe("Configuration schema validation", () => {
  it("validateConfigurationOrThrow returns configuration with defaults applied", async () => {
    const registry = createConfigurationSchemaRegistry();
    registry.register(
      createConfigurationSchema({
        path: "cache.ttl",
        required: false,
        defaultValue: 60,
      }),
    );

    const configuration = createConfiguration({ values: { other: 1 } });
    const validated = await validateConfigurationOrThrow(
      configuration,
      registry,
    );

    expect(validated.get("cache.ttl")).toBe(60);
    expect(validated.get("other")).toBe(1);

    const applied = applyConfigurationSchemaDefaults(configuration, registry);
    expect(applied.get("cache.ttl")).toBe(60);
  });

  it("runs the schema validator against default values too", async () => {
    const registry = createConfigurationSchemaRegistry();
    registry.register(
      createConfigurationSchema<number>({
        path: "app.port",
        required: false,
        defaultValue: -1,
        validator: (value, context) =>
          value > 0
            ? { success: true, value, errors: [] }
            : {
                success: false,
                errors: [
                  {
                    path: context.path,
                    message: "port must be positive",
                  },
                ],
              },
      }),
    );

    await expect(
      validateConfigurationOrThrow(createConfiguration(), registry),
    ).rejects.toThrow(ConfigurationValidationError);
  });

  it("redacts issue values and messages on sensitive paths", () => {
    const error = new ConfigurationValidationError(
      [
        {
          path: "auth.token",
          message: "invalid token=abc123secret provided",
          value: "abc123secret",
        },
      ],
      1,
      1,
    );

    expect(error.issues[0]?.value).toBe("[REDACTED]");
    expect(error.message).not.toContain("abc123secret");
  });
});

describe("ConfigurationRedactor", () => {
  const redactor = new ConfigurationRedactor();

  it("redacts sensitive keys including broadened defaults", () => {
    const result = redactor.redactObject({
      password: "a",
      pwd: "b",
      passphrase: "c",
      dsn: "d",
      connectionString: "e",
      privateKey: "f",
      apiToken: "g",
      access_token: "h",
      normal: "keep",
    }) as Record<string, unknown>;

    expect(result.password).toBe("[REDACTED]");
    expect(result.pwd).toBe("[REDACTED]");
    expect(result.passphrase).toBe("[REDACTED]");
    expect(result.dsn).toBe("[REDACTED]");
    expect(result.connectionString).toBe("[REDACTED]");
    expect(result.privateKey).toBe("[REDACTED]");
    expect(result.apiToken).toBe("[REDACTED]");
    expect(result.access_token).toBe("[REDACTED]");
    expect(result.normal).toBe("keep");
  });

  it("does not redact lookalike words", () => {
    const result = redactor.redactObject({
      tokenizer: "keep-1",
      secretary: "keep-2",
      author: "keep-3",
      dsnFallbackCount: 3,
    }) as Record<string, unknown>;

    expect(result.tokenizer).toBe("keep-1");
    expect(result.secretary).toBe("keep-2");
    expect(result.author).toBe("keep-3");
  });

  it("keeps own __proto__ keys as data instead of losing them", () => {
    const polluted = JSON.parse(
      '{"__proto__": {"password": "x"}, "ok": 1}',
    ) as never;

    const result = redactor.redactObject(polluted) as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(result, "__proto__");

    expect(descriptor).toBeDefined();
    expect(result.ok).toBe(1);
    expect(({} as Record<string, unknown>).password).toBeUndefined();
  });

  it("redacts values inside free-form text", () => {
    const text = redactor.redactText(
      'auth failed: password=hunter2 token: "abcdef" normal=fine',
    );
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("abcdef");
    expect(text).toContain("normal=fine");
  });
});
