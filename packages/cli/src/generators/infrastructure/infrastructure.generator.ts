/**
 * zudojs-cli — Infrastructure Generator
 *
 * Generates Docker, docker-compose, and database infrastructure files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIValidationError } from "../../errors/index.js";
import { resolveDatabaseAdapter } from "../../adapters/databases/databaseAdapter.resolver.js";
import { resolveMicroserviceServices } from "../../templates/microservice/microservice.template.js";
import {
  renderAppPackageDockerfile,
  renderWorkspaceAppDockerfile,
} from "../../templates/shared/dockerfile/index.js";

export interface InfrastructureOptions {
  readonly projectName: string;
  readonly architecture: string;
  readonly database: string;
  readonly packageManager: string;
  readonly services?: readonly string[];
  /**
   * Directory holding the non-microservice server, relative to the project
   * root. The fullstack scaffold passes `"apps/api"`; defaults to `"."`.
   */
  readonly appDirectory?: string;
}

const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Database passwords are interpolated by compose from `.env`
 * (see `.env.example`); compose refuses to start without them. The files
 * used to carry `postgres`/`mysql` as literal passwords.
 */
const POSTGRES_PASSWORD = "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}";
const MYSQL_PASSWORD = "${MYSQL_ROOT_PASSWORD:?Set MYSQL_ROOT_PASSWORD in .env}";

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
    // Rejects engines with no adapter (e.g. mongodb) instead of falling
    // through to a postgres container.
    resolveDatabaseAdapter(options.database);

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

      // The gateway lives at apps/gateway and each service at
      // apps/services/<name>, as the microservice template writes them;
      // each Dockerfile builds from the project root with its app path.
      files["apps/gateway/Dockerfile"] = renderAppPackageDockerfile({
        appPath: "apps/gateway",
        port: 3000,
        packageManager: options.packageManager,
      });
      resolveMicroserviceServices(options.services ?? []).forEach((service, i) => {
        files[`apps/services/${service}/Dockerfile`] = renderAppPackageDockerfile({
          appPath: `apps/services/${service}`,
          port: 3001 + i,
          packageManager: options.packageManager,
        });
      });
    } else {
      files["docker-compose.yml"] = this.getSimpleDockerCompose(options);
      files[".dockerignore"] = "node_modules\ndist\n.git\n.env\n";
      files["Dockerfile"] = renderWorkspaceAppDockerfile({
        appDirectory: options.appDirectory ?? ".",
        port: 3000,
        packageManager: options.packageManager,
      });
    }

    files["migrations/.gitkeep"] = "";

    return files;
  }

  private getDatabaseCompose(
    options: InfrastructureOptions,
  ): DatabaseCompose | null {
    if (options.database === "mysql") {
      return {
        image: "mysql:8",
        port: 3306,
        // Read from .env by compose: no credential is written here.
        environment: [
          `MYSQL_ROOT_PASSWORD=${MYSQL_PASSWORD}`,
          `MYSQL_DATABASE=${options.projectName}`,
        ],
        url: `mysql://root:${MYSQL_PASSWORD}@db:3306/${options.projectName}`,
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
        `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
        `POSTGRES_DB=${options.projectName}`,
      ],
      url: `postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/${options.projectName}`,
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
      - "127.0.0.1:${db.port}:${db.port}"
    environment:
${db.environment.map((e) => `      - ${e}`).join("\n")}
    volumes:
      - db-data:${db.dataPath}

volumes:
  db-data:
`;
  }

  private getSimpleDockerCompose(options: InfrastructureOptions): string {
    const db = this.getDatabaseCompose(options);
    const databaseUrl = this.getDatabaseUrl(options);

    const appDirectory = (options.appDirectory ?? ".").replace(/^\.\/?/, "").replace(/\/$/, "");
    const src = appDirectory === "" ? "src" : `${appDirectory}/src`;

    return `services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${databaseUrl}
${db ? "    depends_on:\n      - db\n" : ""}    develop:
      watch:
        - path: ${src}/
          action: sync
          target: /app/${src}
${db ? `\n${this.getDbServiceBlock(db)}` : ""}`;
  }

  private getDockerCompose(options: InfrastructureOptions): string {
    const services = resolveMicroserviceServices(options.services ?? []);
    const db = this.getDatabaseCompose(options);
    const databaseUrl = this.getDatabaseUrl(options);
    const dependsOn = db ? "    depends_on:\n      - db\n" : "";
    const block = (name: string, appPath: string, port: number): string => `
  ${name}:
    build:
      context: .
      dockerfile: ${appPath}/Dockerfile
    ports:
      - "${port}:${port}"
    environment:
      - PORT=${port}
      - DATABASE_URL=${databaseUrl}
${dependsOn}`;

    const serviceDefs = [
      block("gateway", "apps/gateway", 3000),
      ...services.map((service, i) =>
        block(service, `apps/services/${service}`, 3001 + i),
      ),
    ].join("");

    return `services:${serviceDefs}${db ? `\n${this.getDbServiceBlock(db)}` : ""}`;
  }
}
