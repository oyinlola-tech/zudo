/**
 * @zudojs/plugins/pluginDiagnostics
 *
 * Plugin health checks and diagnostic reporting.
 */

export type {
  PluginHealthStatus,
  PluginHealth,
  PluginDiagnostic,
  PluginDiagnosticReport,
} from "./pluginDiagnostic.core.js";
export {
  createHealthyHealth,
  createDegradedHealth,
  createUnhealthyHealth,
  buildDiagnosticReport,
  resolvePluginHealth,
} from "./pluginDiagnostic.core.js";
