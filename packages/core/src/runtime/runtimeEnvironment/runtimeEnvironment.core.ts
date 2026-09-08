import type { RuntimeMode, RuntimeRole } from "../runtimeOptions/index.js";
import type {
  RuntimeEngine,
  RuntimePlatform,
  RuntimeEnvironmentInfo,
  RuntimeEnvironmentSummary,
  RuntimeEnvironment,
  RuntimeEnvironmentOptions,
} from "./runtimeEnvironment.type.js";
import {
  detectRuntimeEngine,
  detectPlatform,
  detectProcessInfo,
  detectHostInfo,
  readProcessEnvironment,
  detectCI,
  detectContainer,
} from "./detection/index.js";
import { RuntimeError } from "../runtimeError/runtimeError.base.js";
import { RuntimeErrorCode } from "../runtimeError/runtimeError.type.js";

/**
 * Error thrown when a required environment variable is missing or
 * empty.
 */
export class MissingEnvironmentVariableError extends RuntimeError {
  public readonly variableName: string;

  public constructor(variableName: string) {
    super(`Required environment variable "${variableName}" is not defined.`, {
      code: RuntimeErrorCode.INVALID_ENVIRONMENT,
      metadata: { variableName },
    });

    this.name = "MissingEnvironmentVariableError";
    this.variableName = variableName;
  }
}

/**
 * Creates a new RuntimeEnvironment.
 */
export function createRuntimeEnvironment(
  options: RuntimeEnvironmentOptions,
): RuntimeEnvironment {
  return new DefaultRuntimeEnvironment(options);
}

/**
 * Default RuntimeEnvironment implementation.
 */
export class DefaultRuntimeEnvironment implements RuntimeEnvironment {
  private readonly _info: RuntimeEnvironmentInfo;

  public constructor(options: RuntimeEnvironmentOptions) {
    const variables = options.variables ?? readProcessEnvironment();
    const engine = detectRuntimeEngine();
    const platform = detectPlatform();
    const processInfo = detectProcessInfo();
    const host = detectHostInfo(platform);
    const isCI = options.isCI ?? detectCI(variables);
    const isContainer = options.isContainer ?? detectContainer(variables);

    this._info = Object.freeze({
      mode: options.mode,
      role: options.role,
      engine,
      host,
      process: processInfo,
      variables: Object.freeze({ ...variables }),
      isCI,
      isContainer,
      isProduction: options.mode === "production",
      isDevelopment: options.mode === "development",
      isTest: options.mode === "test",
    });
  }

  public get info(): RuntimeEnvironmentInfo {
    return this._info;
  }

  public get mode(): RuntimeMode {
    return this._info.mode;
  }

  public get role(): RuntimeRole {
    return this._info.role;
  }

  public get engine(): RuntimeEngine {
    return this._info.engine.name;
  }

  public get platform(): RuntimePlatform {
    return this._info.host.platform;
  }

  public get(name: string): string | undefined {
    return this._info.variables[name];
  }

  public require(name: string): string {
    const value = this.get(name);

    if (value === undefined || value.length === 0) {
      throw new MissingEnvironmentVariableError(name);
    }

    return value;
  }

  public has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  public isProduction(): boolean {
    return this._info.isProduction;
  }

  public isDevelopment(): boolean {
    return this._info.isDevelopment;
  }

  public isTest(): boolean {
    return this._info.isTest;
  }

  public isCI(): boolean {
    return this._info.isCI;
  }

  public isContainer(): boolean {
    return this._info.isContainer;
  }

  /**
   * Serializable summary of the environment.
   *
   * Environment variables are intentionally omitted: the snapshot
   * routinely contains credentials (DATABASE_URL, cloud keys, ...)
   * and must never reach structured logs or JSON.stringify output.
   */
  public toJSON(): RuntimeEnvironmentSummary {
    const { variables: _variables, ...summary } = this._info;

    return Object.freeze({
      ...summary,
      host: Object.freeze({ ...this._info.host }),
      process: Object.freeze({ ...this._info.process }),
      engine: Object.freeze({ ...this._info.engine }),
    });
  }
}
