/**
 * zudojs-cli — A resource's Prisma-backed repository and model.
 *
 * Generated only in an app that has Prisma (`zudojs add database`). The
 * repository reads the client from `src/integrations/database.ts`, which
 * the runtime connects on start.
 */

import type { ResourceNames } from "../resource.names.js";

/** `repositories/<slug>.prisma.repository.ts`. */
export function renderPrismaRepository(
  n: ResourceNames,
  appSrcFromRepositories: string,
): string {
  const types = `Create${n.entity}Input, ${n.entity}, Update${n.entity}Input`;
  const delegate = `prisma().${n.entityCamel}`;
  return `import { prisma } from "${appSrcFromRepositories}/integrations/database.js";
import type { ${types} } from "../dtos/${n.slug}.dto.js";
import type { ${n.pascal}Repository } from "./${n.slug}.repository.js";

interface ${n.entity}Row {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function to${n.entity}(row: ${n.entity}Row): ${n.entity} {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Most rows \`findAll\` returns; add pagination before raising it. */
const LIST_LIMIT = 1000;

/** Stores ${n.label} records in the \`${n.slug.replace(/-/g, "_")}\` table through Prisma. */
export class Prisma${n.pascal}Repository implements ${n.pascal}Repository {
  public async findAll(): Promise<readonly ${n.entity}[]> {
    const rows = await ${delegate}.findMany({
      orderBy: { createdAt: "asc" },
      take: LIST_LIMIT,
    });
    return rows.map(to${n.entity});
  }

  public async findById(id: string): Promise<${n.entity} | undefined> {
    const row = await ${delegate}.findUnique({ where: { id } });
    return row === null ? undefined : to${n.entity}(row);
  }

  public async create(input: Create${n.entity}Input): Promise<${n.entity}> {
    return to${n.entity}(await ${delegate}.create({ data: { name: input.name } }));
  }

  public async update(
    id: string,
    input: Update${n.entity}Input,
  ): Promise<${n.entity} | undefined> {
    const result = await ${delegate}.updateMany({
      where: { id },
      data: input.name === undefined ? {} : { name: input.name },
    });
    return result.count === 0 ? undefined : this.findById(id);
  }

  public async delete(id: string): Promise<boolean> {
    const result = await ${delegate}.deleteMany({ where: { id } });
    return result.count > 0;
  }
}
`;
}

/** The Prisma model block appended to prisma/schema.prisma. */
export function renderPrismaModel(n: ResourceNames): string {
  return `
model ${n.entity} {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("${n.slug.replace(/-/g, "_")}")
}
`;
}

/** Whether `schema` already declares a model named `entity`. */
export function hasPrismaModel(schema: string, entity: string): boolean {
  return new RegExp(`^model\\s+${entity}\\s*\\{`, "m").test(schema);
}
