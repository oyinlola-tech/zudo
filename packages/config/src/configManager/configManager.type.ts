import type { ConfigValue } from "../configValue/configValue.core.js";

import type { ConfigSource } from "../configSource/configSource.core.js";

import type { ConfigLoader } from "../configLoader/configLoader.core.js";

import type { ConfigStore } from "../configStore/configStore.core.js";

import type { ConfigResolverOptions } from "../configResolver/core/configResolver.type.js";

/**
 * Configuration manager lifecycle state.
 */
export enum ConfigManagerState {
  CREATED = "created",
  LOADING = "loading",
  READY = "ready",
  RELOADING = "reloading",
  FAILED = "failed",
  DISPOSED = "disposed",
}

/**
 * Configuration manager options.
 */
export interface ConfigManagerOptions extends ConfigResolverOptions {
  readonly sources?: readonly ConfigSource[];

  readonly initialValues?: Readonly<Record<string, ConfigValue>>;

  readonly store?: ConfigStore;

  readonly loader?: ConfigLoader;

  readonly freeze?: boolean;

  /**
   * When true, the manager starts loading configuration immediately
   * on construction. Await `manager.ready()` to wait for (and surface
   * errors from) that initial load; `load()` called while the initial
   * load is in flight reuses the same promise.
   */
  readonly autoLoad?: boolean;

  readonly context?: {
    readonly environment?: string;
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  };
}

/**
 * Configuration manager status.
 */
export interface ConfigManagerStatus {
  readonly state: ConfigManagerState;
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly size: number;
  readonly lastLoadedAt?: number;
  readonly lastError?: unknown;
}

/**
 * Listener for configuration manager state changes.
 */
export type ConfigManagerListener = (status: ConfigManagerStatus) => void;
