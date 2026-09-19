/**
 * Architecture boundary checker for Zudojs.
 *
 * Validates:
 * 1. No package depends on a package from a higher tier.
 * 2. No circular dependencies exist.
 *    Both follow dependencies and peerDependencies.
 * 3. All internal @zudojs/* dependencies use the "workspace:*" protocol.
 * 4. No workflow templates an untrusted `${{ }}` field into a run: script.
 * 5. AGENTS.md size rules (warnings; errors with --strict-sizes).
 *
 * Run with: node architect:check.js
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { TIERS, packageNameToKey } from "./package-tiers.js";
import {
  checkInstallScript,
  checkWorkflowInjection,
  collectSizeViolations,
} from "./workflow-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const packagesDir = join(rootDir, "packages");
const strictSizes = process.argv.includes("--strict-sizes");


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
          private: pkg.private === true,
          dependencies: pkg.dependencies || {},
          peerDependencies: pkg.peerDependencies || {},
          devDependencies: pkg.devDependencies || {},
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

// The edges the tier and cycle checks follow.
//
// peerDependencies count: a peer is a runtime requirement the consumer must
// satisfy, so declaring an upward edge as a peer instead of a dependency is
// still an upward edge. Ignoring peers let tenancy and permissions (tier 1)
// declare @zudojs/http (tier 3) without the gate noticing. devDependencies
// are excluded on purpose: tests may exercise a package against a higher tier.
function runtimeDependencyNames(pkg) {
  return [
    ...new Set([
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.peerDependencies),
    ]),
  ];
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

    const deps = runtimeDependencyNames(pkg);

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
    const deps = runtimeDependencyNames(pkg).filter((d) =>
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
  const injections = checkWorkflowInjection(join(rootDir, ".github", "workflows"));
  const sizes = collectSizeViolations(packagesDir, rootDir);
  const installErrors = checkInstallScript(join(rootDir, "install-all.sh"), packages);

  let hasErrors = false;

  if (injections.length > 0) {
    console.log("❌ Workflow Script Injection:");
    for (const error of injections) {
      console.log(`  - ${error}`);
    }
    console.log();
    hasErrors = true;
  }

  if (installErrors.length > 0) {
    console.log("❌ install-all.sh Drift:");
    for (const error of installErrors) {
      console.log(`  - ${error}`);
    }
    console.log();
    hasErrors = true;
  }

  if (sizes.length > 0) {
    console.log(
      `${strictSizes ? "❌" : "⚠️ "} AGENTS.md size rules: ${sizes.length} breach(es)` +
        (strictSizes ? "" : " (warning; pass --strict-sizes to fail)"),
    );
    const shown = strictSizes ? sizes : sizes.slice(0, 10);
    for (const breach of shown) {
      console.log(`  - ${breach}`);
    }
    if (shown.length < sizes.length) {
      console.log(`  … and ${sizes.length - shown.length} more (run with --strict-sizes to list all)`);
    }
    console.log();
    if (strictSizes) hasErrors = true;
  }

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
    console.log("   - No untrusted fields templated into workflow scripts");
    process.exit(0);
  } else {
    console.log("❌ Architecture check failed.");
    process.exit(1);
  }
}

main();
