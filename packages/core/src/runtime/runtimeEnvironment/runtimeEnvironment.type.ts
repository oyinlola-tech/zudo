import type { RuntimeMode, RuntimeRole } from "../runtimeOptions/index.js";

/**
 * Supported operating system platforms.
 */
export type RuntimePlatform =
  "linux" | "darwin" | "win32" | "freebsd" | "openbsd" | "android" | "other";

/**
 * Supported JavaScript runtime types.
 */
export type RuntimeEngine = "node" | "bun" | "deno" | "browser" | "unknown";

/**
 * Runtime environment variables.
 */
export type RuntimeEnvironmentVariables = Readonly<
  Record<string, string | undefined>
>;

/**
 * Basic process information.
 */
export interface RuntimeProcessInfo {
  readonly pid?: number;
  readonly ppid?: number;
  readonly cwd?: string;
  readonly execPath?: string;
  readonly arch?: string;
  readonly version?: string;
}

/**
 * Runtime host information.
 */
export interface RuntimeHostInfo {
  readonly platform: RuntimePlatform;
  readonly architecture: string;
  readonly hostname?: string;
  readonly cpuCount?: number;
}

/**
 * Runtime engine information.
 */
export interface RuntimeEngineInfo {
  readonly name: RuntimeEngine;
  readonly version?: string;
  readonly nodeCompatible: boolean;
}

/**
 * Complete runtime environment information.
 *
 * `variables` holds the full environment snapshot and may contain
 * secrets. It is deliberately excluded from {@link RuntimeEnvironment.toJSON}.
 */
export interface RuntimeEnvironmentInfo {
  readonly mode: RuntimeMode;
  readonly role: RuntimeRole;
  readonly engine: RuntimeEngineInfo;
  readonly host: RuntimeHostInfo;
  readonly process: RuntimeProcessInfo;
  readonly variables: RuntimeEnvironmentVariables;
  readonly isCI: boolean;
  readonly isContainer: boolean;
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
}

/**
 * Environment information safe for logs and serialization: everything
 * in RuntimeEnvironmentInfo except the raw variables.
 */
export type RuntimeEnvironmentSummary = Omit<
  RuntimeEnvironmentInfo,
  "variables"
>;

/**
 * Runtime environment contract.
 */
export interface RuntimeEnvironment {
  readonly info: RuntimeEnvironmentInfo;
  readonly mode: RuntimeMode;
  readonly role: RuntimeRole;
  readonly engine: RuntimeEngine;
  readonly platform: RuntimePlatform;
  get(name: string): string | undefined;
  require(name: string): string;
  has(name: string): boolean;
  isProduction(): boolean;
  isDevelopment(): boolean;
  isTest(): boolean;
  isCI(): boolean;
  isContainer(): boolean;
  /**
   * Serializable summary. Never includes environment variables.
   */
  toJSON(): RuntimeEnvironmentSummary;
}

/**
 * Options used to create a RuntimeEnvironment.
 */
export interface RuntimeEnvironmentOptions {
  readonly mode: RuntimeMode;
  readonly role: RuntimeRole;
  readonly variables?: RuntimeEnvironmentVariables;
  readonly isCI?: boolean;
  readonly isContainer?: boolean;
}

/**
 * Minimal process shape required by this module.
 */
export interface RuntimeProcess {
  readonly pid?: number;
  readonly ppid?: number;
  readonly cwd?: () => string;
  readonly execPath?: string;
  readonly arch?: string;
  readonly version?: string;
  readonly platform?: string;
  readonly env?: Record<string, string | undefined>;
  readonly versions?: Readonly<Record<string, string | undefined>>;
}

/**
 * Minimal Node OS module shape.
 */
export interface RuntimeOS {
  readonly hostname?: () => string;
  readonly cpus?: () => readonly unknown[];
}
