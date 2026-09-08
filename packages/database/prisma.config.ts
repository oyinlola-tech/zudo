import { defineConfig } from "prisma/config";

/**
 * `prisma generate` only needs the schema. The datasource URL is read from
 * the environment so no connection string is hard-coded in the package.
 */
export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    provider: "postgresql",
    url: process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/postgres",
  },
});
