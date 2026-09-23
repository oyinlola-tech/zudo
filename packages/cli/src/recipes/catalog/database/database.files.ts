/**
 * zudojs-cli — Files of the Prisma database recipe.
 *
 * Prisma 7: the `prisma-client` generator writes a TypeScript client into
 * `src/generated/prisma` (ESM, `.js` import extensions, so `tsc` compiles
 * it with the app), the connection URL lives in `prisma.config.ts`, and
 * the client connects through the `@prisma/adapter-pg` driver adapter.
 */

/** `prisma/schema.prisma`. */
export function renderPrismaSchema(): string {
  return `// Prisma schema: https://www.prisma.io/docs/orm/prisma-schema
// \`zudojs generate resource <name>\` appends a model here.

generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  moduleFormat        = "esm"
  importFileExtension = "js"
}

datasource db {
  provider = "postgresql"
}
`;
}

/** `prisma.config.ts`: reads DATABASE_URL from the environment or `.env`. */
export function renderPrismaConfig(): string {
  return `import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env: DATABASE_URL comes from the environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] ?? "" },
});
`;
}

/** `src/integrations/database.ts`. */
export function renderDatabaseIntegration(): string {
  return `import { PrismaPg } from "@prisma/adapter-pg";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "@zudojs/database";
import { ConfigurationError } from "@zudojs/errors";

import { PrismaClient } from "../generated/prisma/client.js";
import type { Integration } from "./integration.js";

let client: PrismaClient | undefined;
let database: DatabaseClient | undefined;

/** The connected Prisma client. Throws before the runtime has started. */
export function prisma(): PrismaClient {
  if (client === undefined) {
    throw new Error("The database is not connected: start the runtime first.");
  }
  return client;
}

export const databaseIntegration: Integration = {
  name: "database",

  async start({ config }) {
    if (config.database.url === "") {
      throw new ConfigurationError(
        "DATABASE_URL is not set. Copy .env.example to .env, or set it in the environment.",
      );
    }
    const next = new PrismaClient({
      adapter: new PrismaPg({ connectionString: config.database.url }),
    });
    const wrapper = createDatabaseClient({ prisma: next });
    await wrapper.connect();
    client = next;
    database = wrapper;
  },

  async stop() {
    const current = database;
    database = undefined;
    client = undefined;
    await current?.disconnect();
  },

  async health() {
    if (database === undefined) return false;
    return database.ping().then(() => true, () => false);
  },
};
`;
}
