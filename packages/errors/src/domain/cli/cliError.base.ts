/**
 * Errors raised by the `zudojs-cli` scaffolding and generation commands.
 *
 * Owned here so the CLI (and tools that drive it) can match them with
 * `instanceof` against a single class hierarchy.
 */

import { ApplicationError } from "../app/application.error.js";

/** Invalid user input to a CLI command (bad name, unknown option value). */
export class CLIValidationError extends ApplicationError {
  constructor(message: string) {
    super(message, { isOperational: true });
  }
}

/** A generator or scaffolder failed while producing files. */
export class CLIGenerationError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

/** The command needs a Zudojs project but was run outside one. */
export class CLINotInProjectError extends ApplicationError {
  constructor() {
    super("This command must be run inside a Zudojs project directory.", {
      isOperational: true,
    });
  }
}

/** A template could not be found or rendered. */
export class CLITemplateError extends ApplicationError {
  constructor(message: string) {
    super(message);
  }
}
