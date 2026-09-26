/**
 * zudojs-cli — Validator Generator
 *
 * Writes `validators/<name>.validator.ts`: a @zudojs/schema object schema,
 * its inferred type and a `validate<Name>(input)` that returns the schema's
 * `SchemaResult` (data on success, issues on failure). It used to write
 * `validate<Name>(input) { return true; }`, a stub that accepted everything.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { normalizeName, toPascalCase } from "../../utils/utils.name.js";

export interface GenerateValidatorOptions {
  readonly name: string;
  readonly basePath: string;
  readonly dryRun?: boolean;
}

/** Renders the validator source for `name` (kebab-case) and its PascalCase form. */
export function renderValidatorFile(name: string, pascal: string): string {
  return `import { schema, type Infer, type SchemaResult } from "@zudojs/schema";

/** Shape of a valid ${name}. Replace the fields with your own. */
export const ${pascal}Schema = schema.object({
  id: schema.string().min(1),
});

export type ${pascal} = Infer<typeof ${pascal}Schema>;

/**
 * Validates \`input\` against {@link ${pascal}Schema}. On failure the result
 * carries the issues (path and message) instead of throwing:
 *
 * \`\`\`ts
 * const result = validate${pascal}(body);
 * if (!result.success) return validationFailed(result.issues);
 * result.data; // a ${pascal}
 * \`\`\`
 */
export function validate${pascal}(input: unknown): SchemaResult<${pascal}> {
  return ${pascal}Schema.safeParse(input);
}
`;
}

export async function generateValidator(
  options: GenerateValidatorOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const namePascal = toPascalCase(options.name);

  const files: Record<string, string> = {
    [`${options.basePath}/validators/${name}.validator.ts`]: renderValidatorFile(name, namePascal),
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  await writeFileTree(cwd, files);
  return Object.keys(files);
}
