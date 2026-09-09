/**
 * Architecture boundary checker for Zudojs.
 *
 * Validates:
 * 1. No package depends on a package from a higher tier.
 * 2. No circular dependencies exist.
 * 3. All internal @zudojs/* dependencies use the "workspace:*" protocol.
 *
 * Run with: node architect:check.js
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { TIERS, packageNameToKey } from "./package-tiers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(__dirname, "..", "packages");


// Read all package directories
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

// Check that internal dependencies use the workspace protocol.
//
// Internal deps must be "workspace:*". A hand-written version range makes
// pnpm resolve the sibling from the npm registry instead of from source,
// so local changes are invisible to dependents and the build validates a
// published artifact rather than the working tree. pnpm rewrites
// "workspace:*" to the concrete version at publish time.
function checkWorkspaceProtocol(packages) {
  const errors = [];

  for (const pkg of packages) {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      ...pkg.devDependencies,
    };

    for (const [depName, version] of Object.entries(allDeps)) {
      if (!depName.startsWith("@zudojs/") && depName !== "zudojs-cli") continue;

      if (!String(version).startsWith("workspace:")) {
        errors.push(
          `${pkg.name}: ${depName} is "${version}". Internal dependencies must use "workspace:*".`,
        );
      }
    }
  }

  return errors;
}

// Check tier violations
function checkTierViolations(packages) {
  const errors = [];

  for (const pkg of packages) {
    const pkgKey = packageNameToKey(pkg.name);
    const pkgTier = TIERS[pkgKey];

    if (pkgTier === undefined) {
      errors.push(`Unknown package tier for ${pkg.name} (key: ${pkgKey})`);
      continue;
    }

    const deps = Object.keys(pkg.dependencies);

    for (const depName of deps) {
      if (!depName.startsWith("@zudojs/")) continue;

      const depKey = packageNameToKey(depName);
      const depTier = TIERS[depKey];

      if (depTier === undefined) {
        errors.push(`Unknown dependency tier: ${pkg.name} → ${depName}`);
        continue;
      }

      if (depTier > pkgTier) {
        errors.push(
          `Tier violation: ${pkg.name} (tier ${pkgTier}) depends on ${depName} (tier ${depTier})`,
        );
      }
    }
  }

  return errors;
}

// Check for circular dependencies
function checkCircularDependencies(packages) {
  const graph = new Map();
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];

  // Build adjacency list
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

  return cycles;
}

// Main
function main() {
  console.log("Running Zudojs architecture boundary check...\n");

  const packages = getPackages();
  console.log(`Found ${packages.length} packages.\n`);

  const versionErrors = checkWorkspaceProtocol(packages);
  const tierViolations = checkTierViolations(packages);
  const cycles = checkCircularDependencies(packages);

  let hasErrors = false;

  if (versionErrors.length > 0) {
    console.log("❌ Internal Dependency Protocol Errors:");
    for (const error of versionErrors) {
      console.log(`  - ${error}`);
    }
    console.log();
    hasErrors = true;
  }

  if (tierViolations.length > 0) {
    console.log("❌ Tier Violations:");
    for (const error of tierViolations) {
      console.log(`  - ${error}`);
    }
    console.log();
    hasErrors = true;
  }

  if (cycles.length > 0) {
    console.log("❌ Circular Dependencies:");
    for (const cycle of cycles) {
      console.log(`  - ${cycle}`);
    }
    console.log();
    hasErrors = true;
  }

  if (!hasErrors) {
    console.log("✅ All architecture checks passed.");
    console.log("   - All internal dependencies use workspace:*");
    console.log("   - No tier violations");
    console.log("   - No circular dependencies");
    process.exit(0);
  } else {
    console.log("❌ Architecture check failed.");
    process.exit(1);
  }
}

main();
