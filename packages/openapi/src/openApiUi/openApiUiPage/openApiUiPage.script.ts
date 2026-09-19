/**
 * The one inline script the Swagger UI page runs, built in one place so the
 * page and its Content-Security-Policy hash agree byte for byte.
 */

/** Serialises a value for an inline `<script>` without letting `</script>` through. */
export function jsLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Inputs that shape the Swagger UI bootstrap script. */
export interface SwaggerInitInput {
  readonly specUrl: string;
  readonly swaggerOptions?: Readonly<Record<string, unknown>>;
}

/** Returns the body of the inline `<script>` that boots Swagger UI. */
export function swaggerInitScript(input: SwaggerInitInput): string {
  const config = {
    url: input.specUrl,
    dom_id: "#zudo-openapi",
    deepLinking: true,
    displayRequestDuration: true,
    tryItOutEnabled: true,
    ...input.swaggerOptions,
  };
  return `window.addEventListener("load",function(){window.ui=SwaggerUIBundle(${jsLiteral(config)});});`;
}
