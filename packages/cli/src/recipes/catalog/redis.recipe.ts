/**
 * zudojs-cli — `zudojs add redis`: a node-redis client with config from
 * REDIS_URL, connected on start (failing fast when Redis is unreachable),
 * reconnecting afterwards, with a PING health check.
 */

import { DEPENDENCY_VERSION_RANGES } from "../../resolvers/dependency/dependencyVersions.constant.js";
import type { AppRecipe } from "../recipe.type.js";

const source = (): string => `import { createClient } from "redis";

import type { Integration } from "./integration.js";

/** Connection attempts before start() gives up on an unreachable server. */
const STARTUP_ATTEMPTS = 5;

/**
 * Creates the client. Reconnects forever once connected, but gives up
 * after STARTUP_ATTEMPTS while \`isStarting()\` so start() fails fast.
 */
function createRedisClient(url: string, isStarting: () => boolean) {
  return createClient({
    url,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries: number, cause: Error) =>
        isStarting() && retries >= STARTUP_ATTEMPTS ? cause : Math.min(retries * 200, 3_000),
    },
  });
}

type RedisClient = ReturnType<typeof createRedisClient>;

let client: RedisClient | undefined;

/** The connected Redis client. Throws before the runtime has started. */
export function redis(): RedisClient {
  if (client === undefined) {
    throw new Error("Redis is not connected: start the runtime first.");
  }
  return client;
}

export const redisIntegration: Integration = {
  name: "redis",

  async start({ config, logger }) {
    let connected = false;
    const next = createRedisClient(config.redis.url, () => !connected);
    next.on("error", (error: unknown) => {
      logger.error("Redis connection error", { error });
    });
    await next.connect();
    connected = true;
    client = next;
  },

  async stop() {
    const current = client;
    client = undefined;
    if (current?.isOpen) await current.close();
  },

  async health() {
    if (client === undefined || !client.isReady) return false;
    return (await client.ping()) === "PONG";
  },
};
`;

export const redisRecipe: AppRecipe = {
  scope: "app",
  feature: "redis",
  summary: "Redis client (src/integrations/redis.ts) with a health check",
  dependencies: { redis: DEPENDENCY_VERSION_RANGES.redis },
  env: () => [{ name: "REDIS_URL", value: "redis://localhost:6379" }],
  configSection: `redis: Object.freeze({ url: text(config, "redis_url", "redis://localhost:6379") }),`,
  integration: { file: "redis.ts", exportName: "redisIntegration", source },
  nextSteps: () => [
    `Use it anywhere after start: import { redis } from "./integrations/redis.js"; await redis().set("key", "value");`,
  ],
};
