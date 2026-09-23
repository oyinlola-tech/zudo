/**
 * zudojs-cli — Numbered Select
 *
 * A select prompt that takes either a digit or the arrow keys.
 *
 * `@clack/prompts`' `select` has no hook for "press 3 to pick the third
 * entry", so this drives the keypress stream itself, with clack's glyphs and
 * readline setup so it hands the terminal cleanly to the prompts after it.
 */

import * as readline from "node:readline";
import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { MENU_MESSAGE } from "./menu.constant.js";
import {
  MENU_CANCEL,
  type MenuCancel,
  type MenuItem,
  type MenuItemId,
} from "./menu.type.js";

/** The streams the prompt reads keys from and draws on. */
export interface NumberedSelectIO {
  readonly input: NodeJS.ReadableStream & {
    readonly isTTY?: boolean;
    setRawMode?(mode: boolean): unknown;
  };
  readonly output: NodeJS.WritableStream;
}

/** A decoded keypress, as `node:readline` emits it. */
type Key = { readonly name?: string; readonly ctrl?: boolean };

type Style = Parameters<typeof styleText>[0];

const HIDE_CURSOR = "\u001B[?25l";
const SHOW_CURSOR = "\u001B[?25h";

/** Renders the frame for the current cursor position or final state. */
function renderFrame(
  items: readonly MenuItem[],
  cursor: number,
  state: "active" | "submit" | "cancel",
  paint: (style: Style, text: string) => string,
): string[] {
  const bar = paint("gray", p.S_BAR);
  const current = items[cursor]!;
  if (state !== "active") {
    const submitted = state === "submit";
    const symbol = submitted
      ? paint("green", p.S_STEP_SUBMIT)
      : paint("red", p.S_STEP_CANCEL);
    const label = `${current.key}. ${current.label}`;
    return [
      bar,
      `${symbol}  ${MENU_MESSAGE}`,
      `${bar}  ${paint(submitted ? "dim" : ["strikethrough", "dim"], label)}`,
    ];
  }
  const digits = items.map((item) => Number(item.key)).filter(Number.isFinite);
  const keys = `${Math.min(...digits)}-${Math.max(...digits)}`;
  return [
    bar,
    `${paint("cyan", p.S_STEP_ACTIVE)}  ${MENU_MESSAGE}`,
    ...items.map((item, index) => {
      const active = index === cursor;
      const radio = active
        ? paint("green", p.S_RADIO_ACTIVE)
        : paint("dim", p.S_RADIO_INACTIVE);
      const text = `${item.key}. ${item.label}`;
      const hint = active && item.hint ? paint("dim", ` (${item.hint})`) : "";
      return `${paint("cyan", p.S_BAR)}  ${radio} ${active ? text : paint("dim", text)}${hint}`;
    }),
    `${paint("cyan", p.S_BAR_END)}  ${paint("dim", `↑/↓ move · ${keys} pick · Enter select · Esc exit`)}`,
  ];
}

/**
 * Shows the numbered menu and resolves with the chosen entry's id, or
 * `MENU_CANCEL` on Esc / Ctrl+C.
 *
 * A digit picks its entry at once; ↑/↓ (or k/j) move and Enter confirms.
 */
export function numberedSelect(
  items: readonly MenuItem[],
  io: NumberedSelectIO,
): Promise<MenuItemId | MenuCancel> {
  const { input, output } = io;
  const paint = (style: Style, text: string): string =>
    styleText(style, text, { stream: output });

  return new Promise((resolve) => {
    let cursor = 0;
    let drawn = 0;
    const rl = readline.createInterface({
      input,
      tabSize: 2,
      prompt: "",
      escapeCodeTimeout: 50,
      terminal: true,
    });
    readline.emitKeypressEvents(input, rl);

    const draw = (state: "active" | "submit" | "cancel"): void => {
      if (drawn > 0) {
        readline.moveCursor(output, 0, -(drawn - 1));
        readline.cursorTo(output, 0);
        readline.clearScreenDown(output);
      }
      const lines = renderFrame(items, cursor, state, paint);
      output.write(lines.join("\n"));
      drawn = lines.length;
    };

    const finish = (result: MenuItemId | MenuCancel): void => {
      input.removeListener("keypress", onKeypress);
      draw(result === MENU_CANCEL ? "cancel" : "submit");
      output.write(`\n${SHOW_CURSOR}`);
      if (input.isTTY) input.setRawMode?.(false);
      rl.close();
      resolve(result);
    };

    const onKeypress = (text: string | undefined, key: Key = {}): void => {
      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        return finish(MENU_CANCEL);
      }
      if (key.name === "return" || key.name === "enter") {
        return finish(items[cursor]!.id);
      }
      if (key.name === "up" || key.name === "k") {
        cursor = (cursor - 1 + items.length) % items.length;
      } else if (key.name === "down" || key.name === "j") {
        cursor = (cursor + 1) % items.length;
      } else {
        const index = items.findIndex((item) => item.key === text);
        if (index < 0) return;
        cursor = index;
        return finish(items[index]!.id);
      }
      draw("active");
    };

    input.on("keypress", onKeypress);
    if (input.isTTY) input.setRawMode?.(true);
    output.write(HIDE_CURSOR);
    draw("active");
  });
}
