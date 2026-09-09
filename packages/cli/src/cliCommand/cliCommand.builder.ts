/**
 * zudojs-cli — Command Builder
 *
 * Fluent builder for constructing CLI commands.
 */

import type { CLICommand } from "../cliType/cliType.type.js";
import { createCommand } from "./cliCommand.factory.js";

/* -------------------------------------------------------------------------- */
/* Command Builder                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Fluent builder for constructing CLI commands.
 */
export class CLICommandBuilder {
  private nameValue = "";
  private descriptionValue?: string;
  private aliasesValue: string[] = [];
  private optionsValue: CLICommand["options"] = [];
  private argumentsValue: CLICommand["arguments"] = [];
  private commandsValue: CLICommand["commands"] = [];
  private executeValue?: CLICommand["execute"];

  public name(value: string): this {
    this.nameValue = value;
    return this;
  }

  public description(value: string): this {
    this.descriptionValue = value;
    return this;
  }

  public alias(value: string): this {
    this.aliasesValue.push(value);
    return this;
  }

  public aliases(values: readonly string[]): this {
    this.aliasesValue.push(...values);
    return this;
  }

  public options(values: CLICommand["options"]): this {
    this.optionsValue = values ?? [];
    return this;
  }

  public arguments(values: CLICommand["arguments"]): this {
    this.argumentsValue = values ?? [];
    return this;
  }

  public commands(values: CLICommand["commands"]): this {
    this.commandsValue = values ?? [];
    return this;
  }

  public execute(handler: CLICommand["execute"]): this {
    this.executeValue = handler;
    return this;
  }

  /** Builds the CLI command. */
  public build(): CLICommand {
    if (!this.executeValue) {
      throw new TypeError("A command execute handler is required.");
    }

    return createCommand({
      name: this.nameValue,
      description: this.descriptionValue,
      aliases: this.aliasesValue,
      options: this.optionsValue,
      arguments: this.argumentsValue,
      commands: this.commandsValue,
      execute: this.executeValue,
    });
  }
}
