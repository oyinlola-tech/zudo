/**
 * Dependency resolver for compatible package versions.
 *
 * @module resolvers/dependency
 */

import type { DependencyRequirement } from "../../adapters/frontend/frontendAdapter.type.js";
import { DEFAULT_DEPENDENCY_VERSIONS } from "./dependencyVersions.constant.js";

/**
 * Resolved dependency with version.
 */
export interface ResolvedDependency {
  readonly name: string;
  readonly version: string;
  readonly type: "dependency" | "devDependency";
}

/**
 * Dependency resolution result.
 */
export interface DependencyResolutionResult {
  readonly dependencies: readonly ResolvedDependency[];
  readonly devDependencies: readonly ResolvedDependency[];
  readonly conflicts: readonly DependencyConflict[];
  readonly warnings: readonly string[];
}

/**
 * Dependency conflict.
 */
export interface DependencyConflict {
  readonly package1: string;
  readonly package2: string;
  readonly reason: string;
}

/**
 * Resolves compatible dependency versions.
 */
export class DependencyResolver {
  private readonly knownConflicts: Array<{
    readonly package1: string;
    readonly package2: string;
    readonly reason: string;
  }> = [
    {
      package1: "next",
      package2: "vite",
      reason: "Next.js uses its own build system and does not need Vite.",
    },
    {
      package1: "nuxt",
      package2: "vite",
      reason: "Nuxt uses its own build system.",
    },
    {
      package1: "angular",
      package2: "vite",
      reason: "Angular uses its own build system.",
    },
    {
      package1: "sveltekit",
      package2: "vite",
      reason: "SvelteKit uses its own build system.",
    },
    {
      package1: "astro",
      package2: "vite",
      reason: "Astro uses its own build system.",
    },
    {
      package1: "flutter",
      package2: "react",
      reason: "Flutter and React are different frameworks.",
    },
    {
      package1: "flutter",
      package2: "vue",
      reason: "Flutter and Vue are different frameworks.",
    },
    {
      package1: "react-native",
      package2: "react",
      reason: "React Native uses its own React variant.",
    },
  ];

  /**
   * Resolves dependencies with compatibility checks.
   */
  resolve(
    requirements: readonly DependencyRequirement[],
  ): DependencyResolutionResult {
    const dependencies: ResolvedDependency[] = [];
    const devDependencies: ResolvedDependency[] = [];
    const conflicts: DependencyConflict[] = [];
    const warnings: string[] = [];

    for (const req of requirements) {
      const conflict = this.checkConflicts(req, requirements);
      if (conflict) {
        conflicts.push(conflict);
        continue;
      }

      const version = req.version ?? DEFAULT_DEPENDENCY_VERSIONS.get(req.name);
      if (version === undefined) {
        warnings.push(
          `No version range known for "${req.name}"; it is recorded as "latest", which is not reproducible.`,
        );
      }
      const resolved: ResolvedDependency = {
        name: req.name,
        version: version ?? "latest",
        type: req.type,
      };

      if (req.type === "dependency") {
        dependencies.push(resolved);
      } else {
        devDependencies.push(resolved);
      }
    }

    return { dependencies, devDependencies, conflicts, warnings };
  }

  private checkConflicts(
    req: DependencyRequirement,
    all: readonly DependencyRequirement[],
  ): DependencyConflict | null {
    for (const known of this.knownConflicts) {
      const hasPackage1 = all.some((r) => r.name === known.package1);
      const hasPackage2 = all.some((r) => r.name === known.package2);

      if (hasPackage1 && hasPackage2) {
        if (req.name === known.package1 || req.name === known.package2) {
          return {
            package1: known.package1,
            package2: known.package2,
            reason: known.reason,
          };
        }
      }
    }

    return null;
  }
}
