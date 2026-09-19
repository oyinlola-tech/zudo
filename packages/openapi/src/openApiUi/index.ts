/**
 * @zudojs/openapi/openApiUi
 *
 * Branded documentation pages (Swagger UI / ReDoc) and the Zudo brand assets.
 */

export {
  renderOpenAPIUI,
  zudoLogo,
  escapeHtml,
  type OpenAPIUIOptions,
  type OpenAPIUIRenderer,
} from "./openApiUi.core.js";
export {
  ZUDO_MARK_SVG,
  ZUDO_MARK_DARK_SVG,
  ZUDO_WORDMARK_SVG,
  ZUDO_WORDMARK_DARK_SVG,
  ZUDO_FAVICON_SVG,
  ZUDO_MARK_DATA_URI,
  ZUDO_MARK_DARK_DATA_URI,
  ZUDO_WORDMARK_DATA_URI,
  ZUDO_WORDMARK_DARK_DATA_URI,
  ZUDO_FAVICON_DATA_URI,
  ZUDO_SITE_URL,
  svgToDataUri,
} from "./openApiUi.brand.js";
export {
  SWAGGER_UI_VERSION,
  REDOC_VERSION,
  DEFAULT_SWAGGER_ASSETS,
  DEFAULT_REDOC_ASSETS,
  SWAGGER_UI_INTEGRITY,
  REDOC_INTEGRITY,
  type OpenAPIUIAssetIntegrity,
} from "./openApiUi.assets.js";
export { buildOpenAPIUIContentSecurityPolicy } from "./openApiUi.csp.js";
