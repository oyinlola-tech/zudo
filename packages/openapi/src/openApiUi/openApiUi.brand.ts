/**
 * @zudojs/openapi/openApiUi
 *
 * Zudo brand assets embedded as data URIs so generated documentation pages
 * carry the logo without depending on any external host.
 */

/** The Zudo mark for light backgrounds: navy modules, red diagonal. */
export const ZUDO_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-label="Zudo">' +
  '<g fill="#1A1A2E"><rect x="6" y="6" width="12" height="12"/><rect x="20" y="6" width="12" height="12"/><rect x="34" y="6" width="12" height="12"/><rect x="48" y="6" width="12" height="12"/><rect x="62" y="6" width="12" height="12"/>' +
  '<rect x="6" y="62" width="12" height="12"/><rect x="20" y="62" width="12" height="12"/><rect x="34" y="62" width="12" height="12"/><rect x="48" y="62" width="12" height="12"/><rect x="62" y="62" width="12" height="12"/></g>' +
  '<g fill="#C0392B"><rect x="48" y="20" width="12" height="12"/><rect x="34" y="34" width="12" height="12"/><rect x="20" y="48" width="12" height="12"/></g>' +
  "</svg>";

/** The Zudo mark for dark backgrounds: off-white modules, red diagonal. */
export const ZUDO_MARK_DARK_SVG = ZUDO_MARK_SVG.replace(
  'fill="#1A1A2E"',
  'fill="#FAFAF9"',
);

/** The full wordmark (mark + ZUDO letters) for light backgrounds. */
export const ZUDO_WORDMARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 80" role="img" aria-label="Zudo">' +
  ZUDO_MARK_SVG.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") +
  '<g fill="none" stroke="#1A1A2E" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter" transform="translate(100 18)">' +
  '<path d="M6 6H34L6 38H34"/><path d="M64 6V38H92V6"/><path d="M122 6H140L150 16V28L140 38H122Z"/><path d="M180 6H208V38H180Z"/></g>' +
  "</svg>";

/** The wordmark for dark backgrounds. */
export const ZUDO_WORDMARK_DARK_SVG = ZUDO_WORDMARK_SVG.replace(
  /#1A1A2E/g,
  "#FAFAF9",
);

/** A 32×32 favicon: red tile, off-white Z. */
export const ZUDO_FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#C0392B"/>' +
  '<rect x="5" y="6" width="22" height="5" fill="#FAFAF9"/><rect x="17" y="11" width="5" height="4" fill="#FAFAF9"/><rect x="13.5" y="14" width="5" height="4" fill="#FAFAF9"/>' +
  '<rect x="10" y="17" width="5" height="4" fill="#FAFAF9"/><rect x="5" y="21" width="22" height="5" fill="#FAFAF9"/></svg>';

/** Encodes an SVG string as a `data:` URI usable in `<img src>` or CSS. */
export function svgToDataUri(svg: string): string {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(svg)
      .replace(/%20/g, " ")
      .replace(/%3D/g, "=")
      .replace(/%3A/g, ":")
      .replace(/%2F/g, "/")
      .replace(/%22/g, "'")
  );
}

export const ZUDO_MARK_DATA_URI = svgToDataUri(ZUDO_MARK_SVG);
export const ZUDO_MARK_DARK_DATA_URI = svgToDataUri(ZUDO_MARK_DARK_SVG);
export const ZUDO_WORDMARK_DATA_URI = svgToDataUri(ZUDO_WORDMARK_SVG);
export const ZUDO_WORDMARK_DARK_DATA_URI = svgToDataUri(ZUDO_WORDMARK_DARK_SVG);
export const ZUDO_FAVICON_DATA_URI = svgToDataUri(ZUDO_FAVICON_SVG);

/** Where the logo links by default. */
export const ZUDO_SITE_URL = "https://zudo.dev";
