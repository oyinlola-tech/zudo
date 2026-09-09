import type { ModuleId } from "../module.js";

import type {
  ModuleDependency,
  ModuleDependencies,
  ModuleDependencyNode,
  ModuleDependencyGraph,
  ModuleDependencyInput,
  ModuleDependencyNodeInput,
} from "./moduleDependency.type.js";

import {
  InvalidModuleDependencyError,
  ModuleVersionMismatchError,
} from "../moduleError/moduleError.dependency.js";

import { InvalidModuleDefinitionError } from "../moduleError/moduleError.registration.js";

/**
 * Normalizes a dependency declaration.
 */
export function normalizeModuleDependency(
  dependency: ModuleDependencyInput,
): ModuleDependency {
  if (typeof dependency === "string") {
    const id = dependency.trim();

    if (!id) {
      throw new InvalidModuleDependencyError(
        "Module dependency id cannot be empty.",
      );
    }

    return Object.freeze({
      id,
      optional: false,
    });
  }

  const id = dependency.id?.trim();

  if (!id) {
    throw new InvalidModuleDependencyError(
      "Module dependency id cannot be empty.",
    );
  }

  return Object.freeze({
    id,
    optional: dependency.optional ?? false,
    version: normalizeVersionConstraint(dependency.version),
  });
}

/**
 * Normalizes a list of dependency declarations.
 */
export function normalizeModuleDependencies(
  dependencies: readonly ModuleDependencyInput[] | undefined,
): ModuleDependencies {
  if (!dependencies || dependencies.length === 0) {
    return [];
  }

  const normalized: ModuleDependency[] = [];

  const seen = new Set<ModuleId>();

  for (const dependency of dependencies) {
    const item = normalizeModuleDependency(dependency);

    if (seen.has(item.id)) {
      throw new InvalidModuleDependencyError(
        `Module dependency "${item.id}" is declared more than once.`,
        { dependencyId: item.id },
      );
    }

    seen.add(item.id);
    normalized.push(item);
  }

  return Object.freeze(normalized);
}

/**
 * Validates dependencies declared by a module.
 */
export function validateModuleDependencies(
  moduleId: ModuleId,
  dependencies: ModuleDependencies,
): void {
  const normalizedModuleId = moduleId.trim();

  if (!normalizedModuleId) {
    throw new InvalidModuleDefinitionError("Module id cannot be empty.");
  }

  for (const dependency of dependencies) {
    if (dependency.id === normalizedModuleId) {
      throw new InvalidModuleDependencyError(
        `Module "${normalizedModuleId}" cannot depend on itself.`,
        { moduleId: normalizedModuleId, dependencyId: dependency.id },
      );
    }

    if (
      dependency.version !== undefined &&
      !isValidVersionConstraint(dependency.version)
    ) {
      throw new InvalidModuleDependencyError(
        `Invalid version constraint "${dependency.version}" for module dependency "${dependency.id}".`,
        { moduleId: normalizedModuleId, dependencyId: dependency.id },
      );
    }
  }
}

/**
 * Creates a dependency graph from module dependency nodes.
 *
 * This function validates duplicate nodes and self-dependencies,
 * but deliberately does not perform topological sorting.
 */
export function createModuleDependencyGraph(
  nodes: readonly ModuleDependencyNodeInput[],
): ModuleDependencyGraph {
  const nodeMap = new Map<ModuleId, ModuleDependencyNode>();

  for (const node of nodes) {
    const id = node.id.trim();

    if (!id) {
      throw new InvalidModuleDefinitionError(
        "Module dependency graph nodes require a non-empty id.",
      );
    }

    if (nodeMap.has(id)) {
      throw new InvalidModuleDefinitionError(
        `Module "${id}" appears more than once in the dependency graph.`,
        id,
      );
    }

    const dependencies = normalizeModuleDependencies(node.dependencies);

    validateModuleDependencies(id, dependencies);

    nodeMap.set(
      id,
      Object.freeze({
        id,
        dependencies,
        version: node.version,
      }),
    );
  }

  /*
   * Version constraints are enforced while building the graph:
   * every dependency with a declared constraint must be satisfied
   * by the dependency module's declared version.
   */
  for (const node of nodeMap.values()) {
    for (const dependency of node.dependencies) {
      if (dependency.version === undefined) continue;

      const target = nodeMap.get(dependency.id);
      if (!target) continue;

      if (
        !satisfiesModuleVersionConstraint(dependency.version, target.version)
      ) {
        throw new ModuleVersionMismatchError(
          dependency.id,
          dependency.version,
          target.version,
        );
      }
    }
  }

  const readonlyNodes = new Map(nodeMap);

  return {
    nodes: readonlyNodes,

    getDependencies(moduleId: ModuleId): ModuleDependencies {
      return readonlyNodes.get(moduleId)?.dependencies ?? [];
    },

    hasModule(moduleId: ModuleId): boolean {
      return readonlyNodes.has(moduleId);
    },

    getDependents(moduleId: ModuleId): readonly ModuleId[] {
      const dependents: ModuleId[] = [];

      for (const node of readonlyNodes.values()) {
        if (
          node.dependencies.some((dependency) => dependency.id === moduleId)
        ) {
          dependents.push(node.id);
        }
      }

      return dependents;
    },
  };
}

/**
 * Validates that all required dependencies exist.
 *
 * Optional dependencies are intentionally ignored when missing.
 */
export function validateModuleDependencyGraph(
  graph: ModuleDependencyGraph,
): readonly ModuleId[] {
  const missing: ModuleId[] = [];

  for (const node of graph.nodes.values()) {
    for (const dependency of node.dependencies) {
      if (dependency.optional) {
        continue;
      }

      if (!graph.hasModule(dependency.id)) {
        missing.push(dependency.id);
      }
    }
  }

  return Object.freeze([...new Set(missing)]);
}

/**
 * Creates a dependency declaration.
 */
export function createModuleDependency(
  id: ModuleId,
  options: {
    readonly optional?: boolean;
    readonly version?: string;
  } = {},
): ModuleDependency {
  return normalizeModuleDependency({
    id,
    optional: options.optional ?? false,
    version: options.version,
  });
}

/**
 * Checks whether a dependency is optional.
 */
export function isOptionalModuleDependency(
  dependency: ModuleDependency,
): boolean {
  return dependency.optional;
}

/**
 * Checks whether a dependency has a version constraint.
 */
export function hasModuleVersionConstraint(
  dependency: ModuleDependency,
): boolean {
  return dependency.version !== undefined;
}

/**
 * Normalizes a semantic version constraint.
 *
 * This is intentionally lightweight. Full version-range
 * resolution belongs to a higher-level package.
 */
function normalizeVersionConstraint(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Basic validation for supported version constraints.
 *
 * Examples:
 *
 * 1.0.0
 * ^1.0.0
 * ~1.2.0
 * >=1.0.0
 * <=2.0.0
 * >1.0.0
 * <2.0.0
 */
function isValidVersionConstraint(value: string): boolean {
  return /^(?:[<>=~^]*\s*)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\s*)$/.test(
    value,
  );
}

interface ParsedSemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string;
}

/**
 * Parses a semantic version string.
 */
function parseSemanticVersion(
  value: string,
): ParsedSemanticVersion | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(
    value.trim(),
  );

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
 * Compares two parsed semantic versions.
 *
 * Returns a negative value when a < b, zero when equal, and a
 * positive value when a > b. Prerelease identifiers sort below
 * their release version but are not compared to each other in
 * detail; this is a deliberately simple comparison.
 */
function compareSemanticVersions(
  a: ParsedSemanticVersion,
  b: ParsedSemanticVersion,
): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;

  return 0;
}

/**
 * Checks whether a module version satisfies a constraint.
 *
 * Supported constraint forms:
 *
 * 1.2.3      exact match
 * ^1.2.3     compatible within the same major (same minor for 0.x)
 * ~1.2.3     compatible within the same minor
 * >=1.2.3    at least
 * >1.2.3     greater than
 * <=1.2.3    at most
 * <1.2.3     less than
 *
 * A dependency with a declared constraint is NOT satisfied when
 * the dependency module declares no version at all.
 */
export function satisfiesModuleVersionConstraint(
  constraint: string,
  version: string | undefined,
): boolean {
  const trimmedConstraint = constraint.trim();

  // `(\S.*)` rather than `(.+)`: `.` matches spaces too, so `\s*(.+)` lets the
  // engine split a whitespace run at every position before giving up.
  const operatorMatch = /^(\^|~|>=|<=|>|<)?\s*(\S.*)$/.exec(trimmedConstraint);
  if (!operatorMatch) return false;

  const operator = operatorMatch[1] ?? "";
  const base = parseSemanticVersion(operatorMatch[2] ?? "");
  if (!base) return false;

  if (version === undefined) return false;

  const actual = parseSemanticVersion(version);
  if (!actual) return false;

  const comparison = compareSemanticVersions(actual, base);

  switch (operator) {
    case "":
      return comparison === 0;

    case "^":
      if (actual.major !== base.major) return false;
      if (base.major === 0 && actual.minor !== base.minor) return false;
      return comparison >= 0;

    case "~":
      return (
        actual.major === base.major &&
        actual.minor === base.minor &&
        comparison >= 0
      );

    case ">=":
      return comparison >= 0;

    case ">":
      return comparison > 0;

    case "<=":
      return comparison <= 0;

    case "<":
      return comparison < 0;

    default:
      return false;
  }
}
