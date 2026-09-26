/**
 * Metadata and classification types for documentation.
 */

/** High-level categories for documentation pages. */
export type DocumentationCategory =
  | "introduction"
  | "guide"
  | "tutorial"
  | "reference"
  | "api"
  | "architecture"
  | "configuration"
  | "deployment"
  | "security"
  | "migration"
  | "examples";

/** Status of a documentation page. */
export type DocumentationStatus =
  "stable" | "experimental" | "beta" | "deprecated" | "internal";

/** API symbol kind for auto-generated references. */
export type APISymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "namespace"
  | "method"
  | "property";

/** Source location for an API symbol. */
export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
}

/** An API symbol extracted from source code. */
export interface APISymbol {
  readonly name: string;
  readonly kind: APISymbolKind;
  readonly description?: string;
  readonly source?: SourceLocation;
  readonly deprecated?: boolean;
  readonly examples?: readonly APIExample[];
  readonly parameters?: readonly APIParameter[];
  readonly returnType?: string;
}

/** An API example for documentation. */
export interface APIExample {
  readonly id: string;
  readonly title?: string;
  readonly language: string;
  readonly code: string;
  readonly description?: string;
}

/** Parameter for an API symbol. */
export interface APIParameter {
  readonly name: string;
  readonly type?: string;
  readonly description?: string;
  readonly optional?: boolean;
  readonly defaultValue?: string;
}

/** Metadata attached to a documentation document. */
export interface DocumentationMetadata {
  readonly owner?: string;
  readonly team?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly version?: string;
  readonly ticket?: string;
  readonly tags?: readonly string[];
}

/**
 * A version entry for versioned documentation. A contract only: the
 * package provides no version switcher; hosts list their versions with
 * this shape and select a registry per version.
 */
export interface DocumentationVersion {
  readonly version: string;
  readonly label?: string;
  readonly deprecated?: boolean;
  readonly latest?: boolean;
}
