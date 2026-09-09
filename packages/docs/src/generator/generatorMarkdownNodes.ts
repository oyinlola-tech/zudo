/**
 * Converts structured AST nodes to markdown strings.
 *
 * Every value is escaped for the position it is written to, so
 * untrusted node content cannot break out of a table, code fence,
 * heading or link.
 */

import type { DocumentationNode } from "../docsTypes/index.js";

const CALLOUT_LABELS: Record<string, string> = {
  note: "NOTE",
  warning: "WARNING",
  tip: "TIP",
  danger: "DANGER",
};

/**
 * Converts a list of documentation nodes to markdown.
 *
 * @throws {TypeError} for node types that are not part of `DocumentationNode`.
 */
export function nodesToMarkdown(nodes: readonly DocumentationNode[]): string {
  const lines: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "heading": {
        const level = clampHeadingLevel(node.level);
        lines.push(`${"#".repeat(level)} ${singleLine(node.value)}`);
        lines.push("");
        break;
      }

      case "paragraph":
        lines.push(node.value);
        lines.push("");
        break;

      case "code": {
        const fence = fenceFor(node.value);
        lines.push(fence + sanitizeLanguage(node.language));
        lines.push(node.value);
        lines.push(fence);
        lines.push("");
        break;
      }

      case "list":
        for (let i = 0; i < node.items.length; i++) {
          const prefix = node.ordered ? `${i + 1}. ` : "- ";
          lines.push(`${prefix}${listItem(node.items[i] ?? "")}`);
        }
        lines.push("");
        break;

      case "link":
        lines.push(`[${escapeLinkText(node.value)}](${escapeLinkHref(node.href)})`);
        lines.push("");
        break;

      case "table": {
        lines.push("| " + node.headers.map(tableCell).join(" | ") + " |");
        lines.push("| " + node.headers.map(() => "---").join(" | ") + " |");
        for (const row of node.rows) {
          lines.push("| " + row.map(tableCell).join(" | ") + " |");
        }
        lines.push("");
        break;
      }

      case "quote":
        for (const line of node.value.split(/\r?\n/)) {
          lines.push(`> ${line}`);
        }
        lines.push("");
        break;

      case "callout": {
        const label = CALLOUT_LABELS[node.kind] ?? singleLine(String(node.kind)).toUpperCase();
        const [first = "", ...rest] = node.value.split(/\r?\n/);
        lines.push(`> **${label}:** ${first}`);
        for (const line of rest) {
          lines.push(`> ${line}`);
        }
        lines.push("");
        break;
      }

      default: {
        const unknown: never = node;
        throw new TypeError(
          `Unknown documentation node type "${String((unknown as { type?: unknown }).type)}".`,
        );
      }
    }
  }

  return lines.join("\n");
}

/** Clamps a heading level to 1–6 (non-integers become 1). */
export function clampHeadingLevel(level: number): number {
  if (!Number.isInteger(level)) return 1;
  return Math.min(6, Math.max(1, level));
}

/**
 * Returns a backtick fence longer than any backtick run in `value`,
 * so the code block cannot be closed early by its own content.
 */
export function fenceFor(value: string): string {
  let longest = 0;
  for (const run of value.match(/`+/g) ?? []) {
    longest = Math.max(longest, run.length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * Keeps only the first whitespace-delimited token of the language and
 * only characters that are safe on a fence info line.
 */
export function sanitizeLanguage(language: string | undefined): string {
  if (!language) return "";
  const first = language.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[^\w+#.-]/g, "");
}

/** Escapes `|` and newlines so a value stays inside its table cell. */
export function tableCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function singleLine(value: string): string {
  return value.replace(/\r?\n/g, " ");
}

function listItem(value: string): string {
  return value.replace(/\r?\n/g, "\n  ");
}

function escapeLinkText(value: string): string {
  // Backslash first: escaping it after the brackets would turn the escapes we
  // just added back into a literal backslash plus an unescaped bracket.
  return singleLine(value)
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function escapeLinkHref(href: string): string {
  const clean = href.replace(/[\r\n]/g, "");
  return /[\s()]/.test(clean) ? `<${clean.replace(/[<>]/g, "")}>` : clean;
}
