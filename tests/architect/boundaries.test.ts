import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error - plain JS module, single source of truth for tiers
import { TIERS, packageNameToKey } from "../../scripts/package-tiers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(__dirname, "../../packages");


function getPackages() {
  const entries = readdirSync(packagesDir, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const packageJsonPath = join(packagesDir, entry.name, "package.json");
      if (existsSync(packageJsonPath)) {
        const content = readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        packages.push({
          dir: entry.name,
          name: pkg.name,
          dependencies: pkg.dependencies || {},
          peerDependencies: pkg.peerDependencies || {},
        });
      }
    }
  }

  return packages;
}

describe("Architecture Boundaries", () => {
  const packages = getPackages();

  it("uses the workspace protocol for every internal dependency", () => {
    const errors = [];

    for (const pkg of packages) {
      const allDeps = { ...pkg.dependencies, ...pkg.peerDependencies };

      for (const [depName, version] of Object.entries(allDeps)) {
        if (!depName.startsWith("@zudojs/") && depName !== "zudojs-cli") {
          continue;
        }

        // A hand-written range resolves the sibling from the npm registry
        // rather than from source, so dependents compile against a
        // published artifact and local changes go unvalidated.
        if (!String(version).startsWith("workspace:")) {
          errors.push(`${pkg.name}: ${depName} is "${version}"`);
        }
      }
    }

    expect(
      errors,
      `Internal dependencies must use "workspace:*":\n${errors.join("\n")}`,
    ).toEqual([]);
  });

  it("has no tier violations in regular dependencies", () => {
    const errors = [];

    for (const pkg of packages) {
      const pkgKey = packageNameToKey(pkg.name);
      const pkgTier = TIERS[pkgKey];

      if (pkgTier === undefined) {
        errors.push(`Unknown tier for ${pkg.name}`);
        continue;
      }

      for (const depName of Object.keys(pkg.dependencies)) {
        if (!depName.startsWith("@zudojs/")) continue;

        const depKey = packageNameToKey(depName);
        const depTier = TIERS[depKey];

        if (depTier === undefined) {
          errors.push(`Unknown dependency tier: ${pkg.name} → ${depName}`);
          continue;
        }

        if (depTier > pkgTier) {
          errors.push(
            `${pkg.name} (tier ${pkgTier}) → ${depName} (tier ${depTier})`,
          );
        }
      }
    }

    expect(errors, `Tier violations found:\n${errors.join("\n")}`).toEqual([]);
  });

  it("has no circular dependencies", () => {
    const graph = new Map();
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    for (const pkg of packages) {
      const deps = Object.keys(pkg.dependencies).filter((d) =>
        d.startsWith("@zudojs/"),
      );
      graph.set(pkg.name, deps);
    }

    function dfs(node, path) {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path, neighbor]);
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          const cycle = [...path.slice(cycleStart), neighbor];
          cycles.push(cycle.join(" → "));
        }
      }

      recursionStack.delete(node);
    }

    for (const pkg of packages) {
      if (!visited.has(pkg.name)) {
        dfs(pkg.name, [pkg.name]);
      }
    }

    expect(
      cycles,
      `Circular dependencies found:\n${cycles.join("\n")}`,
    ).toEqual([]);
  });

  it("all packages have known tiers", () => {
    const unknown = [];

    for (const pkg of packages) {
      const key = packageNameToKey(pkg.name);
      if (TIERS[key] === undefined) {
        unknown.push(`${pkg.name} (key: ${key})`);
      }
    }

    expect(unknown, `Unknown tiers:\n${unknown.join("\n")}`).toEqual([]);
  });
});
