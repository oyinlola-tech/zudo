import {
  Agent as HTTPAgent,
  type AgentOptions as HTTPAgentOptions,
} from "node:http";

import {
  Agent as HTTPSAgent,
  type AgentOptions as HTTPSAgentOptions,
} from "node:https";

import { createHash } from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HTTPAgentProtocol = "http" | "https";

export interface HTTPAgentOptionsBase {
  readonly keepAlive?: boolean;
  readonly keepAliveMsecs?: number;
  readonly maxSockets?: number;
  readonly maxFreeSockets?: number;
  readonly maxTotalSockets?: number;
  readonly scheduling?: "fifo" | "lifo";
  readonly timeout?: number;
}

export interface HTTPAgentConfig extends HTTPAgentOptionsBase {
  readonly protocol?: HTTPAgentProtocol;
}

export interface HTTPSAgentConfig extends HTTPAgentOptionsBase {
  readonly protocol?: "https";
  readonly rejectUnauthorized?: boolean;
  readonly ca?: string | Buffer | readonly (string | Buffer)[];
  readonly cert?: string | Buffer;
  readonly key?: string | Buffer;
  readonly servername?: string;
}

export type HTTPAgentInstance = HTTPAgent | HTTPSAgent;

/* -------------------------------------------------------------------------- */
/* Defaults                                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_AGENT_KEEP_ALIVE = true;

export const DEFAULT_AGENT_KEEP_ALIVE_MSECS = 1_000;

export const DEFAULT_AGENT_MAX_SOCKETS = 50;

export const DEFAULT_AGENT_MAX_FREE_SOCKETS = 10;

export const DEFAULT_AGENT_MAX_TOTAL_SOCKETS = 100;

export const DEFAULT_AGENT_SCHEDULING: "fifo" | "lifo" = "lifo";

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

export function createHTTPAgent(options: HTTPAgentConfig = {}): HTTPAgent {
  validateAgentOptions(options);

  const agentOptions = normalizeAgentOptions(options);

  return new HTTPAgent(agentOptions);
}

export function createHTTPSAgent(options: HTTPSAgentConfig = {}): HTTPSAgent {
  validateAgentOptions(options);

  const agentOptions = normalizeHTTPSAgentOptions(options);

  return new HTTPSAgent(agentOptions);
}

export function createAgent(
  options: HTTPAgentConfig | HTTPSAgentConfig = {},
): HTTPAgentInstance {
  const protocol = options.protocol ?? "http";

  if (protocol === "https") {
    return createHTTPSAgent(options as HTTPSAgentConfig);
  }

  return createHTTPAgent(options as HTTPAgentConfig);
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function normalizeAgentOptions(options: HTTPAgentConfig): HTTPAgentOptions {
  return {
    keepAlive: options.keepAlive ?? DEFAULT_AGENT_KEEP_ALIVE,

    keepAliveMsecs: options.keepAliveMsecs ?? DEFAULT_AGENT_KEEP_ALIVE_MSECS,

    maxSockets: options.maxSockets ?? DEFAULT_AGENT_MAX_SOCKETS,

    maxFreeSockets: options.maxFreeSockets ?? DEFAULT_AGENT_MAX_FREE_SOCKETS,

    maxTotalSockets: options.maxTotalSockets ?? DEFAULT_AGENT_MAX_TOTAL_SOCKETS,

    scheduling: options.scheduling ?? DEFAULT_AGENT_SCHEDULING,

    timeout: options.timeout,
  };
}

function normalizeHTTPSAgentOptions(
  options: HTTPSAgentConfig,
): HTTPSAgentOptions {
  return {
    keepAlive: options.keepAlive ?? DEFAULT_AGENT_KEEP_ALIVE,

    keepAliveMsecs: options.keepAliveMsecs ?? DEFAULT_AGENT_KEEP_ALIVE_MSECS,

    maxSockets: options.maxSockets ?? DEFAULT_AGENT_MAX_SOCKETS,

    maxFreeSockets: options.maxFreeSockets ?? DEFAULT_AGENT_MAX_FREE_SOCKETS,

    maxTotalSockets: options.maxTotalSockets ?? DEFAULT_AGENT_MAX_TOTAL_SOCKETS,

    scheduling: options.scheduling ?? DEFAULT_AGENT_SCHEDULING,

    timeout: options.timeout,

    rejectUnauthorized: options.rejectUnauthorized,

    ca: options.ca as string | Buffer | (string | Buffer)[],

    cert: options.cert,

    key: options.key,

    servername: options.servername,
  };
}

/* -------------------------------------------------------------------------- */
/* Agent Inspection                                                           */
/* -------------------------------------------------------------------------- */

export interface AgentStats {
  readonly sockets: number;
  readonly freeSockets: number;
  readonly requests: number;
  readonly totalSockets: number;
}

export function getAgentStats(agent: HTTPAgentInstance): AgentStats {
  return {
    sockets: countAgentEntries(agent.sockets),

    freeSockets: countAgentEntries(agent.freeSockets),

    requests: countAgentEntries(agent.requests),

    totalSockets:
      countAgentEntries(agent.sockets) + countAgentEntries(agent.freeSockets),
  };
}

function countAgentEntries(entries: Record<string, unknown>): number {
  let total = 0;

  for (const value of Object.values(entries)) {
    if (Array.isArray(value)) {
      total += value.length;
    } else {
      total += 1;
    }
  }

  return total;
}

/* -------------------------------------------------------------------------- */
/* Agent Lifecycle                                                            */
/* -------------------------------------------------------------------------- */

export function destroyAgent(agent: HTTPAgentInstance): void {
  agent.destroy();
}

export function closeAgent(agent: HTTPAgentInstance): void {
  agent.destroy();
}

/* -------------------------------------------------------------------------- */
/* Socket Configuration                                                       */
/* -------------------------------------------------------------------------- */

export function configureAgentTimeout(
  agent: HTTPAgentInstance,
  timeout: number,
): void {
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new RangeError("Agent timeout must be a non-negative finite number.");
  }

  if ("options" in agent) {
    agent.options.timeout = timeout;
  }
}

/* -------------------------------------------------------------------------- */
/* Shared Agent Registry                                                      */
/* -------------------------------------------------------------------------- */

const agentRegistry = new Map<string, HTTPAgentInstance>();

export interface AgentRegistryKey {
  readonly protocol: HTTPAgentProtocol;
  readonly name?: string;
}

export function getOrCreateAgent(
  key: string | AgentRegistryKey,
  options: HTTPAgentConfig | HTTPSAgentConfig = {},
): HTTPAgentInstance {
  const registryKey = normalizeRegistryKey(key);

  /*
   * The key includes the TLS-relevant options. Keying on protocol+host alone
   * meant the first caller's `ca`/`cert`/`servername`/`rejectUnauthorized`
   * silently applied to every later caller for that host: a staging call
   * passing `rejectUnauthorized: false` would have disabled certificate
   * verification for a caller that had pinned a CA, with no way to detect it.
   */
  const cacheKey = `${registryKey}|${tlsFingerprint(options)}`;

  const existing = agentRegistry.get(cacheKey);

  if (existing) {
    return existing;
  }

  const agent = createAgent({
    ...options,
    protocol: registryKey.startsWith("https:")
      ? "https"
      : (options.protocol ?? "http"),
  });

  agentRegistry.set(cacheKey, agent);

  return agent;
}

/**
 * Builds a stable fingerprint of the TLS-relevant fields of an agent config.
 */
function tlsFingerprint(options: HTTPAgentConfig | HTTPSAgentConfig): string {
  const tls = options as HTTPSAgentConfig;

  const parts = [
    describeCredential(tls.ca),
    describeCredential(tls.cert),
    describeCredential(tls.key),
    tls.servername ?? "",
    tls.rejectUnauthorized === undefined ? "" : String(tls.rejectUnauthorized),
  ];

  return parts.join("|");
}

function describeCredential(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return createHash("sha256").update(value).digest("hex");
  }

  if (value instanceof Uint8Array) {
    return createHash("sha256").update(value).digest("hex");
  }

  if (Array.isArray(value)) {
    return value.map((entry) => describeCredential(entry)).join(",");
  }

  return "opaque";
}

export function getAgent(
  key: string | AgentRegistryKey,
): HTTPAgentInstance | undefined {
  return agentRegistry.get(normalizeRegistryKey(key));
}

export function hasAgent(key: string | AgentRegistryKey): boolean {
  return agentRegistry.has(normalizeRegistryKey(key));
}

export function removeAgent(
  key: string | AgentRegistryKey,
  destroy = true,
): boolean {
  const registryKey = normalizeRegistryKey(key);

  const agent = agentRegistry.get(registryKey);

  if (!agent) {
    return false;
  }

  agentRegistry.delete(registryKey);

  if (destroy) {
    agent.destroy();
  }

  return true;
}

export function clearAgents(destroy = true): void {
  if (destroy) {
    for (const agent of agentRegistry.values()) {
      agent.destroy();
    }
  }

  agentRegistry.clear();
}

export function getRegisteredAgentKeys(): string[] {
  return Array.from(agentRegistry.keys());
}

/* -------------------------------------------------------------------------- */
/* Registry Helpers                                                           */
/* -------------------------------------------------------------------------- */

function normalizeRegistryKey(key: string | AgentRegistryKey): string {
  if (typeof key === "string") {
    return normalizeURLKey(key);
  }

  const protocol = key.protocol === "https" ? "https:" : "http:";

  return key.name ? `${protocol}//${key.name}` : protocol;
}

function normalizeURLKey(value: string): string {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);

    return `${url.protocol}//${url.host}`;
  } catch {
    return value.trim();
  }
}

/* -------------------------------------------------------------------------- */
/* Global Defaults                                                            */
/* -------------------------------------------------------------------------- */

let defaultHTTPAgent: HTTPAgent | undefined;

let defaultHTTPSAgent: HTTPSAgent | undefined;

export function getDefaultHTTPAgent(): HTTPAgent {
  if (!defaultHTTPAgent) {
    defaultHTTPAgent = createHTTPAgent();
  }

  return defaultHTTPAgent;
}

export function getDefaultHTTPSAgent(): HTTPSAgent {
  if (!defaultHTTPSAgent) {
    defaultHTTPSAgent = createHTTPSAgent();
  }

  return defaultHTTPSAgent;
}

export function setDefaultHTTPAgent(agent: HTTPAgent): void {
  if (defaultHTTPAgent && defaultHTTPAgent !== agent) {
    defaultHTTPAgent.destroy();
  }

  defaultHTTPAgent = agent;
}

export function setDefaultHTTPSAgent(agent: HTTPSAgent): void {
  if (defaultHTTPSAgent && defaultHTTPSAgent !== agent) {
    defaultHTTPSAgent.destroy();
  }

  defaultHTTPSAgent = agent;
}

export function resetDefaultAgents(): void {
  defaultHTTPAgent?.destroy();
  defaultHTTPSAgent?.destroy();

  defaultHTTPAgent = undefined;

  defaultHTTPSAgent = undefined;
}

/* -------------------------------------------------------------------------- */
/* Agent Selection                                                            */
/* -------------------------------------------------------------------------- */

export function getAgentForProtocol(
  protocol: string | undefined,
): HTTPAgentInstance {
  const normalized = protocol?.toLowerCase();

  if (normalized === "https:" || normalized === "https") {
    return getDefaultHTTPSAgent();
  }

  return getDefaultHTTPAgent();
}

export function isHTTPAgent(agent: HTTPAgentInstance): agent is HTTPAgent {
  return agent instanceof HTTPAgent;
}

export function isHTTPSAgent(agent: HTTPAgentInstance): agent is HTTPSAgent {
  return agent instanceof HTTPSAgent;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validateAgentOptions(options: HTTPAgentOptionsBase): void {
  validateNonNegativeInteger(options.keepAliveMsecs, "keepAliveMsecs");

  validatePositiveInteger(options.maxSockets, "maxSockets");

  validatePositiveInteger(options.maxFreeSockets, "maxFreeSockets");

  validatePositiveInteger(options.maxTotalSockets, "maxTotalSockets");

  if (
    options.maxFreeSockets !== undefined &&
    options.maxSockets !== undefined &&
    options.maxFreeSockets > options.maxSockets
  ) {
    throw new RangeError("maxFreeSockets cannot exceed maxSockets.");
  }

  if (
    options.maxTotalSockets !== undefined &&
    options.maxSockets !== undefined &&
    options.maxTotalSockets < options.maxSockets
  ) {
    throw new RangeError("maxTotalSockets cannot be less than maxSockets.");
  }

  if (
    options.timeout !== undefined &&
    (!Number.isFinite(options.timeout) || options.timeout < 0)
  ) {
    throw new RangeError("timeout must be a non-negative finite number.");
  }
}

function validateNonNegativeInteger(
  value: number | undefined,
  name: string,
): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function validatePositiveInteger(
  value: number | undefined,
  name: string,
): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
