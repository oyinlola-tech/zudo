/**
 * @zudojs/plugins/pluginTypes
 *
 * Core types for the Zudojs plugin system.
 */

export type { PluginState } from "./pluginState.type.js";
export type { PluginMetadata } from "./pluginMetadata.type.js";
export type { PluginDependency } from "./pluginDependency.type.js";
export type {
  PluginContext,
  PluginContainer,
  PluginConfig,
  PluginLogger,
  PluginEvents,
  PluginDisposable,
} from "./pluginContext.type.js";
export type { Plugin } from "./plugin.type.js";
export type { PluginErrorOptions } from "@zudojs/errors";
