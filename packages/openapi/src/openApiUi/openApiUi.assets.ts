/**
 * Pinned viewer assets for the documentation page.
 *
 * Every default asset URL names an exact package version, and every file
 * carries a Subresource Integrity hash. A floating tag such as
 * `swagger-ui-dist@5` or `redoc/latest` runs whatever the CDN serves today on
 * the API's own origin, where "Try it out" holds bearer tokens and cookies;
 * a pinned, hashed file cannot change underneath the page.
 *
 * The hashes were computed from the files inside the npm tarballs
 * (`swagger-ui-dist-5.33.0.tgz`, `redoc-2.5.4.tgz`) and checked against the
 * copies served by cdn.jsdelivr.net and unpkg.com. When bumping a version,
 * recompute them with
 * `openssl dgst -sha384 -binary <file> | base64 -w0`.
 */

/** Swagger UI version served by default. */
export const SWAGGER_UI_VERSION = "5.33.0";

/** ReDoc version served by default. */
export const REDOC_VERSION = "2.5.4";

/** Default base URL for Swagger UI assets. */
export const DEFAULT_SWAGGER_ASSETS = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

/** Default base URL for ReDoc assets. */
export const DEFAULT_REDOC_ASSETS = `https://cdn.jsdelivr.net/npm/redoc@${REDOC_VERSION}/bundles`;

/** Integrity hashes for a viewer's script and (Swagger UI only) stylesheet. */
export interface OpenAPIUIAssetIntegrity {
  /** SRI hash for the viewer script, e.g. `sha384-…`. */
  readonly script?: string;
  /** SRI hash for the viewer stylesheet (Swagger UI only). */
  readonly stylesheet?: string;
}

/** SRI hashes for the default Swagger UI assets. */
export const SWAGGER_UI_INTEGRITY: OpenAPIUIAssetIntegrity = Object.freeze({
  script:
    "sha384-YDALVcy8kj8yltLBVi1vBiBAUqdxvus673gM8XKwiy6aDUJFXivF/KCufekjYbVf",
  stylesheet:
    "sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW",
});

/** SRI hashes for the default ReDoc assets. */
export const REDOC_INTEGRITY: OpenAPIUIAssetIntegrity = Object.freeze({
  script:
    "sha384-w447zOpYfw/1Tv/5AK9NfHTlQIqE3RVR6KY62jCyy9zNDgO64cMwGGP1Fj0zJVf5",
});

const SRI = /^(sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/;

/**
 * Renders ` integrity="…" crossorigin="anonymous"` for an asset tag, or just
 * ` crossorigin="anonymous"` when there is no hash. Rejects anything that is
 * not a well-formed SRI token, since it is interpolated into an attribute.
 */
export function integrityAttrs(hash: string | undefined): string {
  if (hash === undefined) return ` crossorigin="anonymous"`;
  const tokens = hash.trim().split(/\s+/);
  if (tokens.length === 0 || !tokens.every((t) => SRI.test(t))) {
    throw new TypeError(`Invalid Subresource Integrity value: "${hash}"`);
  }
  return ` integrity="${tokens.join(" ")}" crossorigin="anonymous"`;
}
