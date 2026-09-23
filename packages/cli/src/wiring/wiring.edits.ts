/**
 * zudojs-cli — Applying marker insertions to a project on disk.
 *
 * `generate` and `add` describe what they register as a list of
 * {@link MarkerEdit}s. {@link applyMarkerEdits} applies them in order, file
 * by file, and never guesses: a missing file or a file without its markers
 * is reported as a manual step (exactly what to add, and where) instead of
 * being rewritten.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeFile } from "../utils/utils.fileSystem.js";
import { recordIntendedEdit } from "../utils/utils.writeGuard.js";
import {
  insertBetweenMarkers,
  markerEnd,
  markerStart,
  type MarkerName,
} from "./wiring.markers.js";

/** One line to insert between a marker pair of a file. */
export interface MarkerEdit {
  /** File path relative to the project root. */
  readonly file: string;
  readonly marker: MarkerName;
  readonly line: string;
}

/** What {@link applyMarkerEdits} did. */
export interface MarkerEditOutcome {
  /** Files that were (or, in a dry run, would be) changed. */
  readonly edited: readonly string[];
  /** Lines already present, so not inserted again. */
  readonly alreadyPresent: readonly MarkerEdit[];
  /** Instructions for edits that could not be made automatically. */
  readonly manualSteps: readonly string[];
}

/**
 * Computes the new contents of every file `edits` touch. Pure apart from
 * reading the files; nothing is written.
 */
export function planMarkerEdits(
  cwd: string,
  edits: readonly MarkerEdit[],
): {
  readonly files: ReadonlyMap<string, string>;
  readonly outcome: MarkerEditOutcome;
} {
  const contents = new Map<string, string>();
  const changed = new Set<string>();
  const alreadyPresent: MarkerEdit[] = [];
  const manualSteps: string[] = [];

  for (const edit of edits) {
    const fullPath = join(cwd, edit.file);
    let source = contents.get(edit.file);
    if (source === undefined) {
      if (!existsSync(fullPath)) {
        manualSteps.push(`${edit.file} does not exist; add: ${edit.line}`);
        continue;
      }
      source = readFileSync(fullPath, "utf-8");
    }

    const result = insertBetweenMarkers(source, edit.marker, edit.line);
    if (result.status === "missing-markers") {
      manualSteps.push(
        `${edit.file}: add "${edit.line}" between "${markerStart(edit.marker)}" and "${markerEnd(edit.marker)}" (the markers are missing, so the file was left unchanged)`,
      );
      continue;
    }
    if (result.status === "present") {
      alreadyPresent.push(edit);
    } else {
      changed.add(edit.file);
    }
    contents.set(edit.file, result.source);
  }

  const files = new Map<string, string>();
  for (const file of changed) {
    files.set(file, contents.get(file) ?? "");
  }

  return {
    files,
    outcome: { edited: [...changed], alreadyPresent, manualSteps },
  };
}

/**
 * Applies `edits` to the project at `cwd` (unless `dryRun`) and reports
 * what happened. Writes go through `writeFile`, so the overwrite check and
 * the path-containment check see them.
 */
export async function applyMarkerEdits(
  cwd: string,
  edits: readonly MarkerEdit[],
  dryRun = false,
): Promise<MarkerEditOutcome> {
  const { files, outcome } = planMarkerEdits(cwd, edits);
  if (dryRun) return outcome;
  for (const [file, content] of files) {
    recordIntendedEdit(join(cwd, file));
    await writeFile(cwd, file, content);
  }
  return outcome;
}

/**
 * The line of `file` that already imports the name `importLine` imports,
 * from somewhere else; `undefined` when there is none (or it is this very
 * line, which a re-run inserts idempotently).
 *
 * `generate module billing` and `generate route billing` both used to add
 * an `import { registerBillingRoutes } …` to `src/routes/index.ts`, and the
 * app stopped compiling on the duplicate identifier.
 */
export function conflictingImport(
  cwd: string,
  file: string,
  importLine: string,
): string | undefined {
  const name = /^import \{ (\w+) \}/.exec(importLine)?.[1];
  const path = join(cwd, file);
  if (name === undefined || !existsSync(path)) return undefined;
  const binds = new RegExp(`^import\\b.*[{,]\\s*${name}\\s*[,}]`);
  return readFileSync(path, "utf-8")
    .split("\n")
    .find((line) => line.trim() !== importLine && binds.test(line.trim()));
}
