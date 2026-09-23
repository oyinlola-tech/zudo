/**
 * zudojs-cli — Command schematic templates, written against the
 * @zudojs/cqrs API: a `CommandOf` type built with `createCommand`, and a
 * `CommandHandler` subclass (`commandType` + `execute`) registered on a
 * `CommandBus`.
 */

import { toPascalCase } from "../../utils/utils.name.js";

/** Identifiers derived from a command name (`create-user`). */
export interface CqrsSchematicNames {
  /** kebab-case: folder and file names (`create-user`). */
  readonly slug: string;
  /** PascalCase: class and type prefix, and the bus discriminator (`CreateUser`). */
  readonly pascal: string;
  /** UPPER_SNAKE: prefix of the discriminator constant (`CREATE_USER`). */
  readonly constant: string;
}

/** Derives {@link CqrsSchematicNames} from an already validated slug. */
export function cqrsSchematicNames(slug: string): CqrsSchematicNames {
  return { slug, pascal: toPascalCase(slug), constant: slug.toUpperCase().replace(/-/g, "_") };
}

/** `<slug>.command.ts`: the discriminator, payload, command type and factory. */
export function renderCommandFile(n: CqrsSchematicNames): string {
  const id = `${n.constant}_COMMAND`;
  return `import { createCommand, type CommandOf } from "@zudojs/cqrs";

/** Discriminator the command bus routes ${n.pascal} commands on. */
export const ${id} = "${n.pascal}";

/** Data a ${n.pascal} command carries. Replace it with the fields the use case needs. */
export type ${n.pascal}CommandPayload = {
  readonly data: Readonly<Record<string, unknown>>;
};

/** The ${n.pascal} command: \`{ type: "${n.pascal}", data }\`. */
export type ${n.pascal}Command = CommandOf<typeof ${id}, ${n.pascal}CommandPayload>;

/** Creates an immutable ${n.pascal} command. */
export function create${n.pascal}Command(payload: ${n.pascal}CommandPayload): ${n.pascal}Command {
  return createCommand(${id}, payload);
}
`;
}

/** `<slug>.handler.ts`: the handler class and its bus registration. */
export function renderCommandHandlerFile(n: CqrsSchematicNames): string {
  const id = `${n.constant}_COMMAND`;
  return `import { randomUUID } from "node:crypto";

import { CommandHandler, type CommandBus } from "@zudojs/cqrs";

import { ${id}, type ${n.pascal}Command } from "./${n.slug}.command.js";

/** What executing a ${n.pascal} command returns. */
export interface ${n.pascal}CommandResult {
  readonly id: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Handles ${n.pascal} commands: put the write-side logic in \`execute\`. */
export class ${n.pascal}CommandHandler extends CommandHandler<${n.pascal}Command, ${n.pascal}CommandResult> {
  public override readonly commandType = ${id};

  public override async execute(command: ${n.pascal}Command): Promise<${n.pascal}CommandResult> {
    return { id: randomUUID(), data: command.data };
  }
}

/**
 * Registers {@link ${n.pascal}CommandHandler} on a command bus.
 *
 * @example
 * const bus = register${n.pascal}Command(createCommandBus());
 * const result = await bus.execute<${n.pascal}Command, ${n.pascal}CommandResult>(
 *   create${n.pascal}Command({ data: {} }),
 * );
 */
export function register${n.pascal}Command(bus: CommandBus): CommandBus {
  return bus.register(${id}, new ${n.pascal}CommandHandler());
}
`;
}

/** `index.ts`: the command folder's barrel. */
export function renderCommandBarrel(n: CqrsSchematicNames): string {
  return `export * from "./${n.slug}.command.js";
export * from "./${n.slug}.handler.js";
`;
}
