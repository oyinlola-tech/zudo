/**
 * zudojs-cli — Menu Flow
 *
 * Turns a menu choice into the argument list of an existing command,
 * prompting for whatever that command requires.
 */

import { MENU_CANCELLED, MENU_ITEMS, MENU_NAME_PATTERN } from "./menu.constant.js";
import {
  MENU_CANCEL,
  type MenuCancel,
  type MenuFlowOptions,
  type MenuItem,
  type MenuOutcome,
} from "./menu.type.js";

/** Explains why a project-only entry cannot run in `cwd`. */
export function notInProjectMessage(
  item: MenuItem,
  cwd: string,
  name: string,
): string {
  return (
    `"${item.label}" needs a Zudojs project, and ${cwd} is not inside one ` +
    "(no .zudojs/manifest.json, zudojs.config.ts or zudojs block in package.json). " +
    `Choose 1 to create a project, or cd into one and run "${name}" again.`
  );
}

/** Validates the resource name asked for by "Generate code". */
function validateResourceName(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "A name is required.";
  if (!MENU_NAME_PATTERN.test(trimmed)) {
    return "Must start with a letter or digit; only letters, digits, hyphens and underscores are allowed.";
  }
  return undefined;
}

/** Collects the arguments a chosen entry's command requires. */
async function argumentsFor(
  item: MenuItem,
  options: MenuFlowOptions,
): Promise<readonly string[] | MenuCancel> {
  const { prompter } = options;

  switch (item.id) {
    case "generate": {
      const schematic = await prompter.select(
        "What do you want to generate?",
        options.schematics,
      );
      if (schematic === MENU_CANCEL) return MENU_CANCEL;
      const name = await prompter.text(
        `Name of the ${schematic}?`,
        "user",
        validateResourceName,
      );
      if (name === MENU_CANCEL) return MENU_CANCEL;
      return ["generate", schematic, name.trim()];
    }
    case "add": {
      const feature = await prompter.select(
        "Which feature do you want to add?",
        options.features,
      );
      if (feature === MENU_CANCEL) return MENU_CANCEL;
      return ["add", feature];
    }
    case "help":
      return ["--help"];
    default:
      // `create` prompts for its own name and options when run on a TTY;
      // dev, build, doctor and info take no required arguments.
      return [item.id];
  }
}

/**
 * Runs the interactive menu until the user picks something runnable,
 * exits, or cancels.
 *
 * A project-only entry chosen outside a project says so and shows the
 * menu again rather than failing after its follow-up questions.
 */
export async function runMenuFlow(
  options: MenuFlowOptions,
): Promise<MenuOutcome> {
  const { prompter } = options;

  for (;;) {
    const id = await prompter.choose(MENU_ITEMS);
    if (id === MENU_CANCEL) {
      prompter.cancel(MENU_CANCELLED);
      return { kind: "cancel" };
    }

    const item = MENU_ITEMS.find((entry) => entry.id === id);
    if (!item || item.id === "exit") return { kind: "exit" };

    if (item.project && !options.isProject(options.cwd, item.project)) {
      prompter.warn(notInProjectMessage(item, options.cwd, options.name));
      continue;
    }

    const args = await argumentsFor(item, options);
    if (args === MENU_CANCEL) {
      prompter.cancel(MENU_CANCELLED);
      return { kind: "cancel" };
    }
    return { kind: "run", args };
  }
}
