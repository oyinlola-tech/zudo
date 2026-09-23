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
  CLI_OPTION_PREFIXES,
} from "../cliConstant/cliConstant.value.js";
import { CLIExecutionError, normalizeCLIError } from "../cliError/index.js";
import { CommandNotFoundError } from "../cliError/cliError.command.js";
import { InvalidArgumentsError } from "../cliError/cliError.argument.js";
import { CLICommandRegistry } from "../cliCommand/cliCommand.registry.js";
import { executeCommand } from "../cliCommand/cliCommand.factory.js";
import { CLIParser, resolveCommand } from "../cliParser/index.js";
import type { Logger } from "@zudojs/logger";
import { createCLIWriter } from "./cliApplication.writer.js";
import { createCLILogger } from "./cliApplication.logger.js";
import {
  isHelpFlag,
  isHelpRequest,
  isVersionRequest,
  printVersion,
  printHelp,
} from "./cliApplication.builtins.js";
import { printCommandHelp } from "./cliApplication.help.js";
import {
  escapeControlCharacters,
  failureHints,
  localizeCommandName,
  locateCommand,
  requireCommand,
} from "./invocation/index.js";

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
    this.commands = new CLICommandRegistry();
    this.logger =
      options.logger ??
      createCLILogger({ transform: (line) => this.localize(line) });
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
        // `zudojs help create` and `zudojs --help create` name a command.
        const target = this.resolveHelpTarget(args);
        if (target) {
          printCommandHelp(this.writer, this.name, target);
          return CLI_EXIT_CODES.SUCCESS;
        }
        this.printApplicationHelp();
        return CLI_EXIT_CODES.SUCCESS;
      }

      if (isVersionRequest(args)) {
        // `zudojs -v extra` used to print the version and exit 0, silently
        // discarding the rest of the line.
        if (args.length > 1) {
          throw new InvalidArgumentsError(
            `Unexpected argument "${args[1]}" after "${args[0]}".`,
          );
        }
        printVersion(this.writer, this.version);
        return CLI_EXIT_CODES.SUCCESS;
      }

      if (args.length === 0) {
        this.printApplicationHelp();
        return CLI_EXIT_CODES.SUCCESS;
      }

      const { index, command } = requireCommand(
        args,
        this.commands.list(),
        this.name,
      );
      const commandArgs = args.slice(index + 1);

      // Checked before parsing: `--help` is not a declared option, so the
      // parser would reject it as invalid and exit 2.
      // Tokens after `--` are opaque, so `create -- --help` is not a request.
      const escape = commandArgs.indexOf("--");
      const flags = escape < 0 ? commandArgs : commandArgs.slice(0, escape);
      if (flags.some(isHelpFlag)) {
        printCommandHelp(this.writer, this.name, command);
        return CLI_EXIT_CODES.SUCCESS;
      }

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
          const { index, command } = locateCommand(args, this.commands.list());
          const commandArgs = command ? args.slice(index + 1) : args;
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

      const lines = [
        this.localize(normalized.message),
        ...this.hintsFor(args, normalized.exitCode),
      ];
      for (const line of lines) {
        this.writer.errorLine(escapeControlCharacters(line));
      }
      return normalized.exitCode;
    } finally {
      this.running = false;
    }
  }

  /* ---- Internal ---- */

  private printApplicationHelp(): void {
    printHelp(
      this.writer,
      this.name,
      this.version,
      this.description,
      this.commands.list(),
    );
  }

  /**
   * Resolves the command named after a help request, if any.
   *
   * Throws when a name is given that is not registered, so `zudojs help
   * bogus` says so instead of silently printing the global help.
   */
  private resolveHelpTarget(args: CLIArguments): CLICommand | undefined {
    const target = args
      .slice(1)
      .find((arg) => !arg.startsWith(CLI_OPTION_PREFIXES.SHORT));

    if (target === undefined) return undefined;

    const command = resolveCommand(this.commands.list(), target);
    if (!command) throw new CommandNotFoundError(target);
    return command;
  }

  /** Rewrites `zudojs <command>` examples to the name the user typed. */
  private localize(text: string): string {
    const words = this.commands
      .list()
      .flatMap((command) => [command.name, ...(command.aliases ?? [])]);
    return localizeCommandName(text, this.name, words);
  }

  /** The "did you mean" / "run --help" lines printed under a usage error. */
  private hintsFor(args: CLIArguments, exitCode: number): readonly string[] {
    const commands = this.commands.list();
    const helpTarget = isHelpRequest(args) ? args.slice(1) : args;
    const { index, command } = locateCommand(helpTarget, commands);
    return failureHints({
      name: this.name,
      exitCode,
      commands,
      ...(command ? { command } : {}),
      ...(index >= 0 && !command
        ? { unknownCommand: helpTarget[index]! }
        : {}),
    });
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
