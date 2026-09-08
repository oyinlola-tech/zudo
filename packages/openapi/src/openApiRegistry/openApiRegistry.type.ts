import type {
  OpenAPIDocument,
  OpenAPIInfo,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPISchema,
  OpenAPISecurityRequirement,
  OpenAPISecurityScheme,
  OpenAPIServer,
  OpenAPITag,
  OpenAPIReference,
  OpenAPIHeader,
  OpenAPIExample,
  OpenAPILink,
  OpenAPIPathItem,
} from "../openApiTypes/openApiTypes.core.js";
import type { OpenAPIHttpMethod } from "../openApiRouting/routeMetadata.type.js";
import type { ComponentSection } from "../openApiSchema/references.core.js";

/**
 * A registered route in the OpenAPI registry.
 */
export interface OpenAPIRoute {
  readonly method: OpenAPIHttpMethod;

  readonly path: string;

  readonly operation: OpenAPIOperation;
}

/**
 * Component registration entry.
 */
export interface OpenAPIComponentRegistration<T> {
  readonly name: string;

  readonly value: T;
}

/**
 * OpenAPI registry for collecting routes, schemas, and components.
 */
export interface OpenAPIRegistry {
  readonly version: string;

  /** Document-level metadata. Defaults to a placeholder title and version. */
  setInfo(info: OpenAPIInfo): void;

  addServer(server: OpenAPIServer): void;

  addSecurityRequirement(requirement: OpenAPISecurityRequirement): void;

  registerRoute(route: OpenAPIRoute): void;

  /** Registers a route, replacing any existing one for the same method+path. */
  setRoute(route: OpenAPIRoute): void;

  registerSchema(name: string, schema: OpenAPISchema): void;

  registerResponse(name: string, response: OpenAPIResponse): void;

  registerParameter(name: string, parameter: OpenAPIParameter): void;

  registerRequestBody(name: string, body: OpenAPIRequestBody): void;

  registerHeader(name: string, header: OpenAPIHeader): void;

  registerExample(name: string, example: OpenAPIExample): void;

  registerSecurityScheme(name: string, scheme: OpenAPISecurityScheme): void;

  registerLink(name: string, link: OpenAPILink): void;

  registerCallback(
    name: string,
    callback: Readonly<Record<string, OpenAPIPathItem>>,
  ): void;

  registerTag(tag: OpenAPITag): void;

  ref(section: ComponentSection, name: string): OpenAPIReference;

  /** True when a component is registered under that section and name. */
  hasComponent(section: ComponentSection, name: string): boolean;

  generate(): OpenAPIDocument;

  clear(): void;
}
