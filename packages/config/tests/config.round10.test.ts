/**
 * Regression tests for the round-10 audit findings (data/CONFIG-*).
 */

import { describe, it, expect } from "vitest";

import {
  ConfigValueType,
  createConfigManager,
  createEnvironmentConfigSource,
  createMemoryConfigSource,
  parseConfigNumber,
  toConfigJsonValue,
  configValueToString,
} from "../src/index.js";

const STRING = { type: ConfigValueType.STRING } as const;

describe("CONFIG-01", () => {
  it("redacts a secret declared on a nested schema property", async () => {
    const manager = createConfigManager({
      sources: [
        createMemoryConfigSource(
          { db: { host: "h", password: "s3cret" } },
          { name: "m" },
        ),
      ],
    });
    await manager.load();
    manager.validate({
      properties: {
        db: {
          type: ConfigValueType.OBJECT,
          properties: { host: STRING, password: { ...STRING, secret: true } },
        },
      },
    });
    expect(JSON.stringify(manager.toSafeObject())).not.toContain("s3cret");
  });

  it("redacts a dotted secret key whose value sits in a nested entry", async () => {
    const manager = createConfigManager({
      sources: [
        createMemoryConfigSource({ db: { pw: "s3cret-dotted" } }, { name: "m" }),
      ],
    });
    await manager.load();
    manager.validate({
      properties: { "db.pw": { ...STRING, secret: true } },
      additionalProperties: true,
    });
    expect(JSON.stringify(manager.toSafeObject())).not.toContain("s3cret");
  });
});

describe("CONFIG-02", () => {
  it("redacts sensitive names and credential URLs from every source", async () => {
    const manager = createConfigManager({
      sources: [
        createMemoryConfigSource({
          "db.password": "hunter2",
          api_key: "sk_live_x",
          nested: { token: "tok" },
        }, { name: "m" }),
        createEnvironmentConfigSource({
          env: { DATABASE_URL: "postgres://u:pw@h/db", SESSION_KEY: "k" },
          name: "env",
        }),
      ],
    });
    await manager.load();
    const safe = JSON.stringify(manager.toSafeObject());
    for (const leaked of ["hunter2", "sk_live_x", "tok", "u:pw@", '"k"']) {
      expect(safe).not.toContain(leaked);
    }
  });
});

describe("CONFIG-03", () => {
  it("reload drops a value a higher-priority source stopped providing", async () => {
    const overrides: Record<string, string> = { flag: "on" };
    const manager = createConfigManager({
      sources: [
        createMemoryConfigSource({ flag: "off" }, { name: "d", priority: 0 }),
        createMemoryConfigSource(overrides, { name: "o", priority: 50 }),
      ],
    });
    await manager.load();
    expect(manager.get("flag")).toBe("on");
    delete overrides.flag;
    await manager.reload();
    expect(manager.get("flag")).toBe("off");
  });
});

describe("CONFIG-04", () => {
  it("toConfigJsonValue keeps an own __proto__ key and the plain prototype", () => {
    const hostile = JSON.parse('{"name":"x","__proto__":{"isAdmin":true}}');
    const json = toConfigJsonValue(hostile) as Record<string, unknown>;
    expect(Object.getPrototypeOf(json)).toBe(Object.prototype);
    expect(Object.hasOwn(json, "__proto__")).toBe(true);
    expect((json as { isAdmin?: boolean }).isAdmin).toBeUndefined();
    expect(configValueToString(hostile)).toContain("__proto__");
  });
});

describe("CONFIG-06", () => {
  it("number parsing accepts decimals only", async () => {
    expect(parseConfigNumber("0x1F90")).toBeUndefined();
    expect(parseConfigNumber("0b11")).toBeUndefined();
    expect(parseConfigNumber("0o17")).toBeUndefined();
    expect(parseConfigNumber(" 8080 ")).toBe(8080);
    expect(parseConfigNumber("-1.5e3")).toBe(-1500);
    const manager = createConfigManager({ initialValues: { port: "0x1F90" } });
    expect(() => manager.number("port")).toThrow();
  });
});
