/**
 * @zudojs/docs/docsTypes
 *
 * Core type definitions for the documentation model.
 */

export type {
  DocumentationNode,
  HeadingNode,
  ParagraphNode,
  CodeNode,
  ListNode,
  LinkNode,
  TableNode,
  QuoteNode,
  CalloutNode,
  MarkdownContent,
  MDXContent,
  HTMLContent,
  StructuredContent,
  DocumentationContent,
} from "./documentationContent.js";

export type {
  DocumentationCategory,
  DocumentationStatus,
  APISymbolKind,
  SourceLocation,
  APISymbol,
  APIExample,
  APIParameter,
  DocumentationMetadata,
  DocumentationVersion,
} from "./documentationMetadata.js";

export type { DocumentationDocument } from "./documentationDocument.js";

export type {
  DocumentationNavigationItem,
  DocumentationBreadcrumb,
  SearchDocument,
  SearchResult,
} from "./documentationNavigation.js";

export type {
  DocumentationProvider,
  DocumentationSourceLoader,
  DocumentationSanitizer,
} from "./documentationProvider.js";
