/**
 * @zudojs/openapi/openApiUi
 *
 * Renders a branded documentation page (Swagger UI or ReDoc) for a served
 * OpenAPI document. The page carries the Zudo mark in its header and as its
 * favicon, and reads the specification from `specUrl`.
 *
 * The returned string is a complete HTML document; serve it with
 * `content-type: text/html`. {@link OpenAPIManager.toUIResponse} does that.
 */

import type { OpenAPILogo } from "../openApiTypes/openApiTypes.core.js";
import {
  ZUDO_FAVICON_DATA_URI,
  ZUDO_MARK_DATA_URI,
  ZUDO_SITE_URL,
  ZUDO_WORDMARK_DARK_DATA_URI,
} from "./openApiUi.brand.js";
import {
  DEFAULT_REDOC_ASSETS,
  DEFAULT_SWAGGER_ASSETS,
  REDOC_INTEGRITY,
  SWAGGER_UI_INTEGRITY,
  integrityAttrs,
  type OpenAPIUIAssetIntegrity,
} from "./openApiUi.assets.js";
import { swaggerInitScript, THEME_CSS } from "./openApiUiPage/index.js";

/** Which viewer to render. */
export type OpenAPIUIRenderer = "swagger" | "redoc";

/** Options for {@link renderOpenAPIUI}. */
export interface OpenAPIUIOptions {
  /** URL the page fetches the specification from, e.g. `/openapi.json`. */
  readonly specUrl: string;
  /** Page title. Default: "API reference". */
  readonly title?: string;
  /** Viewer. Default: "swagger". */
  readonly renderer?: OpenAPIUIRenderer;
  /**
   * Logo shown in the page header. Default: the Zudo wordmark linking to
   * zudojs.oyinlola.site. Pass `false` to render no logo at all.
   */
  readonly logo?: OpenAPILogo | false;
  /** Favicon URL or data URI. Default: the Zudo favicon. */
  readonly favicon?: string | false;
  /** Extra CSS appended after the built-in theme. */
  readonly customCss?: string;
  /**
   * Base URL the viewer's own assets load from. Defaults to exact, pinned
   * versions on cdn.jsdelivr.net (`swagger-ui-dist@5.33.0`, `redoc@2.5.4`),
   * loaded with Subresource Integrity. Point it at a self-hosted copy for
   * air-gapped deployments; pass `assetIntegrity` to keep SRI on that copy.
   */
  readonly assetsBaseUrl?: string;
  /**
   * SRI hashes for the viewer assets. Default: the pinned hashes when
   * `assetsBaseUrl` is not set, and none when it is (a self-hosted copy may
   * be a different build). Pass `false` to omit `integrity` entirely.
   */
  readonly assetIntegrity?: OpenAPIUIAssetIntegrity | false;
  /**
   * Value for the `content-security-policy` header sent by
   * `OpenAPIManager.toUIResponse`. Default: a restrictive policy built by
   * `buildOpenAPIUIContentSecurityPolicy`. Pass `false` to send none.
   * Ignored by `renderOpenAPIUI`, which returns only the HTML.
   */
  readonly contentSecurityPolicy?: string | false;
  /**
   * Extra origins "Try it out" may call, added to the default policy's
   * `connect-src`. The document's absolute `servers` are added automatically.
   */
  readonly connectSources?: readonly string[];
  /** Options forwarded to `SwaggerUIBundle(...)`; ignored by ReDoc. */
  readonly swaggerOptions?: Readonly<Record<string, unknown>>;
}

const DEFAULT_TITLE = "API reference";

/** The default logo used by every branded page and by `info["x-logo"]`. */
export function zudoLogo(overrides?: Partial<OpenAPILogo>): OpenAPILogo {
  return Object.freeze({
    url: ZUDO_MARK_DATA_URI,
    href: ZUDO_SITE_URL,
    altText: "Zudo",
    backgroundColor: "#FAFAF9",
    ...overrides,
  });
}

/** Escapes text for safe interpolation into HTML attribute or text nodes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rejects URLs that could execute script when placed in `src`/`href`.
 *
 * The scheme is read after stripping ASCII control characters, because the
 * URL parser browsers apply does the same: `java\nscript:alert(1)` is a
 * `javascript:` URL to every browser and nothing to a regex that only
 * looks at the string as written. `data:` is accepted for images only —
 * the assets base is interpolated into `<script src>`, where a
 * `data:text/javascript,` base would run inline.
 */
function safeUrl(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/[\u0000-\u0020\u007f]/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1]?.toLowerCase();
  if (scheme === "javascript" || scheme === "vbscript") {
    throw new TypeError(`Refusing to render a "${scheme}:" URL`);
  }
  if (scheme === "data" && !/^data:image\//i.test(normalized)) {
    throw new TypeError(
      'Refusing to render a non-image "data:" URL; only data:image/* is allowed.',
    );
  }
  // Attributes are always double-quoted here, so a single quote (common in
  // data URIs) can stay as-is.
  return trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Guards the one place caller-supplied text reaches the page unescaped.
 *
 * A `<style>` element ends at the first `</style`, whatever the CSS around it
 * says, so `customCss` containing that sequence closes the block early and
 * everything after it is parsed as HTML — a script tag included. There is no
 * escape that keeps the CSS valid, so this refuses rather than mangles.
 */
function safeCss(css: string | undefined): string {
  if (css === undefined) return "";
  if (/<\/\s*style/i.test(css)) {
    throw new TypeError(
      "customCss may not contain a closing </style> tag: it would end the " +
        "style block and let the rest be parsed as HTML.",
    );
  }
  return css;
}


function header(options: OpenAPIUIOptions, title: string): string {
  const logo = options.logo === undefined ? zudoLogo({ url: ZUDO_WORDMARK_DARK_DATA_URI }) : options.logo;
  const logoHtml =
    logo === false
      ? ""
      : `<a class="zudo-logo" href="${safeUrl(logo.href ?? ZUDO_SITE_URL)}" rel="noopener"><img src="${safeUrl(logo.url)}" alt="${escapeHtml(logo.altText ?? "Zudo")}"></a><span class="zudo-sep" aria-hidden="true"></span>`;
  return (
    `<header class="zudo-bar">${logoHtml}<span class="zudo-title">${escapeHtml(title)}</span>` +
    `<a class="zudo-spec" href="${safeUrl(options.specUrl)}">Open spec</a></header>`
  );
}

function footer(): string {
  return `<footer class="zudo-foot"><span>Generated by</span><a href="${ZUDO_SITE_URL}" rel="noopener"><img src="${ZUDO_MARK_DATA_URI}" alt="Zudo"></a><span>@zudojs/openapi</span></footer>`;
}

function head(options: OpenAPIUIOptions, title: string, extra: string): string {
  const favicon =
    options.favicon === false
      ? ""
      : `<link rel="icon" href="${safeUrl(options.favicon ?? ZUDO_FAVICON_DATA_URI)}">`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="theme-color" content="#1A1A2E">` +
    `<title>${escapeHtml(title)}</title>${favicon}${extra}` +
    `<style>${THEME_CSS}${safeCss(options.customCss)}</style></head>`
  );
}

/** Renders a complete, branded documentation page for `options.specUrl`. */
export function renderOpenAPIUI(options: OpenAPIUIOptions): string {
  if (!options || typeof options.specUrl !== "string" || !options.specUrl.trim()) {
    throw new TypeError("renderOpenAPIUI requires a specUrl");
  }
  const title = options.title ?? DEFAULT_TITLE;
  const renderer = options.renderer ?? "swagger";

  const integrity = resolveIntegrity(options, renderer);
  if (renderer === "redoc") {
    const base = (options.assetsBaseUrl ?? DEFAULT_REDOC_ASSETS).replace(/(?<!\/)\/+$/, "");
    return (
      head(options, title, "") +
      `<body>${header(options, title)}` +
      `<redoc spec-url="${safeUrl(options.specUrl)}" hide-hostname></redoc>` +
      `<script src="${safeUrl(base)}/redoc.standalone.js"${integrityAttrs(integrity.script)}></script>` +
      `${footer()}</body></html>`
    );
  }

  const base = (options.assetsBaseUrl ?? DEFAULT_SWAGGER_ASSETS).replace(/(?<!\/)\/+$/, "");
  return (
    head(
      options,
      title,
      `<link rel="stylesheet" href="${safeUrl(base)}/swagger-ui.css"${integrityAttrs(integrity.stylesheet)}>`,
    ) +
    `<body>${header(options, title)}<div id="zudo-openapi"></div>` +
    `<script src="${safeUrl(base)}/swagger-ui-bundle.js"${integrityAttrs(integrity.script)}></script>` +
    `<script>${swaggerInitScript(options)}</script>` +
    `${footer()}</body></html>`
  );
}

function resolveIntegrity(
  options: OpenAPIUIOptions,
  renderer: OpenAPIUIRenderer,
): OpenAPIUIAssetIntegrity {
  if (options.assetIntegrity === false) return {};
  if (options.assetIntegrity !== undefined) return options.assetIntegrity;
  if (options.assetsBaseUrl !== undefined) return {};
  return renderer === "redoc" ? REDOC_INTEGRITY : SWAGGER_UI_INTEGRITY;
}
