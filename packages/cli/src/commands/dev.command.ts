/**
 * zudojs-cli — Dev Command
 *
 * The `zudojs dev` command.
 * Starts development servers based on project configuration.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runStreaming } from "../utils/utils.exec.js";
import type { CLIContext } from "../cliType/cliType.type.js";
import { CLIValidationError, CLIGenerationError } from "../errors/index.js";
import { ManifestManager } from "../manifest/manifestManager.core.js";
import { SAFE_PATH_SEGMENT } from "../utils/utils.name.js";

export async function runDevCommand(context: CLIContext): Promise<void> {
  const frontendOnly = context.values["frontend-only"] === true;
  const backendOnly = context.values["backend-only"] === true;
  const port = context.values.port as number | undefined;

  if (frontendOnly && backendOnly) {
    throw new CLIValidationError(
      "Cannot use --frontend-only and --backend-only together.",
    );
  }

  const manifest = await new ManifestManager(context.cwd).read();

  const config = readProjectConfig(context.cwd) ?? configFromManifest(manifest);

  if (!config) {
    throw new CLIValidationError(
      "No Zudojs project found. Run `zudojs create` first.",
    );
  }

  context.logger.info(`Starting development server for: ${config.name}`);
  context.logger.info(`Type: ${config.type}`);

  if (config.backend) {
    context.logger.info(`Backend architecture: ${config.backend.architecture}`);
  }

  if (config.frontend) {
    context.logger.info(`Frontend: ${config.frontend.framework}`);
  }

  // Service names come from a manifest file on disk and are joined into
  // filesystem paths below; a crafted entry such as "../../.." would make the
  // dev command probe and run outside the project.
  const services = (manifest?.services ?? []).filter((service) => {
    if (SAFE_PATH_SEGMENT.test(service)) return true;
    context.logger.warn(
      `Ignoring invalid service name in .zudojs/manifest.json: "${service}"`,
    );
    return false;
  });

  const processes: Promise<void>[] = [];

  if (
    !frontendOnly &&
    (config.type === "backend" || config.type === "fullstack")
  ) {
    if (config.backend?.architecture === "microservice") {
      processes.push(...startMicroserviceDev(context.cwd, services));
    } else {
      processes.push(startBackendDev(context.cwd, config, port));
    }
  }

  if (
    !backendOnly &&
    (config.type === "frontend" || config.type === "fullstack")
  ) {
    if (config.frontend && config.frontend.framework !== "none") {
      processes.push(startFrontendDev(context.cwd, config));
    }
  }

  if (processes.length === 0) {
    context.logger.warn("No development servers to start.");
    return;
  }

  context.logger.info("Starting development servers...");

  try {
    await Promise.all(processes);
  } catch (error) {
    throw new CLIGenerationError("Development server failed to start.", error);
  }
}

function configFromManifest(
  manifest: Awaited<ReturnType<ManifestManager["read"]>>,
): {
  readonly name: string;
  readonly type: string;
  readonly backend?: { readonly architecture: string };
  readonly frontend?: { readonly framework: string };
} | null {
  if (!manifest) return null;

  return {
    name: "zudojs-project",
    type: manifest.projectType ?? "backend",
    backend: manifest.backend
      ? { architecture: manifest.backend.architecture }
      : { architecture: manifest.architecture },
    frontend: manifest.frontend
      ? { framework: manifest.frontend.framework }
      : undefined,
  };
}

function readProjectConfig(cwd: string): {
  readonly name: string;
  readonly type: string;
  readonly backend?: { readonly architecture: string };
  readonly frontend?: { readonly framework: string };
} | null {
  const configPath = join(cwd, "zudojs.config.ts");
  const configPathJs = join(cwd, "zudojs.config.js");

  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    return parseConfigContent(content, cwd);
  }

  if (existsSync(configPathJs)) {
    const content = readFileSync(configPathJs, "utf-8");
    return parseConfigContent(content, cwd);
  }

  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      name?: string;
      zudojs?: {
        projectType?: string;
        architecture?: string;
        frontend?: string;
      };
    };

    if (pkg.zudojs) {
      return {
        name: pkg.name ?? "unknown",
        type: pkg.zudojs.projectType ?? "backend",
        backend: pkg.zudojs.architecture
          ? { architecture: pkg.zudojs.architecture }
          : undefined,
        frontend: pkg.zudojs.frontend
          ? { framework: pkg.zudojs.frontend }
          : undefined,
      };
    }
  }

  return null;
}

function parseConfigContent(
  content: string,
  cwd: string,
): {
  readonly name: string;
  readonly type: string;
  readonly backend?: { readonly architecture: string };
  readonly frontend?: { readonly framework: string };
} {
  const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
  const typeMatch = content.match(/projectType:\s*["'](\w+)["']/);
  const architectureMatch = content.match(/architecture:\s*["'](\w+)["']/);
  const frontendMatch = content.match(
    /frontend:\s*\{[\s\S]*?framework:\s*["']([^"']+)["']/,
  );

  const pkgPath = join(cwd, "package.json");
  let name = "unknown";

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        name?: string;
      };
      name = pkg.name ?? name;
    } catch {
      // ignore
    }
  }

  return {
    name: nameMatch?.[1] ?? name,
    type: typeMatch?.[1] ?? "backend",
    backend: architectureMatch?.[1]
      ? { architecture: architectureMatch[1] }
      : undefined,
    frontend: frontendMatch?.[1] ? { framework: frontendMatch[1] } : undefined,
  };
}

async function startBackendDev(
  cwd: string,
  config: { readonly backend?: { readonly architecture: string } },
  port?: number,
): Promise<void> {
  // `--port=N` was appended to the tsx argv, where it became an argument of
  // the watched script and was ignored. Generated servers read PORT from the
  // environment, so that is where the option has to land.
  const options =
    port !== undefined
      ? { env: { ...process.env, PORT: String(port) } }
      : undefined;

  const entry =
    config.backend?.architecture === "microservice"
      ? "apps/gateway/src"
      : "src";

  await runStreaming("tsx", ["watch", entry], cwd, options);
}

function startMicroserviceDev(
  cwd: string,
  services: readonly string[],
): Promise<void>[] {
  const serviceDirs = services.map((service) => {
    const nested = join(cwd, "apps", "services", service);
    return existsSync(join(nested, "src"))
      ? nested
      : join(cwd, "apps", service);
  });
  const promises: Promise<void>[] = [];

  const gatewayDir = join(cwd, "apps", "gateway");
  if (existsSync(join(gatewayDir, "src"))) {
    promises.push(runStreaming("tsx", ["watch", "src"], gatewayDir));
  }

  for (const dir of serviceDirs) {
    if (existsSync(join(dir, "src"))) {
      promises.push(runStreaming("tsx", ["watch", "src"], dir));
    }
  }

  return promises;
}

async function startFrontendDev(
  cwd: string,
  config: { readonly frontend?: { readonly framework: string } },
): Promise<void> {
  const framework = config.frontend?.framework ?? "react";
  const frontendDir = join(cwd, "apps", "web");

  switch (framework) {
    case "react":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "next":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "vue":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "nuxt":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "angular":
      await runStreaming("ng", ["serve"], frontendDir);
      break;

    case "svelte":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "sveltekit":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "astro":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "vanilla":
      await runStreaming("npm", ["run", "dev"], frontendDir);
      break;

    case "flutter":
      await runStreaming("flutter", ["run", "--debug"], frontendDir);
      break;

    case "react-native":
      await runStreaming("npx", ["react-native", "start"], frontendDir);
      break;

    default:
      await runStreaming("npm", ["run", "dev"], frontendDir);
  }
}
