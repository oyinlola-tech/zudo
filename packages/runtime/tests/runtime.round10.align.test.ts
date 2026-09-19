import { describe, it, expect } from "vitest";

import type { Module } from "@zudojs/core";

import { createTestRuntime } from "../src/testRuntime/testRuntime.core.js";

describe("runtime/X-01", () => {
  it("destroys a module whose onInitialize threw, like @zudojs/lifecycle and core", async () => {
    const log: string[] = [];
    const db = {
      id: "db",
      name: "db",
      onInitialize: () => {
        log.push("db.init");
        throw new Error("half-open pool");
      },
      onReady: () => void log.push("db.ready"),
      onDestroy: () => void log.push("db.destroy"),
    } as Module;
    const later = {
      id: "later",
      name: "later",
      dependencies: ["db"],
      onDestroy: () => void log.push("later.destroy"),
    } as Module;

    const rt = createTestRuntime([db, later]);
    await expect(rt.start()).rejects.toThrow(/initialization/);

    expect(log).toEqual(["db.init", "db.destroy"]);
  });
});
