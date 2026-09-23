/**
 * Post-1.2.0 regression: extending the default redaction fields must never
 * redact less than the defaults do.
 */
import { DEFAULT_LOGGER_SECRET_FIELDS } from "@zudojs/logger";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SENSITIVE_FIELDS,
  createObservability,
  isSensitiveField,
  redactObject,
  type LogRecord,
  type RedactionConfig,
} from "../src/index.js";

const LOGGER_ONLY_NAMES = ["jwt", "sid", "pwd", "passphrase", "bearer"];

describe("DEFAULT_SENSITIVE_FIELDS is the effective default list", () => {
  it("contains every @zudojs/logger default secret field", () => {
    for (const field of DEFAULT_LOGGER_SECRET_FIELDS) {
      expect(DEFAULT_SENSITIVE_FIELDS).toContain(field);
    }
  });

  it("has no duplicates and is frozen", () => {
    expect(new Set(DEFAULT_SENSITIVE_FIELDS).size).toBe(
      DEFAULT_SENSITIVE_FIELDS.length,
    );
    expect(Object.isFrozen(DEFAULT_SENSITIVE_FIELDS)).toBe(true);
  });

  it("covers the names the default matcher redacts", () => {
    for (const name of LOGGER_ONLY_NAMES) {
      expect(DEFAULT_SENSITIVE_FIELDS).toContain(name);
    }
  });
});

describe("`fields` extends the defaults", () => {
  it("spreading the defaults keeps jwt / sid / pwd / passphrase / bearer", () => {
    const input = Object.fromEntries(LOGGER_ONLY_NAMES.map((n) => [n, "x"]));
    const out = redactObject(input, { fields: [...DEFAULT_SENSITIVE_FIELDS] });
    for (const name of LOGGER_ONLY_NAMES) {
      expect(out[name]).toBe("[REDACTED]");
    }
  });

  it("an extended list is never weaker than the default", () => {
    const extended: RedactionConfig = {
      fields: [...DEFAULT_SENSITIVE_FIELDS, "nationalId"],
    };
    const names = [
      ...DEFAULT_SENSITIVE_FIELDS,
      "userpassword",
      "accesstoken",
      "sessionId",
      "x-api-key",
      "Bearer",
    ];
    for (const name of names) {
      if (isSensitiveField(name)) {
        expect(isSensitiveField(name, extended)).toBe(true);
      }
    }
    expect(isSensitiveField("nationalId", extended)).toBe(true);
    expect(isSensitiveField("nationalId")).toBe(false);
  });

  it("a short list adds to the defaults instead of replacing them", () => {
    const out = redactObject(
      { nationalId: "1", password: "p", jwt: "j", userpassword: "u" },
      { fields: ["nationalId"] },
    );
    expect(out).toEqual({
      nationalId: "[REDACTED]",
      password: "[REDACTED]",
      jwt: "[REDACTED]",
      userpassword: "[REDACTED]",
    });
  });

  it("exact mode also keeps the default names", () => {
    const config: RedactionConfig = { fields: ["nationalId"], matchMode: "exact" };
    expect(isSensitiveField("jwt", config)).toBe(true);
    expect(isSensitiveField("nationalid", config)).toBe(true);
  });

  it("replaceDefaults: true uses the given list alone", () => {
    const config: RedactionConfig = { fields: ["ssn"], replaceDefaults: true };
    const out = redactObject({ ssn: "1", password: "p", jwt: "j" }, config);
    expect(out).toEqual({ ssn: "[REDACTED]", password: "p", jwt: "j" });
  });

  it("replaceDefaults without fields keeps the defaults", () => {
    expect(isSensitiveField("jwt", { replaceDefaults: true })).toBe(true);
  });

  it("the facade logger applies the extended list", async () => {
    const records: LogRecord[] = [];
    const obs = createObservability({
      serviceName: "postrelease",
      useConsoleExporters: false,
      logExporter: { export: async (batch) => void records.push(...batch) },
      redaction: { fields: ["nationalId"] },
    });
    obs.logger.info("x", { nationalId: "1", jwt: "j", user: "ada" });
    await obs.shutdown();
    expect(records[0]?.context).toMatchObject({
      nationalId: "[REDACTED]",
      jwt: "[REDACTED]",
      user: "ada",
    });
  });
});
