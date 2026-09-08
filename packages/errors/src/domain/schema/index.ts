/**
 * @zudojs/errors/schema
 *
 * Schema error types for the Zudojs schema system.
 */

export {
  SchemaError,
  SchemaTypeError,
  SchemaLiteralError,
  SchemaEnumError,
  SchemaStringError,
  SchemaNumberError,
  SchemaRequiredError,
  SchemaUnionError,
  SchemaUnknownKeyError,
  createSchemaError,
  isSchemaError,
} from "./schema.error.js";

export type { SchemaErrorOptions } from "./schema.error.js";
