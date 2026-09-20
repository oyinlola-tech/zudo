/**
 * zudojs-cli — Capability Resolver
 *
 * Resolves capability dependencies and feature requirements.
 */

export interface CapabilityDependency {
  readonly capability: string;
  readonly requires: readonly string[];
}

export interface CapabilityResolutionResult {
  readonly capabilities: readonly string[];
  /** Framework packages the selected capabilities build on. */
  readonly dependencies: readonly string[];
}

export class CapabilityResolver {
  private readonly dependencyGraph: readonly CapabilityDependency[] = [
    {
      capability: "observability",
      requires: ["logger", "events"],
    },
    {
      capability: "queue",
      requires: ["messaging", "serialization", "events"],
    },
    {
      capability: "cqrs",
      requires: ["messaging", "events"],
    },
    {
      capability: "messaging",
      requires: ["events"],
    },
    {
      capability: "openapi",
      requires: ["http"],
    },
    {
      capability: "database",
      requires: ["validation"],
    },
    {
      capability: "security",
      requires: ["validation", "errors"],
    },
  ];

  resolve(capabilities: readonly string[]): CapabilityResolutionResult {
    const resolved = new Set<string>();
    const dependencies = new Set<string>();

    for (const capability of capabilities) {
      if (resolved.has(capability)) continue;

      resolved.add(capability);

      const dep = this.dependencyGraph.find((d) => d.capability === capability);

      if (dep) {
        for (const req of dep.requires) {
          dependencies.add(req);
        }
      }
    }

    return {
      capabilities: Array.from(resolved),
      dependencies: Array.from(dependencies),
    };
  }

  getCapabilities(): readonly string[] {
    return this.dependencyGraph.map((d) => d.capability);
  }
}
