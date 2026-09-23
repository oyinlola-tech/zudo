/**
 * zudojs-cli — Generated `src/configs/index.ts` and `.env.example`.
 *
 * Configuration is read from the environment through @zudojs/config and
 * returned as one frozen, typed object. `zudojs add <feature>` inserts that
 * feature's section between the `config` markers and its variables into
 * `.env.example`, so the two stay in sync.
 */

import { renderMarkerBlock, MARKERS } from "../../../wiring/index.js";

/** One environment variable documented in `.env.example`. */
export interface EnvVariable {
  readonly name: string;
  readonly value: string;
  readonly comment?: string;
}

/** Variables every generated app reads. */
export function baseEnvVariables(port: number): readonly EnvVariable[] {
  return [
    { name: "NODE_ENV", value: "development" },
    { name: "HOST", value: "0.0.0.0" },
    { name: "PORT", value: String(port) },
    {
      name: "CORS_ORIGINS",
      value: "",
      comment: "Comma-separated origins allowed to call the API from a browser (empty: none)",
    },
    { name: "RATE_LIMIT_WINDOW_MS", value: "60000", comment: "Requests allowed per client per window" },
    { name: "RATE_LIMIT_MAX", value: "300" },
  ];
}

/** Renders `.env.example` lines for `variables`. */
export function renderEnvVariables(variables: readonly EnvVariable[]): string {
  return variables
    .map((v) => `${v.comment ? `# ${v.comment}\n` : ""}${v.name}=${v.value}`)
    .join("\n");
}

/**
 * Renders `src/configs/index.ts`. `sections` are single-line object entries
 * (for example `redis: Object.freeze({ url: text(config, "redis_url", "...") }),`)
 * placed between the config markers.
 */
export function renderConfigFile(options: {
  readonly defaultPort: number;
  readonly sections: readonly string[];
}): string {
  return `import { ConfigurationError } from "@zudojs/errors";
import {
  createConfigManager,
  createEnvironmentConfigSource,
  type ConfigManager,
} from "@zudojs/config";

const DEFAULT_PORT = ${options.defaultPort};

/** Loads \`.env\` into process.env when it exists; real variables win. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** A string setting, or \`fallback\` when the variable is unset. */
export function text(config: ConfigManager, key: string, fallback: string): string {
  return config.string(key, fallback) ?? fallback;
}

/** A comma-separated list setting. */
export function list(config: ConfigManager, key: string): readonly string[] {
  return (config.string(key, "") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** A non-negative integer setting; anything else is a configuration error. */
export function int(config: ConfigManager, key: string, fallback: number): number {
  const raw = config.string(key);
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConfigurationError(\`\${key.toUpperCase()} must be a non-negative integer, got "\${raw}".\`);
  }
  return value;
}

/** PORT, refusing anything that is not a TCP port. */
function port(config: ConfigManager): number {
  const raw = config.string("port");
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new ConfigurationError(\`PORT must be an integer between 0 and 65535, got "\${raw}".\`);
  }
  return value;
}

/**
 * Reads the application configuration from the environment (and \`.env\`).
 * \`zudojs add <feature>\` adds the feature's settings between the markers.
 */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env) loadDotEnv();
  const config = createConfigManager({
    sources: [createEnvironmentConfigSource({ env })],
  });
  await config.load();

  return Object.freeze({
    nodeEnv: text(config, "node_env", "development"),
    host: text(config, "host", "0.0.0.0"),
    port: port(config),
    corsOrigins: list(config, "cors_origins"),
    rateLimit: Object.freeze({
      windowMs: int(config, "rate_limit_window_ms", 60_000),
      max: int(config, "rate_limit_max", 300),
    }),
${renderMarkerBlock(MARKERS.config, options.sections, "    ")}
  });
}

/** The loaded configuration. */
export type AppConfig = Awaited<ReturnType<typeof loadConfig>>;
`;
}
