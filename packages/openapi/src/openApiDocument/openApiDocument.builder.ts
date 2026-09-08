import type {
  OpenAPIDocument,
  OpenAPIExample,
  OpenAPIHeader,
  OpenAPIInfo,
  OpenAPIParameter,
  OpenAPIPathItem,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPISchema,
  OpenAPISecurityRequirement,
  OpenAPISecurityScheme,
  OpenAPIServer,
  OpenAPITag,
} from "../openApiTypes/openApiTypes.core.js";
import type { OpenAPIRoute } from "../openApiRegistry/openApiRegistry.type.js";
import { OpenAPIRegistryImpl } from "../openApiRegistry/openApiRegistry.core.js";
import { DEFAULT_OPENAPI_VERSION } from "../openApiConstants/openApiConstants.core.js";

export interface OpenAPIDocumentOptions {
  readonly info: OpenAPIInfo;
  readonly openapi?: string;
  readonly servers?: readonly OpenAPIServer[];
  readonly tags?: readonly OpenAPITag[];
  readonly security?: readonly OpenAPISecurityRequirement[];
}

/**
 * Fluent builder for a document assembled by hand.
 *
 * It is a thin facade over {@link OpenAPIRegistryImpl}, so a document built
 * this way and one generated from routes go through the same assembly and
 * validation rules. Two independent assemblers is how the generated documents
 * ended up unable to express servers, tags or security at all.
 */
export class OpenAPIDocumentBuilder {
  private readonly registry: OpenAPIRegistryImpl;

  constructor(options: OpenAPIDocumentOptions) {
    this.registry = new OpenAPIRegistryImpl(
      options.openapi ?? DEFAULT_OPENAPI_VERSION,
    );
    this.registry.setInfo(options.info);
    for (const server of options.servers ?? []) this.registry.addServer(server);
    for (const tag of options.tags ?? []) this.registry.setTag(tag);
    for (const requirement of options.security ?? []) {
      this.registry.addSecurityRequirement(requirement);
    }
  }

  /** The document's `info` object. */
  public info(info: OpenAPIInfo): this {
    this.registry.setInfo(info);
    return this;
  }

  public addServer(server: OpenAPIServer): this {
    this.registry.addServer(server);
    return this;
  }

  public addTag(tag: OpenAPITag): this {
    this.registry.setTag(tag);
    return this;
  }

  public addSecurity(security: OpenAPISecurityRequirement): this {
    this.registry.addSecurityRequirement(security);
    return this;
  }

  /** Adds one operation. Repeated method+path combinations replace. */
  public addRoute(route: OpenAPIRoute): this {
    this.registry.setRoute(route);
    return this;
  }

  /**
   * Adds a whole path item.
   *
   * Each operation on it is registered individually, so the document keeps
   * one path entry per path with the methods merged, as the specification
   * requires.
   */
  public addPath(path: string, pathItem: OpenAPIPathItem): this {
    const methods = [
      "get",
      "put",
      "post",
      "delete",
      "options",
      "head",
      "patch",
      "trace",
    ] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (operation) this.registry.setRoute({ method, path, operation });
    }
    return this;
  }

  public addSchema(name: string, schema: OpenAPISchema): this {
    this.registry.registerSchema(name, schema);
    return this;
  }

  public addResponse(name: string, response: OpenAPIResponse): this {
    this.registry.registerResponse(name, response);
    return this;
  }

  public addParameter(name: string, parameter: OpenAPIParameter): this {
    this.registry.registerParameter(name, parameter);
    return this;
  }

  public addRequestBody(name: string, body: OpenAPIRequestBody): this {
    this.registry.registerRequestBody(name, body);
    return this;
  }

  public addHeader(name: string, header: OpenAPIHeader): this {
    this.registry.registerHeader(name, header);
    return this;
  }

  public addExample(name: string, example: OpenAPIExample): this {
    this.registry.registerExample(name, example);
    return this;
  }

  public addSecurityScheme(name: string, scheme: OpenAPISecurityScheme): this {
    this.registry.registerSecurityScheme(name, scheme);
    return this;
  }

  public build(): Readonly<OpenAPIDocument> {
    return this.registry.generate();
  }
}

/** Creates a document builder. */
export function createOpenAPIDocumentBuilder(
  options: OpenAPIDocumentOptions,
): OpenAPIDocumentBuilder {
  return new OpenAPIDocumentBuilder(options);
}
