/**
 * zudojs-cli — Menu Types
 *
 * Contracts for the interactive menu shown by a bare `zudojs` / `zudo`.
 */

import type { CLIChoiceOption } from "../../constants/index.js";

/** Returned by a prompt when the user pressed Esc or Ctrl+C. */
export const MENU_CANCEL: unique symbol = Symbol("zudojs.menu.cancel");

/** The cancel sentinel's type. */
export type MenuCancel = typeof MENU_CANCEL;

/** Identifier of one menu entry. */
export type MenuItemId =
  | "create"
  | "dev"
  | "generate"
  | "add"
  | "build"
  | "doctor"
  | "info"
  | "help"
  | "exit";

/**
 * How an entry checks that it is inside a project.
 *
 * `cwd` mirrors `dev` and `add`, which only look at the current directory;
 * `ancestor` mirrors `build` and `generate`, which walk up to the root.
 */
export type MenuProjectScope = "cwd" | "ancestor";

/** One numbered entry of the menu. */
export interface MenuItem {
  readonly id: MenuItemId;
  /** The digit that selects the entry. */
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  /** Set on entries that only work inside a Zudojs project. */
  readonly project?: MenuProjectScope;
}

/**
 * The prompts the menu needs, injectable so the flow can be tested
 * without a terminal.
 */
export interface MenuPrompter {
  /** Shows the numbered menu and resolves with the chosen entry. */
  choose(items: readonly MenuItem[]): Promise<MenuItemId | MenuCancel>;
  /** Asks the user to pick one of several values. */
  select(
    message: string,
    choices: readonly CLIChoiceOption[],
  ): Promise<string | MenuCancel>;
  /** Asks for free text; `validate` returns an error message or nothing. */
  text(
    message: string,
    placeholder: string,
    validate: (value: string) => string | undefined,
  ): Promise<string | MenuCancel>;
  /** Tells the user an entry cannot run here. */
  warn(message: string): void;
  /** Reports that the menu was cancelled. */
  cancel(message: string): void;
}

/** What the menu decided. */
export type MenuOutcome =
  | { readonly kind: "run"; readonly args: readonly string[] }
  | { readonly kind: "exit" }
  | { readonly kind: "cancel" };

/** Dependencies of the menu flow. */
export interface MenuFlowOptions {
  readonly prompter: MenuPrompter;
  readonly cwd: string;
  /** The name the user typed, for messages (`zudo` or `zudojs`). */
  readonly name: string;
  /** Whether `cwd` is inside a Zudojs project for the given scope. */
  readonly isProject: (cwd: string, scope: MenuProjectScope) => boolean;
  readonly schematics: readonly CLIChoiceOption[];
  readonly features: readonly CLIChoiceOption[];
}
