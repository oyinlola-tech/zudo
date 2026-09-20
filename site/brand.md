---
title: "Brand & logo"
description: "Download the ZudoJS logo, wordmark and app icon as SVG and PNG, with the brand colours, clear-space rules and usage guidelines."
source: https://zudojs.oyinlola.site/brand
---

# Brand & logo

The Zudo mark, wordmark and app icon, ready to drop into a slide, a README or a conference badge. Take what you need — no request, no sign-up.

[Download everything (ZIP, 22 KB)](https://zudojs.oyinlola.site/assets/brand/zudo-brand-kit.zip) 6 SVGs · 10 PNGs · usage notes

## The mark

A Z built from modules, with a red diagonal running through the layers: the packages, and the one path through them. Use it on its own wherever the name is already obvious — an avatar, a favicon, a sticker.

  **Mark** On light backgrounds  [SVG](https://zudojs.oyinlola.site/assets/zudo-mark.svg) [PNG 512](https://zudojs.oyinlola.site/assets/brand/zudo-mark-512.png) [PNG 1024](https://zudojs.oyinlola.site/assets/brand/zudo-mark-1024.png)

  **Mark, reversed** On dark backgrounds  [SVG](https://zudojs.oyinlola.site/assets/zudo-mark-dark.svg) [PNG 512](https://zudojs.oyinlola.site/assets/brand/zudo-mark-dark-512.png) [PNG 1024](https://zudojs.oyinlola.site/assets/brand/zudo-mark-dark-1024.png)

## Mark and wordmark

The full lockup: mark, then ZUDO drawn as strokes on the same grid. This is the default choice anywhere the project is being introduced.

  **Logo** On light backgrounds  [SVG](https://zudojs.oyinlola.site/assets/zudo-logo.svg) [PNG 660](https://zudojs.oyinlola.site/assets/brand/zudo-logo-660.png) [PNG 1320](https://zudojs.oyinlola.site/assets/brand/zudo-logo-1320.png)

  **Logo, reversed** On dark backgrounds  [SVG](https://zudojs.oyinlola.site/assets/zudo-logo-dark.svg) [PNG 660](https://zudojs.oyinlola.site/assets/brand/zudo-logo-dark-660.png) [PNG 1320](https://zudojs.oyinlola.site/assets/brand/zudo-logo-dark-1320.png)

## App icon

The mark on its navy tile, for app stores, desktop shortcuts and anywhere a square icon is required. It carries its own background, so it needs no padding of yours.

  **App icon** Navy tile, no transparency  [SVG](https://zudojs.oyinlola.site/assets/zudo-logo-icon.svg) [PNG 512](https://zudojs.oyinlola.site/assets/brand/zudo-app-icon-512.png) [PNG 1024](https://zudojs.oyinlola.site/assets/brand/zudo-app-icon-1024.png)

  **Favicon** 32 px grid  [SVG](https://zudojs.oyinlola.site/assets/zudo-favicon.svg) [PNG 32](https://zudojs.oyinlola.site/assets/favicon-32.png) [Apple touch](https://zudojs.oyinlola.site/assets/apple-touch-icon.png)

## Colours

  **Ink**`#1A1A2E` Mark and wordmark

  **Red**`#C0392B` The diagonal

  **Navy**`#16213E` Dark surfaces, icon tile

  **Off-white**`#FAFAF9` Light surfaces, reversed mark

## Using it

### Please do

- Prefer the SVG. It stays sharp at any size.
- Leave clear space of at least one module — one square of the grid, or 12/80 of the mark's width — on every side.
- Keep the mark at 24 px or larger, and the lockup at 96 px wide or larger.
- Use the reversed files on dark backgrounds.
- Use the logo to link to or refer to Zudo.

### Please don't

- Recolour the artwork, or swap the red diagonal for another colour.
- Stretch, rotate, outline or add effects to it.
- Rebuild the wordmark in another typeface.
- Place the mark on a busy image, or on a background it cannot be read against.
- Use it as your own product's logo, or in a way that suggests Zudo endorses your product.

## Linking to it

Every file is served from this site, so a README or a slide can link to it directly rather than keeping its own copy.

```ts
# Markdown
[![ZudoJS](https://zudojs.oyinlola.site/assets/zudo-logo.svg)](https://zudojs.oyinlola.site)
```

```ts
<!-- HTML -->
<a href="https://zudojs.oyinlola.site">
  <img src="https://zudojs.oyinlola.site/assets/zudo-logo.svg" alt="ZudoJS" width="220">
</a>
```

The artwork is part of the Zudo project, which is [MIT licensed](https://github.com/oyinlola-tech/zudo/blob/main/LICENSE). The marks identify the project; the rules above apply to them.

## For scripts and AI agents

The kit is also published as data, so a build script or an assistant can pick the right file without scraping this page.

- [brand.json](https://zudojs.oyinlola.site/assets/brand/brand.json) — every asset with its URL, format, pixel size and intended background, plus the palette, the rules and the licence.
- [brand.md](https://zudojs.oyinlola.site/brand.md) — this page as Markdown, like every docs page.
- [llms.txt](https://zudojs.oyinlola.site/llms.txt) — the site index agents read first; it points here.

```ts
# the mark, whatever the current file is called
curl -s https://zudojs.oyinlola.site/assets/brand/brand.json \
  | jq -r '.assets[] | select(.id == "mark") | .preferred.url'
```

## Need something else?

If you need a format that isn't here — a vector for print, a one-colour version, a wider lockup — [open a discussion](https://github.com/oyinlola-tech/zudo/discussions) and it will be added.
