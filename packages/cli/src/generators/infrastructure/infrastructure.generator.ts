/**
 * zudojs-cli — Infrastructure Generator
 *
 * Generates Docker, docker-compose, and database infrastructure files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIValidationError } from "../../errors/index.js";

export interface InfrastructureOptions {
  readonly projectName: string;
  readonly architecture: string;
  readonly database: string;
  readonly packageManager: string;
  readonly services?: readonly string[];
}

const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface DatabaseCompose {
  readonly image: string;
  readonly port: number;
  readonly environment: readonly string[];
  readonly url: string;
  readonly dataPath: string;
}

export class InfrastructureGenerator {
  async generate(
    options: InfrastructureOptions,
    basePath: string,
  ): Promise<void> {
    for (const service of options.services ?? []) {
      if (!SERVICE_NAME_PATTERN.test(service)) {
        throw new CLIValidationError(
          `Invalid service name: "${service}". Service names must match ${SERVICE_NAME_PATTERN}.`,
        );
      }
    }

    const files = this.getFiles(options);
    await writeFileTree(basePath, files);
  }

  private getFiles(options: InfrastructureOptions): Record<string, string> {
    const files: Record<string, string> = {};

    if (options.architecture === "microservice") {
      files["docker-compose.yml"] = this.getDockerCompose(options);
      files[".dockerignore"] = "node_modules\ndist\n.git\n.env\n";

      const services = options.services ?? ["gateway"];
      for (const service of services) {
        files[`apps/services/${service}/Dockerfile`] =
          this.getServiceDockerfile(options);
      }
    } else {
      files["docker-compose.yml"] = this.getSimpleDockerCompose(options);
      files[".dockerignore"] = "node_modules\ndist\n.git\n.env\n";
      files["Dockerfile"] = this.getAppDockerfile(options);
    }

    files["migrations/.gitkeep"] = "";

    return files;
  }

  /**
   * Install and build commands for Dockerfiles.
   *
   * Generated projects have no lockfile yet, so never use `npm ci` or
   * `--frozen-lockfile`. pnpm and yarn need `corepack enable` on the bare
   * node:24-alpine image; bun is not available there so it falls back to npm.
   */
  private getDockerCommands(options: InfrastructureOptions): {
    install: string;
    build: string;
  } {
    switch (options.packageManager) {
      case "pnpm":
        return {
          install: "corepack enable && pnpm install",
          build: "pnpm run build",
        };
      case "yarn":
        return {
          install: "corepack enable && yarn install",
          build: "yarn run build",
        };
      default:
        return { install: "npm install", build: "npm run build" };
    }
  }

  private getDatabaseCompose(
    options: InfrastructureOptions,
  ): DatabaseCompose | null {
    if (options.database === "mysql") {
      return {
        image: "mysql:8",
        port: 3306,
        environment: [
          "MYSQL_ROOT_PASSWORD=mysql",
          `MYSQL_DATABASE=${options.projectName}`,
        ],
        url: `mysql://root:mysql@db:3306/${options.projectName}`,
        dataPath: "/var/lib/mysql",
      };
    }

    if (options.database === "sqlite") {
      // SQLite is file-based: no database service at all.
      return null;
    }

    return {
      image: "postgres:16-alpine",
      port: 5432,
      environment: [
        "POSTGRES_USER=postgres",
        "POSTGRES_PASSWORD=postgres",
        `POSTGRES_DB=${options.projectName}`,
      ],
      url: `postgresql://postgres:postgres@db:5432/${options.projectName}`,
      dataPath: "/var/lib/postgresql/data",
    };
  }

  private getDatabaseUrl(options: InfrastructureOptions): string {
    const db = this.getDatabaseCompose(options);
    return db ? db.url : "sqlite:./.data/app.db";
  }

  private getDbServiceBlock(db: DatabaseCompose): string {
    return `  db:
    image: ${db.image}
    ports:
      - "${db.port}:${db.port}"
    environment:
${db.environment.map((e) => `      - ${e}`).join("\n")}
    volumes:
      - db-data:${db.dataPath}

volumes:
  db-data:
`;
  }

  private getAppDockerfile(options: InfrastructureOptions): string {
    const { install, build } = this.getDockerCommands(options);

    return `FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN ${install}
RUN ${build}

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
`;
  }

  private getServiceDockerfile(options: InfrastructureOptions): string {
    const { install, build } = this.getDockerCommands(options);

    return `FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN ${install}
RUN ${build}

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
`;
  }

  private getSimpleDockerCompose(options: InfrastructureOptions): string {
    const db = this.getDatabaseCompose(options);
    const databaseUrl = this.getDatabaseUrl(options);

    return `services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${databaseUrl}
${db ? "    depends_on:\n      - db\n" : ""}    develop:
      watch:
        - path: src/
          action: sync
          target: /app/src
${db ? `\n${this.getDbServiceBlock(db)}` : ""}`;
  }

  private getDockerCompose(options: InfrastructureOptions): string {
    const services = options.services ?? ["gateway"];
    const db = this.getDatabaseCompose(options);
    const databaseUrl = this.getDatabaseUrl(options);

    let serviceDefs = "";

    for (let i = 0; i < services.length; i++) {
      const service = services[i]!;
      const port = 3001 + i;
      serviceDefs += `
  ${service}:
    build:
      context: apps/services/${service}
    ports:
      - "${port}:${port}"
    environment:
      - PORT=${port}
      - DATABASE_URL=${databaseUrl}
${db ? "    depends_on:\n      - db\n" : ""}`;
    }

    return `services:${serviceDefs}${db ? `\n${this.getDbServiceBlock(db)}` : ""}`;
  }
}
