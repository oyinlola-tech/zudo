import type { Plugin } from "../pluginTypes/plugin.type.js";

import { PluginDependencyError } from "@zudojs/errors";

/** A parsed semantic version. */
interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string;
}

const SEMVER_PATTERN =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const RANGE_PATTERN = /^\s*(\^|~|>=|<=|>|<|=)?\s*(.+?)\s*$/;

/**
 * Parses a semantic version, returning `undefined` if it is not one.
 */
export function parseVersion(version: string): SemVer | undefined {
  const match = SEMVER_PATTERN.exec(version.trim());

  if (!match) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
}

/**
 * Compares two versions. Prerelease versions sort below their release.
 */
export function compareVersions(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === undefined) return 1;
  if (b.prerelease === undefined) return -1;

  return a.prerelease < b.prerelease ? -1 : 1;
}

/**
 * Tests a version against a range.
 *
 * Supports the range forms a plugin manifest realistically uses:
 * exact (`1.2.3`), caret (`^1.2.3`), tilde (`~1.2.3`), comparators
 * (`>=1.2.3`, `>`, `<=`, `<`), and `*` for any version. An
 * unrecognisable range is reported by the caller rather than silently
 * passing.
 */
export function satisfiesVersion(
  version: string,
  range: string,
): boolean | undefined {
  const trimmedRange = range.trim();

  if (trimmedRange === "*" || trimmedRange === "" || trimmedRange === "x") {
    return true;
  }

  const actual = parseVersion(version);
  if (!actual) {
    return undefined;
  }

  const match = RANGE_PATTERN.exec(trimmedRange);
  if (!match) {
    return undefined;
  }

  const operator = match[1] ?? "=";
  const expected = parseVersion(match[2] ?? "");

  if (!expected) {
    return undefined;
  }

  const comparison = compareVersions(actual, expected);

  switch (operator) {
    case "=":
      return comparison === 0;
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    case "^": {
      if (comparison < 0) return false;
      // Caret allows changes that do not modify the left-most non-zero
      // element, matching npm's semantics for 0.x versions.
      if (expected.major > 0) return actual.major === expected.major;
      if (expected.minor > 0)
        return actual.major === 0 && actual.minor === expected.minor;
      return (
        actual.major === 0 &&
        actual.minor === 0 &&
        actual.patch === expected.patch
      );
    }
    case "~": {
      if (comparison < 0) return false;
      return actual.major === expected.major && actual.minor === expected.minor;
    }
    default:
      return undefined;
  }
}

/**
 * Verifies every declared dependency version constraint.
 *
 * A dependency that declares no `version` is unconstrained. A plugin
 * whose own `metadata.version` is missing cannot be checked, so a
 * constraint against it is reported rather than quietly passing.
 *
 * @throws {PluginDependencyError} on the first unsatisfied constraint.
 */
export function assertDependencyVersions(
  plugins: ReadonlyMap<string, Plugin>,
): void {
  for (const [name, plugin] of plugins) {
    const declared = [
      ...(plugin.dependencies ?? []),
      ...(plugin.optionalDependencies ?? []),
    ];

    for (const dependency of declared) {
      if (dependency.version === undefined) {
        continue;
      }

      const target = plugins.get(dependency.name);
      if (!target) {
        // Absent optional dependencies are not a version problem.
        continue;
      }

      const actual = target.metadata.version;

      if (actual === undefined) {
        throw new PluginDependencyError(name, dependency.name, {
          metadata: {
            reason: `Plugin "${name}" requires "${dependency.name}@${dependency.version}", but that plugin declares no version.`,
          },
        });
      }

      const satisfied = satisfiesVersion(actual, dependency.version);

      if (satisfied === undefined) {
        throw new PluginDependencyError(name, dependency.name, {
          metadata: {
            reason: `Plugin "${name}" declares an unsupported version range "${dependency.version}" for "${dependency.name}".`,
          },
        });
      }

      if (!satisfied) {
        throw new PluginDependencyError(name, dependency.name, {
          metadata: {
            reason: `Plugin "${name}" requires "${dependency.name}@${dependency.version}", but version ${actual} is registered.`,
          },
        });
      }
    }
  }
}
