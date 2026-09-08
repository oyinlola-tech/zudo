/**
 * Document registry with O(1) lookup by ID.
 *
 * Provides registration, retrieval, and iteration over
 * documentation documents. Prevents duplicate IDs.
 */

import { DuplicateDocumentError } from "@zudojs/errors";

import type {
  DocumentationDocument,
  DocumentationProvider,
} from "../docsTypes/index.js";
import { deepFreezeClone } from "../utils/utils.freeze.js";

/** Visibility filter accepted by `getAll` and the generators. */
export type DocumentVisibilityFilter = "SERVER" | "CLIENT" | "ALL";

/** Options for `DocumentRegistry.getAll`. */
export interface GetAllOptions {
  /**
   * Which documents to return. `"CLIENT"` returns documents whose
   * `visibility` is `"CLIENT"` or unset; `"SERVER"` returns only
   * server-only documents; `"ALL"` (default) returns everything.
   */
  readonly visibility?: DocumentVisibilityFilter;
}

/**
 * Returns true when `document` should be included for the given filter.
 */
export function matchesVisibility(
  document: DocumentationDocument,
  filter: DocumentVisibilityFilter = "ALL",
): boolean {
  if (filter === "ALL") return true;
  if (filter === "SERVER") return document.visibility === "SERVER";
  return document.visibility !== "SERVER";
}

/**
 * Registry for managing documentation documents.
 *
 * Registered documents are stored as deep-frozen copies, so the
 * caller's object is never mutated and later changes to it do not
 * leak into the registry.
 */
export class DocumentRegistry implements DocumentationProvider {
  private readonly documents = new Map<string, DocumentationDocument>();

  /**
   * Registers a document.
   *
   * @throws {DuplicateDocumentError} if the ID is already registered.
   */
  register(document: DocumentationDocument): void {
    if (this.documents.has(document.id)) {
      throw new DuplicateDocumentError(document.id);
    }

    this.documents.set(document.id, deepFreezeClone(document));
  }

  /**
   * Registers multiple documents.
   */
  registerAll(documents: readonly DocumentationDocument[]): void {
    for (const doc of documents) {
      this.register(doc);
    }
  }

  /**
   * Retrieves a document by ID. Returns undefined if not found.
   */
  get(id: string): DocumentationDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Returns all registered documents, optionally filtered by visibility.
   */
  getAll(options: GetAllOptions = {}): readonly DocumentationDocument[] {
    const filter = options.visibility ?? "ALL";

    return Object.freeze(
      [...this.documents.values()].filter((doc) =>
        matchesVisibility(doc, filter),
      ),
    );
  }

  /**
   * Returns the number of registered documents.
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Checks if a document ID is registered.
   */
  has(id: string): boolean {
    return this.documents.has(id);
  }

  /**
   * Removes a document by ID. Returns true if it existed.
   */
  delete(id: string): boolean {
    return this.documents.delete(id);
  }

  /**
   * Clears all registered documents.
   */
  clear(): void {
    this.documents.clear();
  }

  /**
   * Returns all document IDs.
   */
  ids(): readonly string[] {
    return Object.freeze([...this.documents.keys()]);
  }

  /**
   * Returns the registered IDs as a set, suitable for `validateLinks`
   * and `validateNavigation`.
   */
  idSet(): ReadonlySet<string> {
    return new Set(this.documents.keys());
  }

  /**
   * Filters documents by category.
   */
  byCategory(category: string): readonly DocumentationDocument[] {
    return Object.freeze(
      [...this.documents.values()].filter((doc) => doc.category === category),
    );
  }

  /**
   * Filters documents by tag.
   */
  byTag(tag: string): readonly DocumentationDocument[] {
    return Object.freeze(
      [...this.documents.values()].filter((doc) => doc.tags?.includes(tag)),
    );
  }
}

/**
 * Creates a new document registry.
 */
export function createDocumentRegistry(): DocumentRegistry {
  return new DocumentRegistry();
}
