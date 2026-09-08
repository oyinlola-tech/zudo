/**
 * zudojs-cli — Event Generator
 *
 * Generates event files.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";

export interface GenerateEventOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

export async function generateEvent(
  options: GenerateEventOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const namePascal = toPascalCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/events/${name}.event.ts`]: `/**
 * ${name} event.
 */

export interface ${namePascal}Event {
  readonly type: "${name}";
  readonly timestamp: Date;
}
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
