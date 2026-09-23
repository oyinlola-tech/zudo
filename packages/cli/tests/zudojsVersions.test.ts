/**
 * The generated @zudojs version map must match the workspace, and every
 * generated package.json must use it.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ZUDOJS_FALLBACK_VERSION_RANGE,
  ZUDOJS_PACKAGE_VERSIONS,
  zudojsDependencies,
  zudojsVersionRange,
} from "../src/constants/index.js";

const PACKAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function workspaceVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    const manifest = join(PACKAGES_DIR, entry.name, "package.json");
    if (!entry.isDirectory() || !existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf-8")) as { name?: string; version?: string; private?: boolean };
    if (pkg.name?.startsWith("@zudojs/") && pkg.private !== true && pkg.version) {
      versions[pkg.name] = pkg.version;
    }
  }
  return versions;
}

describe("ZUDOJS_PACKAGE_VERSIONS", () => {
  it("is not stale: it matches every @zudojs package.json in the workspace", () => {
    // Regenerate with: node scripts/generateZudojsVersions.mjs
    expect({ ...ZUDOJS_PACKAGE_VERSIONS }).toEqual(workspaceVersions());
  });

  it("covers the packages generated projects depend on", () => {
    for (const name of ["@zudojs/http", "@zudojs/testing", "@zudojs/schema", "@zudojs/config", "@zudojs/runtime"]) {
      expect(ZUDOJS_PACKAGE_VERSIONS[name], name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("renders caret ranges on the targeted version", () => {
    const http = ZUDOJS_PACKAGE_VERSIONS["@zudojs/http"];
    expect(zudojsVersionRange("@zudojs/http")).toBe(`^${http}`);
    expect(zudojsVersionRange("@zudojs/not-a-package")).toBe(ZUDOJS_FALLBACK_VERSION_RANGE);
    expect(zudojsVersionRange("constructor")).toBe(ZUDOJS_FALLBACK_VERSION_RANGE);
    expect(zudojsDependencies(["@zudojs/http", "@zudojs/http"])).toEqual({ "@zudojs/http": `^${http}` });
  });
});
