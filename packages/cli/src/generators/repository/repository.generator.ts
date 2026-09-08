/**
 * zudojs-cli — Repository Generator
 */

import {
  writeFileTree,
  mergeBarrelExport,
} from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";

export interface GenerateRepositoryOptions {
  readonly name: string;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

export async function generateRepository(
  options: GenerateRepositoryOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const nameCamel = toPascalCase(options.name);
  const basePath = options.basePath ?? "";
  const prefix = basePath ? `${basePath}/` : "";
  const indexPath = `${prefix}repositories/index.ts`;

  const files: Record<string, string> = {
    [`${prefix}repositories/${name}.repository.ts`]: `import { createLogger } from "@zudojs/logger";

export interface ${nameCamel}Entity {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  [key: string]: unknown;
}

export class ${nameCamel}Repository {
  private readonly logger = createLogger({ name: "${name}-repository" });
  private readonly store = new Map<string, ${nameCamel}Entity>();

  async findById(id: string): Promise<${nameCamel}Entity | null> {
    this.logger.debug("Finding ${name} by id", { id });
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<readonly ${nameCamel}Entity[]> {
    this.logger.debug("Finding all ${name} entities");
    return [...this.store.values()];
  }

  async create(data: Omit<${nameCamel}Entity, "id" | "createdAt" | "updatedAt">): Promise<${nameCamel}Entity> {
    const now = new Date().toISOString();
    const entity: ${nameCamel}Entity = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    this.store.set(entity.id, entity);
    this.logger.info("Created ${name}", { id: entity.id });
    return entity;
  }

  async update(id: string, changes: Partial<${nameCamel}Entity>): Promise<${nameCamel}Entity | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    this.logger.info("Updated ${name}", { id });
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.store.delete(id);
    if (deleted) this.logger.info("Deleted ${name}", { id });
    return deleted;
  }
}
`,

    // Merge with any existing barrel content instead of overwriting it.
    [indexPath]: mergeBarrelExport(
      cwd,
      indexPath,
      `export { ${nameCamel}Repository } from "./${name}.repository.js";`,
    ),
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
    return Object.keys(files);
  } catch (error) {
    throw new CLIGenerationError(
      `Failed to generate repository: ${name}`,
      error,
    );
  }
}
