import { describe, it, expect } from "vitest";

import { resolveRuntimeOptions } from "../src/index.js";

describe("LEAF-16", () => {
  const modeFor = (NODE_ENV: string | undefined): string =>
    resolveRuntimeOptions({ environment: { variables: { NODE_ENV } } }).mode;

  it("derives the default mode from NODE_ENV like @zudojs/constants", () => {
    expect(modeFor("production")).toBe("production");
    expect(modeFor("prod")).toBe("production");
    expect(modeFor("Production")).toBe("production");
    expect(modeFor("staging")).toBe("production");
    expect(modeFor("test")).toBe("test");
    expect(modeFor("dev")).toBe("development");
    expect(modeFor(undefined)).toBe("development");
  });

  it("an explicit mode still wins", () => {
    expect(
      resolveRuntimeOptions({
        mode: "development",
        environment: { variables: { NODE_ENV: "production" } },
      }).mode,
    ).toBe("development");
  });
});

describe("CV-05 (core)", () => {
  it("reports a provider without setConfiguration() as a process warning", async () => {
    const { vi } = await import("vitest");
    const { ConfigurationManager, DefaultConfigurationProvider } =
      await import("../src/index.js");
    const inner = new DefaultConfigurationProvider();
    const provider = {
      getConfiguration: () => inner.getConfiguration(),
      get: <T>(path: string) => inner.get<T>(path),
      require: <T>(path: string) => inner.require<T>(path),
      getByKey: inner.getByKey.bind(inner),
      requireByKey: inner.requireByKey.bind(inner),
      has: (path: string) => inner.has(path),
      reload: () => inner.reload(),
      getSources: () => inner.getSources(),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    try {
      await new ConfigurationManager({ provider }).initialize();
      expect(warn).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(
        expect.stringContaining("setConfiguration()"),
        expect.objectContaining({ code: "ZUDOJS_CONFIG_PROVIDER_NO_SET" }),
      );
    } finally {
      warn.mockRestore();
      emit.mockRestore();
    }
  });
});
