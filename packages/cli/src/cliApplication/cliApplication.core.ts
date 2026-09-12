/**
 * zudojs-cli — CLI Application
 *
 * Main CLI application class that orchestrates command registration,
 * parsing, execution, and built-in help/version handling.
 */

import type {
  CLIApplication,
  CLIApplicationOptions,
  CLIArguments,
  CLICommand,
  CLIContext,
  CLIEnvironment,
  CLIHooks,
  CLIWriter,
} from "../cliType/cliType.type.js";
import {
  CLI_DEFAULTS,
  CLI_EXIT_CODES,
} from "../cliConstant/cliConstant.value.js";
import { CLIExecutionError, normalizeCLIError } from "../cliError/index.js";
import { CommandNotFoundError } from "../cliError/cliError.command.js";
import { CLICommandRegistry } from "../cliCommand/cliCommand.registry.js";
import { executeCommand } from "../cliCommand/cliCommand.factory.js";
import { CLIParser, resolveCommand } from "../cliParser/index.js";
import type { Logger } from "@zudojs/logger";
import { createCLIWriter } from "./cliApplication.writer.js";
import { createCLILogger } from "./cliApplication.logger.js";
import {
  isHelpRequest,
  isVersionRequest,
  printVersion,
  printHelp,
} from "./cliApplication.builtins.js";

/* -------------------------------------------------------------------------- */
/* Application                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Main CLI application that registers commands, parses arguments,
 * and executes handlers.
 */
export class ZudojsCLI implements CLIApplication {
  public readonly name: string;
  public readonly version?: string;
  public readonly description?: string;
  public readonly commands: CLICommandRegistry;
  public readonly parser: CLIParser;
  public readonly writer: CLIWriter;

  private readonly cwd: string;
  private readonly env: CLIEnvironment;
  private readonly logger: Logger;
  private readonly hooks: CLIHooks;
  private running = false;

  constructor(options: CLIApplicationOptions = {}) {
    this.name = options.name ?? CLI_DEFAULTS.NAME;
    this.version = options.version ?? CLI_DEFAULTS.VERSION;
    this.description = options.description ?? CLI_DEFAULTS.DESCRIPTION;
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? (process.env as CLIEnvironment);
    this.logger = options.logger ?? createCLILogger();
    this.commands = new CLICommandRegistry();
    this.parser = new CLIParser();
    this.writer = createCLIWriter();
    this.hooks = {};
  }

  /** Registers a single command. */
  public register(command: CLICommand): this {
    this.commands.register(command);
    return this;
  }

  /** Registers multiple commands. */
  public registerMany(commands: readonly CLICommand[]): this {
    this.commands.registerMany(commands);
    return this;
  }

  /** Sets lifecycle hooks. */
  public use(hooks: CLIHooks): this {
    if (hooks.beforeRun) this.hooks.beforeRun = hooks.beforeRun;
    if (hooks.afterRun) this.hooks.afterRun = hooks.afterRun;
    if (hooks.onError) this.hooks.onError = hooks.onError;
    return this;
  }

  /** Runs the CLI application. */
  public async run(
    args: CLIArguments = process.argv.slice(2),
  ): Promise<number> {
    if (this.running) {
      throw new CLIExecutionError("The CLI application is already running.");
    }

    this.running = true;

    try {
      if (isHelpRequest(args)) {
        printHelp(
          this.writer,
          this.name,
          this.version,
          this.description,
          this.commands.list(),
        );
        return CLI_EXIT_CODES.SUCCESS;
      }

      if (isVersionRequest(args)) {
        printVersion(this.writer, this.version);
        return CLI_EXIT_CODES.SUCCESS;
      }

      const command = this.findCommand(args);

      if (!command) {
        if (args.length === 0) {
          printHelp(
            this.writer,
            this.name,
            this.version,
            this.description,
            this.commands.list(),
          );
          return CLI_EXIT_CODES.SUCCESS;
        }
        throw new CommandNotFoundError(String(args[0]));
      }

      const commandArgs = this.getCommandArguments(args, command);
      const commandContext = this.createContext(commandArgs, command);

      if (this.hooks.beforeRun) {
        await this.hooks.beforeRun(commandContext);
      }

      await executeCommand(command, commandContext);

      if (this.hooks.afterRun) {
        await this.hooks.afterRun(commandContext, CLI_EXIT_CODES.SUCCESS);
      }

      return CLI_EXIT_CODES.SUCCESS;
    } catch (error) {
      const normalized = normalizeCLIError(error);

      if (this.hooks.onError) {
        // Building the fallback context must never rethrow: if the original
        // error came from argument parsing, re-parsing would fail again.
        let fallbackContext: CLIContext;
        try {
          const command = this.findCommand(args);
          const commandArgs = command
            ? this.getCommandArguments(args, command)
            : args;
          fallbackContext = this.createContext(commandArgs, command);
        } catch {
          fallbackContext = {
            args,
            values: {},
            command: undefined,
            cwd: this.cwd,
            env: this.env,
            logger: this.logger,
          };
        }
        await this.hooks.onError(normalized, fallbackContext);
      }

      this.writer.errorLine(normalized.message);
      return normalized.exitCode;
    } finally {
      this.running = false;
    }
  }

  /* ---- Internal ---- */

  private findCommand(args: CLIArguments): CLICommand | undefined {
    for (const arg of args) {
      if (arg.startsWith("-")) continue;
      const command = resolveCommand(this.commands.list(), arg);
      if (command) return command;
    }
    return undefined;
  }

  private getCommandArguments(
    args: CLIArguments,
    command: CLICommand,
  ): CLIArguments {
    const index = args.findIndex(
      (arg) => arg === command.name || command.aliases?.includes(arg),
    );
    if (index < 0) return args;
    return args.slice(index + 1);
  }

  private createContext(args: CLIArguments, command?: CLICommand): CLIContext {
    const parsed = this.parser.parse(args, command);
    return {
      args,
      values: parsed.options,
      command: command?.name,
      cwd: this.cwd,
      env: this.env,
      logger: this.logger,
    };
  }

  /** Whether the application is currently running. */
  public get isRunning(): boolean {
    return this.running;
  }

  /** Number of registered commands. */
  public get commandCount(): number {
    return this.commands.size;
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

/** Creates a new CLI application. */
export function createCLI(options: CLIApplicationOptions = {}): ZudojsCLI {
  return new ZudojsCLI(options);
}
