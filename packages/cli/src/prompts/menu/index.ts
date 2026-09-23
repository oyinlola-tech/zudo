/**
 * zudojs-cli — Interactive Menu
 *
 * The numbered menu a bare `zudojs` / `zudo` opens on an interactive
 * terminal: entries, the digit-or-arrow select prompt, the flow that turns
 * a choice into a command line, and the terminal prompter.
 */

export {
  MENU_CANCEL,
  type MenuCancel,
  type MenuFlowOptions,
  type MenuItem,
  type MenuItemId,
  type MenuOutcome,
  type MenuProjectScope,
  type MenuPrompter,
} from "./menu.type.js";
export {
  MENU_CANCELLED,
  MENU_ITEMS,
  MENU_MESSAGE,
  MENU_NAME_PATTERN,
} from "./menu.constant.js";
export { numberedSelect, type NumberedSelectIO } from "./menu.select.js";
export { notInProjectMessage, runMenuFlow } from "./menu.flow.js";
export { createTerminalMenuPrompter } from "./menu.adapter.js";
