/**
 * Decides what an untrusted client may see of an error's metadata and
 * issues. Shared by `ErrorSerializer.serializePublic` and
 * `ErrorHandler.toPublicResult` so the two never disagree.
 */

import type { BaseError } from "../base/core/baseError.core.js";
import {
  pickErrorMetadata,
  redactErrorMetadata,
} from "../base/core/errorMetadata.core.js";
import type { ErrorMetadata } from "../base/core/errorMetadata.type.js";
import {
  redactIssueValues,
  toJsonSafeIssues,
} from "../domain/shared/domainError.helpers.js";

/** The options that govern public metadata selection. */
export interface PublicMetadataPolicy {
  /** Keys copied into the public output for every error. */
  readonly publicMetadataKeys?: readonly string[];
  /** Copy the whole (redacted) metadata of errors with `expose: true`. */
  readonly exposeMetadata?: boolean;
  /** Redact sensitive keys. Defaults to true. */
  readonly redactSensitiveData?: boolean;
  /** Pattern used to detect sensitive metadata keys. */
  readonly sensitiveKeyPattern?: RegExp;
}

/**
 * Metadata allowed in a public response, or `undefined` when there is none.
 *
 * `publicMetadataKeys` allow-lists specific keys for exposed and non-exposed
 * errors alike. Without it, metadata is included only when `exposeMetadata`
 * is set and the error is exposable. `expose: true` on its own reveals no
 * metadata: it says the *message* is safe for a client, and errors routinely
 * carry decline codes, upstream ids and internal state in the metadata of an
 * exposed error. Until round 12 that metadata was published whenever
 * `expose` was true.
 */
export function selectPublicMetadata(
  error: BaseError,
  policy: PublicMetadataPolicy,
): Readonly<ErrorMetadata> | undefined {
  let metadata: Readonly<ErrorMetadata>;
  if (policy.publicMetadataKeys !== undefined) {
    metadata = pickErrorMetadata(error.metadata, policy.publicMetadataKeys);
  } else if (policy.exposeMetadata === true && error.expose) {
    metadata = error.metadata;
  } else {
    return undefined;
  }

  const visible =
    policy.redactSensitiveData === false
      ? metadata
      : redactErrorMetadata(metadata, {
          sensitiveKeyPattern: policy.sensitiveKeyPattern,
        });
  return Object.keys(visible).length > 0 ? visible : undefined;
}

/**
 * The issue list of an exposable validation or schema error, or `undefined`.
 *
 * `ValidationError.issues` and `SchemaError.issues` are the part of a 400 a
 * client actually needs, and the public serializer used to drop them. Any
 * exposable error carrying an `issues` array qualifies, so errors from a
 * second copy of this package are covered too. Submitted values inside the
 * issues (`value`, `received`, `input`, `actual`) are replaced by a type
 * description, exactly as the errors' own `toJSON()` does.
 */
export function selectPublicIssues(
  error: BaseError,
): readonly unknown[] | undefined {
  if (!error.expose) return undefined;
  const issues = (error as { readonly issues?: unknown }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return undefined;
  return redactIssueValues(toJsonSafeIssues(issues));
}
