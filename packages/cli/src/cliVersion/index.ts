/**
 * zudojs-cli — CLI Version
 *
 * Semantic version parsing, comparison, formatting, and the update check.
 */

export {
  getCLIVersion,
  formatCLIVersion,
  getVersionString,
  isValidVersion,
  compareVersions,
  parseVersion,
  isCompatibleVersion,
  type CLIVersionInfo,
} from "./cliVersion.core.js";
export {
  checkForNewerVersion,
  isUpdateCheckDisabled,
  type UpdateCheckOptions,
  type UpdateCheckResult,
} from "./cliVersion.update.js";
