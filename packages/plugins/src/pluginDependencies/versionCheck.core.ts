import type { Plugin } from "../pluginTypes/plugin.type.js";

import { PluginDependencyError } from "@zudojs/errors";

/**
 * A dependency that is registered but whose version does not satisfy the
 * declared constraint.
 *
 * `PluginDependencyError` hardcodes the message "...which is not
 * registered" and replaces any `metadata` it is handed, so the reason a
 * version check failed could never reach the operator: every version
 * mismatch was reported as a missing plugin. This subclass keeps the
 * type — existing `instanceof PluginDependencyError` handlers still
 * match — and replaces the message with one that names the requirement,
 * what is actually registered, and what to do about it.
 */
export class PluginDependencyVersionError extends PluginDependencyError {
  /** The plugin that declared the constraint. */
  public readonly requiredBy: string;

  /** The dependency whose version was checked. */
  public readonly dependencyName: string;

  /** The declared range, e.g. `^2.0.0`. */
  public readonly required: string;

  /** The version actually registered, if it declared one. */
  public readonly actual: string | undefined;

  public constructor(
    requiredBy: string,
    dependencyName: string,
    required: string,
    actual: string | undefined,
    reason: string,
  ) {
    super(requiredBy, dependencyName);

    this.name = "PluginDependencyVersionError";
    this.message = reason;
    this.requiredBy = requiredBy;
    this.dependencyName = dependencyName;
    this.required = required;
    this.actual = actual;
  }
}

/**
 * A parsed semantic version.
 *
 * Exported because {@link parseVersion} returns one and
 * {@link compareVersions} accepts two: a consumer that cannot name the
 * type cannot use either function from TypeScript.
 */
export interface SemVer {
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
        throw new PluginDependencyVersionError(
          name,
          dependency.name,
          dependency.version,
          undefined,
          `Plugin "${name}" requires "${dependency.name}@${dependency.version}", but "${dependency.name}" declares no version. Add a "version" to that plugin's metadata, or drop the constraint from "${name}".`,
        );
      }

      const satisfied = satisfiesVersion(actual, dependency.version);

      if (satisfied === undefined) {
        throw new PluginDependencyVersionError(
          name,
          dependency.name,
          dependency.version,
          actual,
          `Plugin "${name}" declares an unsupported version range "${dependency.version}" for "${dependency.name}". Supported forms are an exact version (1.2.3), a caret or tilde range (^1.2.3, ~1.2.3), a comparator (>=1.2.3, >, <=, <) or "*".`,
        );
      }

      if (!satisfied) {
        throw new PluginDependencyVersionError(
          name,
          dependency.name,
          dependency.version,
          actual,
          `Plugin "${name}" requires "${dependency.name}@${dependency.version}", but version ${actual} is registered. Register a "${dependency.name}" that satisfies ${dependency.version}, relax the constraint on "${name}", or construct the manager with { checkVersions: false }.`,
        );
      }
    }
  }
}
