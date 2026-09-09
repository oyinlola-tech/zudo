/**
 * zudojs-cli — Manifest Manager Tests
 *
 * Tests for ManifestManager.
 */

import { describe, it, expect } from "vitest";
import { ManifestManager } from "../src/manifest/manifestManager.core.js";

describe("ManifestManager", () => {
  it("creates a manifest file", async () => {
    const manager = new ManifestManager("/tmp/test-manifest-" + Date.now());

    await manager.create({
      version: "1",
      architecture: "monolith",
      capabilities: ["cqrs"],
    });

    const manifest = await manager.read();
    expect(manifest).not.toBeNull();
    expect(manifest!.version).toBe("1");
    expect(manifest!.architecture).toBe("monolith");
    expect(manifest!.capabilities).toEqual(["cqrs"]);
  });

  it("returns null when manifest does not exist", async () => {
    const manager = new ManifestManager("/tmp/nonexistent-" + Date.now());
    const manifest = await manager.read();
    expect(manifest).toBeNull();
  });

  it("adds capability to existing manifest", async () => {
    const manager = new ManifestManager("/tmp/test-manifest-cap-" + Date.now());

    await manager.create({
      version: "1",
      architecture: "monolith",
      capabilities: ["cqrs"],
    });

    await manager.addCapability("events");
    const manifest = await manager.read();
    expect(manifest!.capabilities).toEqual(["cqrs", "events"]);
  });
});
