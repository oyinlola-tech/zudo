import { describe, it, expect } from "vitest";
import {
  Configuration,
  createConfiguration,
  createConfigurationKey,
  normalizeConfigurationPath,
  ConfigurationMissingError,
  ConfigurationPathError,
  ConfigurationTypeError,
  ConfigurationError,
  ErrorCode,
} from "../src/index.js";

describe("Configuration basics", () => {
  it("reads nested values with dot paths", () => {
    const configuration = createConfiguration({
      values: { db: { host: "localhost", port: 5432 } },
    });

    expect(configuration.get("db.host")).toBe("localhost");
    expect(configuration.get("db.port")).toBe(5432);
    expect(configuration.get("db.missing")).toBeUndefined();
    expect(configuration.get("")).toBeUndefined();
  });

  it("supports typed keys", () => {
    const key = createConfigurationKey<number>("app.port");
    const configuration = createConfiguration({
      values: { app: { port: 3000 } },
    });

    expect(configuration.getByKey(key)).toBe(3000);
    expect(configuration.requireByKey(key)).toBe(3000);
  });

  it("throws ConfigurationMissingError for missing required values", () => {
    const configuration = createConfiguration({ values: {} });

    expect(() => configuration.require("nope")).toThrow(
      ConfigurationMissingError,
    );

    try {
      configuration.require("nope");
    } catch (error) {
      expect((error as ConfigurationMissingError).code).toBe(
        ErrorCode.CONFIGURATION_REQUIRED,
      );
    }
  });
});

describe("Configuration prototype safety", () => {
  const configuration = createConfiguration({
    values: { real: 1 },
  });

  it("does not walk the prototype chain", () => {
    expect(configuration.get("__proto__")).toBeUndefined();
    expect(configuration.get("constructor")).toBeUndefined();
    expect(configuration.has("toString")).toBe(false);
    expect(configuration.has("real")).toBe(true);
  });

  it("rejects dangerous write paths with ConfigurationPathError", () => {
    expect(() => configuration.with("__proto__.polluted", true)).toThrow(
      ConfigurationPathError,
    );
    expect(() => configuration.with("a.constructor.b", 1)).toThrow(
      ConfigurationPathError,
    );

    try {
      configuration.with("a.constructor.b", 1);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).code).toBe(
        ErrorCode.CONFIGURATION_INVALID,
      );
      expect((error as ConfigurationError).path).toBe("a.constructor.b");
    }
  });
});

describe("Configuration path normalization", () => {
  it("trims paths", () => {
    const configuration = createConfiguration({ values: { a: 1 } });
    expect(configuration.get("  a  ")).toBe(1);
  });

  it("rejects paths containing embedded whitespace", () => {
    const configuration = createConfiguration({ values: { a: 1 } });
    expect(() => configuration.get("a. b")).toThrow(ConfigurationPathError);
    expect(() => normalizeConfigurationPath("db. host")).toThrow(
      ConfigurationPathError,
    );
    expect(normalizeConfigurationPath("  db.host ")).toBe("db.host");
  });

  it("rejects empty paths for scope(), with(), and keys", () => {
    const configuration = createConfiguration({ values: { a: 1 } });
    expect(() => configuration.scope("   ")).toThrow(ConfigurationPathError);
    expect(() => configuration.with("", 1)).toThrow(ConfigurationPathError);
    expect(() => createConfigurationKey(" ")).toThrow(ConfigurationPathError);
  });
});

describe("Configuration.getNumber", () => {
  const configuration = createConfiguration({
    values: {
      port: "8080",
      float: "1.25",
      negative: "-3",
      empty: "",
      blank: "   ",
      hex: "0x10",
      exponent: "1e3",
      infinity: "Infinity",
      actual: 42,
    },
  });

  it("parses strict decimal strings", () => {
    expect(configuration.getNumber("port")).toBe(8080);
    expect(configuration.getNumber("float")).toBe(1.25);
    expect(configuration.getNumber("negative")).toBe(-3);
    expect(configuration.getNumber("actual")).toBe(42);
  });

  it("treats empty and whitespace-only strings as undefined", () => {
    expect(configuration.getNumber("empty", 7)).toBe(7);
    expect(configuration.getNumber("blank", 9)).toBe(9);
    expect(() => configuration.getNumber("empty")).toThrow(
      ConfigurationTypeError,
    );
  });

  it("rejects hex and exponent notation", () => {
    expect(() => configuration.getNumber("hex")).toThrow(
      ConfigurationTypeError,
    );
    expect(() => configuration.getNumber("exponent")).toThrow(
      ConfigurationTypeError,
    );
    expect(() => configuration.getNumber("infinity")).toThrow(
      ConfigurationTypeError,
    );
  });

  it("returns the default for missing paths", () => {
    expect(configuration.getNumber("missing", 5)).toBe(5);
    expect(configuration.getNumber("missing")).toBeUndefined();
  });
});

describe("Configuration.getBoolean / getString", () => {
  const configuration = createConfiguration({
    values: { yes: "yes", no: "0", bad: "maybe", num: 3, obj: { a: 1 } },
  });

  it("parses boolean strings", () => {
    expect(configuration.getBoolean("yes")).toBe(true);
    expect(configuration.getBoolean("no")).toBe(false);
  });

  it("throws ConfigurationTypeError with the taxonomy code", () => {
    try {
      configuration.getBoolean("bad");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationTypeError);
      expect((error as ConfigurationTypeError).code).toBe(
        ErrorCode.CONFIGURATION_INVALID_TYPE,
      );
    }

    expect(() => configuration.getString("obj")).toThrow(
      ConfigurationTypeError,
    );
    expect(configuration.getString("num")).toBe("3");
  });
});

describe("Configuration immutability", () => {
  it("deep-freezes the values tree at construction", () => {
    const configuration = createConfiguration({
      values: { db: { host: "a", nested: { list: [1, 2, { deep: true }] } } },
    });

    const db = configuration.get<Record<string, unknown>>("db")!;
    expect(Object.isFrozen(db)).toBe(true);
    const nested = db.nested as Record<string, unknown>;
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(nested.list)).toBe(true);
    expect(Object.isFrozen((nested.list as unknown[])[2])).toBe(true);
    expect(Object.isFrozen(configuration.entries()[0]!.value)).toBe(true);
  });

  it("toObject() returns an independent deep copy", () => {
    const configuration = createConfiguration({
      values: { db: { host: "a", ports: [1, 2] } },
    });

    const copy = configuration.toObject();
    expect(Object.isFrozen(copy)).toBe(false);
    expect(copy).toEqual({ db: { host: "a", ports: [1, 2] } });

    (copy.db as Record<string, unknown>).host = "evil";
    ((copy.db as Record<string, unknown>).ports as number[]).push(3);

    expect(configuration.get("db.host")).toBe("a");
    expect(configuration.get("db.ports")).toEqual([1, 2]);
    expect(configuration.toObject()).not.toBe(copy);
  });

  it("throws when mutating returned internals in strict mode", () => {
    const configuration = createConfiguration({
      values: { db: { host: "a" } },
    });

    const db = configuration.get<Record<string, unknown>>("db")!;
    expect(() => {
      "use strict";
      (db as Record<string, unknown>).host = "hacked";
    }).toThrow(TypeError);
    expect(configuration.get("db.host")).toBe("a");
  });

  it("with() produces an independent frozen tree", () => {
    const base = createConfiguration({ values: { db: { host: "a" } } });
    const derived = base.with("db.port", 5432);

    expect(base.get("db.port")).toBeUndefined();
    expect(derived.get("db.port")).toBe(5432);
    expect(derived.get("db.host")).toBe("a");
    expect(Object.isFrozen(derived.get("db"))).toBe(true);
  });

  it("without() removes values without touching the original", () => {
    const base = createConfiguration({
      values: { db: { host: "a", port: 1 }, other: true },
    });
    const derived = base.without("db.port");

    expect(derived.get("db.port")).toBeUndefined();
    expect(derived.get("db.host")).toBe("a");
    expect(base.get("db.port")).toBe(1);
  });
});

describe("Configuration per-path sources", () => {
  it("records the source used by with()", () => {
    const configuration = new Configuration({ source: "default" })
      .with("db.host", "envhost", "environment")
      .with("db.port", 5432, "file");

    expect(configuration.getSource("db.host")).toBe("environment");
    expect(configuration.getSource("db.port")).toBe("file");
    expect(configuration.getSource("db")).toBe("mixed");
    expect(configuration.getSource()).toBe("mixed");
  });

  it("reports per-entry sources in entries()", () => {
    const configuration = new Configuration({ source: "default" })
      .with("app.name", "zudo", "file")
      .with("app.port", 1, "file")
      .with("flag", true, "environment");

    const entries = configuration.entries();
    const app = entries.find((entry) => entry.path === "app");
    const flag = entries.find((entry) => entry.path === "flag");

    expect(app?.source).toBe("file");
    expect(flag?.source).toBe("environment");
  });

  it("falls back to the default source when nothing is recorded", () => {
    const configuration = createConfiguration({
      values: { a: 1 },
      source: "file",
    });

    expect(configuration.getSource()).toBe("file");
    expect(configuration.getSource("a")).toBe("file");
    expect(configuration.entries()[0]?.source).toBe("file");
  });

  it("propagates sources through scope()", () => {
    const configuration = new Configuration({ source: "default" }).with(
      "db.host",
      "h",
      "secret",
    );

    const scoped = configuration.scope("db");
    expect(scoped.get("host")).toBe("h");
    expect(scoped.getSource("host")).toBe("secret");
  });
});

describe("Configuration.merge", () => {
  it("deep merges objects while arrays and primitives replace", () => {
    const base = createConfiguration({
      values: {
        db: { host: "localhost", port: 5432 },
        list: [1, 2, 3],
      },
      source: "default",
    });

    const override = createConfiguration({
      values: {
        db: { port: 6543 },
        list: [9],
      },
      source: "environment",
    });

    const merged = base.merge(override);

    /* The db.host preservation case: deep merge keeps it. */
    expect(merged.get("db.host")).toBe("localhost");
    expect(merged.get("db.port")).toBe(6543);
    expect(merged.get("list")).toEqual([9]);
  });

  it("keeps per-path sources from both sides, other wins", () => {
    const base = new Configuration({ source: "default" }).with(
      "a.b",
      1,
      "file",
    );
    const override = new Configuration({ source: "default" }).with(
      "a.c",
      2,
      "environment",
    );

    const merged = base.merge(override);
    expect(merged.getSource("a.b")).toBe("file");
    expect(merged.getSource("a.c")).toBe("environment");
  });

  it("ignores __proto__ keys during merge", () => {
    const polluted = JSON.parse(
      '{"__proto__": {"hacked": true}, "ok": 1}',
    ) as Record<string, never>;
    const base = createConfiguration({ values: { a: 1 } });
    const merged = base.merge(createConfiguration({ values: polluted }));

    expect(merged.get("ok")).toBe(1);
    expect(({} as Record<string, unknown>).hacked).toBeUndefined();
    expect(merged.get("__proto__")).toBeUndefined();
  });
});

describe("Configuration.scope", () => {
  it("returns an empty scoped configuration for non-object paths", () => {
    const configuration = createConfiguration({ values: { a: 1 } });
    const scoped = configuration.scope("a");
    expect(scoped.get("anything")).toBeUndefined();
    expect(scoped.getNamespace()).toBe("a");
  });
});
