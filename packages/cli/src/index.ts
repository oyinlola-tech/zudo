/**
 * zudojs-cli
 *
 * Command-line interface framework for the Zudojs platform.
 *
 * @example
 * ```ts
 * import { createCLI, command } from "zudojs-cli";
 *
 * const app = createCLI({ name: "my-app", version: "1.0.0" });
 *
 * app.register(
 *   command("greet", (ctx) => {
 *     console.log(`Hello, ${ctx.values.name ?? "World"}!`);
 *   }),
 * );
 *
 * app.run(process.argv.slice(2));
 * ```
 */

// Types
export type {
  CLIValue,
  CLIValues,
  CLIArguments,
  CLIEnvironment,
  CLIContext,
  CLICommand,
  CLICommandDefinition,
  CLIArgument,
  CLIOptionType,
  CLIOption,
  ParsedCLIInput,
  CLIApplicationOptions,
  CLIApplication,
  CLIOutput,
  CLIWriter,
  CLIPromptOptions,
  CLIPrompt,
  CLIChoice,
  CLIHooks,
} from "./cliType/index.js";

// Constants
export {
  CLI_NAME,
  CLI_DEFAULTS,
  CLI_COMMANDS,
  CLI_ALIASES,
  CLI_OPTION_PREFIXES,
  CLI_SYMBOLS,
  CLI_MESSAGES,
  CLI_HELP,
  CLI_ENVIRONMENT,
  CLI_FORMAT,
  CLI_LIMITS,
  CLI_ERROR_CODES,
  type CLIErrorCode,
  type CLICommandName,
} from "./cliConstant/index.js";

// Errors
export {
  CLIError,
  isCLIError,
  normalizeCLIError,
  getCLIExitCode,
  getCLIErrorCode,
  type CLIErrorOptions,
  CommandNotFoundError,
  DuplicateCommandError,
  InvalidCommandNameError,
  InvalidArgumentsError,
  MissingArgumentError,
  InvalidOptionError,
  InvalidOptionNameError,
  MissingOptionValueError,
  DuplicateOptionError,
  CLIExecutionError,
  CLIPermissionError,
  CLIInterruptedError,
  CLIConfigurationError,
} from "./cliError/index.js";

// Commands
export {
  CLICommandRegistry,
  CLICommandBuilder,
  createCommand,
  command,
  executeCommand,
  validateCommand,
  isCLICommand,
  sortCommands,
} from "./cliCommand/index.js";

// Parser
export {
  CLIParser,
  type CLIParserOptions,
  parseCLIArguments,
  parseOptionValue,
  parseBoolean,
  isOption,
  isLongOption,
  isShortOption,
  resolveCommand,
  normalizeCLIValue,
} from "./cliParser/index.js";

// Application
export {
  ZudojsCLI,
  createCLI,
  createCLIWriter,
  createCLILogger,
  formatCLILogLine,
  registerCLIInterruptHandler,
  type CLILoggerOptions,
} from "./cliApplication/index.js";

// Version
export {
  getCLIVersion,
  formatCLIVersion,
  getVersionString,
  isValidVersion,
  compareVersions,
  parseVersion,
  isCompatibleVersion,
  checkForNewerVersion,
  isUpdateCheckDisabled,
  type CLIVersionInfo,
  type UpdateCheckOptions,
  type UpdateCheckResult,
} from "./cliVersion/index.js";

// Adapters
export type {
  FrontendAdapter,
  FrontendGenerationContext,
  FrontendFeatures,
  DependencyRequirement,
  ValidationResult,
} from "./adapters/frontend/index.js";

export {
  ReactAdapter,
  NextAdapter,
  VueAdapter,
  NuxtAdapter,
  AngularAdapter,
  SvelteAdapter,
  SvelteKitAdapter,
  AstroAdapter,
  VanillaAdapter,
  FlutterAdapter,
  ReactNativeAdapter,
} from "./adapters/frontend/index.js";

export {
  PnpmAdapter,
  NpmAdapter,
  YarnAdapter,
  BunAdapter,
} from "./adapters/package-managers/index.js";

export {
  PostgresAdapter,
  MySqlAdapter,
  SqliteAdapter,
} from "./adapters/databases/index.js";

// Resolvers
export {
  DependencyResolver,
  type DependencyResolutionResult,
  type ResolvedDependency,
  type DependencyConflict,
} from "./resolvers/dependency/index.js";

export { detectArchitecture } from "./resolvers/index.js";
export {
  resolveProjectPath,
  findProjectRoot,
} from "./resolvers/project.resolver.js";
export {
  CapabilityResolver,
  type CapabilityDependency,
  type CapabilityResolutionResult,
} from "./resolvers/capability/index.js";
export {
  ConfigurationResolver,
  type ResolvedConfiguration,
} from "./resolvers/configuration/index.js";
export {
  resolveProjectLayout,
  detectPackageManager,
  type ProjectLayout,
  type ProjectLayoutType,
  type ProjectLayoutSource,
} from "./resolvers/layout/index.js";

// Validators
export {
  EnvironmentValidator,
  type EnvironmentCheck,
  type EnvironmentValidationResult,
} from "./validators/index.js";

export {
  ProjectValidator,
  type ProjectCheck,
  type ProjectValidationResult,
} from "./validators/index.js";

export {
  CompatibilityValidator,
  type CompatibilityCheck,
  type CompatibilityResult,
} from "./validators/compatibility/index.js";

// Registries
export { FrontendAdapterRegistry } from "./registries/index.js";
export { PackageManagerRegistry } from "./registries/index.js";
export {
  GeneratorRegistry,
  type GeneratorRegistryEntry,
} from "./registries/generator/index.js";
export {
  DependencyRegistry,
  type DependencyRecord,
} from "./registries/dependency/index.js";

// Generators
export { generateProject } from "./generators/project/project.generator.js";
export { BackendGenerator } from "./generators/backend/index.js";
export { FrontendGenerator } from "./generators/frontend/index.js";
export { FullstackComposer } from "./generators/fullstack/index.js";
export { IntegrationGenerator } from "./generators/integration/index.js";
export {
  InfrastructureGenerator,
  type InfrastructureOptions,
} from "./generators/infrastructure/index.js";

// Runners
export { ProcessRunner, type ProcessOptions } from "./runners/process/index.js";
export {
  PackageManagerRunner,
  type PackageManagerRunOptions,
} from "./runners/package-manager/index.js";
export {
  TaskRunner,
  type TaskDefinition,
  type TaskResult,
} from "./runners/task/index.js";

// Rollback
export { RollbackManager, type RollbackEntry } from "./rollback/index.js";

// Manifest
export { ManifestManager, type ZudojsManifest } from "./manifest/index.js";

// Types
export type {
  ProjectConfiguration,
  ProjectType,
  BackendArchitecture,
  FrontendFramework,
  FrontendArchitecture,
  DatabaseProvider,
  ApiStyle,
  PackageManagerType,
} from "./types/projectConfiguration.type.js";

export type {
  ScaffoldOptions,
  ArchitectureType,
  PackageManager,
  DatabaseEngine,
  ProjectTemplate,
  GenerateOptions,
} from "./types/index.js";
