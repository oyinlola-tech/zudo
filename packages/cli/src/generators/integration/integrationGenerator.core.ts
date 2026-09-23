/**
 * Integration generator for connecting frontend and backend.
 *
 * @module generators/integration
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectConfiguration } from "../../types/projectConfiguration.type.js";
import {
  mergeBarrelExport,
  writeFileTree,
} from "../../utils/utils.fileSystem.js";
import { renderDatabaseEnv } from "../../adapters/databases/databaseAdapter.resolver.js";

/**
 * Integration generation context.
 */
export interface IntegrationContext {
  readonly project: ProjectConfiguration;
  readonly projectPath: string;
  readonly backendPort?: number;
  readonly frontendPort?: number;
}

/**
 * Generates integration files between frontend and backend.
 */
export class IntegrationGenerator {
  /**
   * Generates all integration files.
   */
  async generate(context: IntegrationContext): Promise<void> {
    const files: Record<string, string> = {};

    // Environment files
    files[".env.example"] = this.generateEnvFile(context);

    // API client for frontend
    if (context.project.frontend) {
      const apiClient = this.generateApiClient(context);
      const apiPath = this.getApiClientPath(context);
      files[apiPath] = apiClient;
    }

    // CORS configuration, written inside the backend's own program. The
    // backend tsconfig sets `rootDir: "src"` and `include: ["src/**/*"]`, so
    // a `config/` directory beside it is excluded from compilation and cannot
    // be imported from `src/` without leaving rootDir. The templates' config
    // directory is `src/configs/`, and its barrel is where the rest of the
    // app looks for configuration.
    const configDir = `${this.getBackendPath(context)}src/configs`;
    files[`${configDir}/cors.ts`] = this.generateCorsConfig(context);
    files[`${configDir}/index.ts`] = mergeBarrelExport(
      context.projectPath,
      `${configDir}/index.ts`,
      `export { corsConfig } from "./cors.js";`,
    );

    // The generated server enforces CORS_ORIGINS (empty: no browser
    // origin allowed), so the frontend's dev origin must be listed there or
    // every cross-origin call from it is refused.
    const backendEnv = `${this.getBackendPath(context)}.env.example`;
    const backendEnvPath = join(context.projectPath, backendEnv);
    if (existsSync(backendEnvPath)) {
      const origins = this.frontendOrigins(context).join(",");
      const current = readFileSync(backendEnvPath, "utf-8");
      if (/^CORS_ORIGINS=$/m.test(current)) {
        files[backendEnv] = current.replace(/^CORS_ORIGINS=$/m, `CORS_ORIGINS=${origins}`);
      }
    }

    // Development proxy configuration (belongs to the frontend app). The
    // frontend adapter has already written a vite.config.ts carrying the
    // framework plugin and path aliases; overwriting it with this minimal
    // proxy-only config silently destroyed that work, so only create the
    // file when the adapter did not.
    if (
      context.project.frontend?.framework === "react" ||
      context.project.frontend?.framework === "vue"
    ) {
      const viteConfigPath = "apps/web/vite.config.ts";
      if (!existsSync(join(context.projectPath, viteConfigPath))) {
        files[viteConfigPath] = this.generateViteProxy(context);
      }
    }

    await writeFileTree(context.projectPath, files);
  }

  private generateEnvFile(context: IntegrationContext): string {
    const backendPort = context.backendPort ?? 3000;
    const frontendPort = context.frontendPort ?? 5173;

    const lines: string[] = [
      "# Backend",
      `API_URL=http://localhost:${backendPort}`,
      "",
      "# Frontend",
      // The frontend dev-server port was accepted, defaulted and then never
      // written anywhere, so nothing downstream could agree with the CORS
      // origins generated from the same value.
      `FRONTEND_PORT=${frontendPort}`,
      `CORS_ORIGINS=${this.frontendOrigins(context).join(",")}`,
      `VITE_API_URL=http://localhost:${backendPort}`,
      "",
      "# Database",
      // The database docker-compose.yml creates (it was "mydb").
      renderDatabaseEnv(context.project.backend?.database, context.project.name),
      // Empty, never a placeholder such as "change-me": docker-compose.yml
      // refuses to start until it is set. Hex keeps it valid in a URL.
      ...(context.project.backend?.database === "sqlite"
        ? []
        : [
            "# Password for the docker-compose.yml database; generate with: openssl rand -hex 32",
            context.project.backend?.database === "mysql"
              ? "MYSQL_ROOT_PASSWORD="
              : "POSTGRES_PASSWORD=",
          ]),
      "",
    ];

    if (context.project.frontend?.framework === "next") {
      lines.push("# Next.js");
      lines.push(`NEXT_PUBLIC_API_URL=http://localhost:${backendPort}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Path prefix (relative to projectPath) of the backend application.
   *
   * Ends with a "/" when non-empty so it can be prefixed directly.
   */
  private getBackendPath(context: IntegrationContext): string {
    if (context.project.type !== "fullstack") return "";
    // A microservice backend's public entry point is the gateway (CLI-02).
    return context.project.backend?.architecture === "microservice"
      ? "apps/gateway/"
      : "apps/api/";
  }

  private generateApiClient(context: IntegrationContext): string {
    const backendPort = context.backendPort ?? 3000;
    const isNext = context.project.frontend?.framework === "next";
    const envVar = isNext ? "NEXT_PUBLIC_API_URL" : "VITE_API_URL";

    return `/**
 * API Client for backend communication.
 * Generated by Zudojs CLI.
 */

const API_URL = ${isNext ? `process.env.${envVar}` : `import.meta.env.${envVar}`} || "http://localhost:${backendPort}";

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly message?: string;
}

export interface ApiError {
  readonly status: number;
  readonly message: string;
  readonly errors?: Record<string, string[]>;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(\`\${API_URL}\${path}\`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json() as ApiError;
    throw new Error(error.message || \`HTTP \${response.status}\`);
  }

  const data = await response.json() as T;
  return { data, status: response.status };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),
};
`;
  }

  private getApiClientPath(context: IntegrationContext): string {
    const framework = context.project.frontend?.framework;

    if (framework === "next") {
      return "apps/web/src/lib/api-client.ts";
    }

    if (framework === "vue" || framework === "nuxt") {
      return "apps/web/src/services/api-client.ts";
    }

    if (framework === "angular") {
      return "apps/web/src/app/services/api.service.ts";
    }

    if (framework === "svelte" || framework === "sveltekit") {
      return "apps/web/src/lib/services/api-client.ts";
    }

    if (framework === "astro") {
      return "apps/web/src/utils/api-client.ts";
    }

    if (framework === "flutter") {
      return "apps/web/lib/services/api_client.dart";
    }

    if (framework === "react-native") {
      return "apps/web/src/services/api-client.ts";
    }

    return "apps/web/src/services/api-client.ts";
  }

  /** Origins the frontend dev server is reached on. */
  private frontendOrigins(context: IntegrationContext): readonly string[] {
    const port = context.frontendPort ?? 5173;
    return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  }

  private generateCorsConfig(context: IntegrationContext): string {
    const frontendPort = context.frontendPort ?? 5173;

    return `/**
 * CORS configuration for development.
 * Generated by Zudojs CLI.
 */

export const corsConfig = {
  origin: [
    "http://localhost:${frontendPort}",
    "http://127.0.0.1:${frontendPort}",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
`;
  }

  private generateViteProxy(context: IntegrationContext): string {
    const backendPort = context.backendPort ?? 3000;
    const isVue = context.project.frontend?.framework === "vue";
    const pluginImport = isVue
      ? `import vue from "@vitejs/plugin-vue";`
      : `import react from "@vitejs/plugin-react";`;
    const pluginCall = isVue ? "vue()" : "react()";

    return `import { defineConfig } from "vite";
${pluginImport}

export default defineConfig({
  plugins: [${pluginCall}],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:${backendPort}",
        changeOrigin: true,
      },
    },
  },
});
`;
  }
}
