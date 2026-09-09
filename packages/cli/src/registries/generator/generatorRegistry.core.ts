/**
 * zudojs-cli — Generator Registry
 *
 * Registry for project generators with capability-based lookup.
 */

import { BackendGenerator } from "../../generators/backend/backend.generator.js";
import { FrontendGenerator } from "../../generators/frontend/frontendGenerator.core.js";
import { FullstackComposer } from "../../generators/fullstack/fullstackComposer.core.js";
import { IntegrationGenerator } from "../../generators/integration/integrationGenerator.core.js";
import { InfrastructureGenerator } from "../../generators/infrastructure/infrastructure.generator.js";

export interface GeneratorRegistryEntry {
  readonly name: string;
  readonly generator: object;
  readonly capabilities: readonly string[];
}

export class GeneratorRegistry {
  private readonly generators = new Map<string, GeneratorRegistryEntry>();

  constructor() {
    this.register({
      name: "backend",
      generator: new BackendGenerator(),
      capabilities: ["monolith", "modular-monolith", "microservice"],
    });

    this.register({
      name: "frontend",
      generator: new FrontendGenerator(),
      capabilities: [
        "react",
        "next",
        "vue",
        "nuxt",
        "angular",
        "svelte",
        "sveltekit",
        "astro",
        "vanilla",
        "flutter",
        "react-native",
      ],
    });

    this.register({
      name: "fullstack",
      generator: new FullstackComposer(),
      capabilities: ["fullstack"],
    });

    this.register({
      name: "integration",
      generator: new IntegrationGenerator(),
      capabilities: ["integration"],
    });

    this.register({
      name: "infrastructure",
      generator: new InfrastructureGenerator(),
      capabilities: ["docker", "database", "microservice"],
    });
  }

  register(entry: GeneratorRegistryEntry): void {
    this.generators.set(entry.name, entry);
  }

  get(name: string): GeneratorRegistryEntry | undefined {
    return this.generators.get(name);
  }

  getByCapability(capability: string): GeneratorRegistryEntry[] {
    return Array.from(this.generators.values()).filter((entry) =>
      entry.capabilities.includes(capability),
    );
  }

  getNames(): readonly string[] {
    return Array.from(this.generators.keys());
  }
}
