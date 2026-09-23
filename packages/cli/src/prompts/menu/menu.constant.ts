/**
 * zudojs-cli — Menu Entries
 *
 * The numbered entries of the interactive menu, in display order.
 */

import type { MenuItem } from "./menu.type.js";

/** Menu entries; `key` is the digit that selects each one. */
export const MENU_ITEMS: readonly MenuItem[] = Object.freeze([
  { id: "create", key: "1", label: "Create a new project" },
  { id: "dev", key: "2", label: "Start dev server", project: "cwd" },
  { id: "generate", key: "3", label: "Generate code", project: "ancestor" },
  { id: "add", key: "4", label: "Add a feature", project: "cwd" },
  { id: "build", key: "5", label: "Build", project: "ancestor" },
  { id: "doctor", key: "6", label: "Doctor", hint: "check the project" },
  { id: "info", key: "7", label: "Info", hint: "CLI and project details" },
  { id: "help", key: "8", label: "Help", hint: "list every command" },
  { id: "exit", key: "0", label: "Exit" },
]);

/** The question the menu asks. */
export const MENU_MESSAGE = "What would you like to do?";

/** Printed when the menu is left with Esc or Ctrl+C. */
export const MENU_CANCELLED = "Operation cancelled.";

/**
 * Names accepted by the "Generate code" follow-up.
 *
 * The same shape the project-name prompt allows: a leading "-" would be
 * parsed as an option once the name is handed to `generate`.
 */
export const MENU_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
