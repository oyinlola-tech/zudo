# Zudo Documentation Site

Public-facing website for the Zudo framework: landing page, documentation, sponsors, error pages, and an in-browser TypeScript playground.

## Structure

```
site/
├── index.html              # Landing page
├── sponsors.html           # Sponsorship page
├── design.md               # Design system notes
├── vercel.json             # Clean-URL rewrites + headers
├── css/
│   ├── site.css            # Shared: tokens, header, footer, search, docs shell, copy buttons
│   ├── home.css            # Landing page (hero terminal, ticker, cards)
│   ├── docs.css            # Documentation pages (typography, code, callouts, tables)
│   ├── errors.css          # Error pages
│   ├── packages.css        # Package index filters
│   └── playground.css      # Terminal playground
├── js/
│   ├── tailwind-config.js  # Shared Tailwind theme (colours, border-3, brutal shadows)
│   ├── components.js       # Header, footer, global search (Ctrl+K), copy buttons — every page
│   ├── playground.js       # Terminal playground (TypeScript via lazy-loaded Babel)
│   ├── docs.js             # Docs: active sidebar, mobile drawer, TOC + scroll spy, tables
│   ├── packages.js         # Package index filtering
│   ├── error-pages.js      # 404 search redirect, 503 countdown
│   ├── version.js          # Version selector persistence
│   ├── home.js             # Reserved for homepage-only behaviour
│   └── toc.js              # Superseded by docs.js (kept so old references do not 404)
├── docs/                   # 57 documentation pages
├── error/                  # 401, 403, 404, 500, 503
└── assets/
    ├── zudo-mark.svg           # Mark, light backgrounds
    ├── zudo-mark-dark.svg      # Mark, dark backgrounds
    ├── zudo-logo.svg           # Wordmark, light backgrounds
    ├── zudo-logo-dark.svg      # Wordmark, dark backgrounds
    ├── zudo-logo-icon.svg      # App-icon tile (navy)
    ├── zudo-favicon.svg        # Favicon (red tile)
    ├── favicon-32.png, apple-touch-icon.png
    └── og-image.png            # Social share image (1200×630)
```

## Every page

Each page contains only two placeholders, `<div id="zudo-nav"></div>` and
`<div id="zudo-footer"></div>`, and loads `css/site.css` + `js/components.js`.
The header, footer, global search and copy buttons are rendered from
`components.js`, so a change there applies to every page.

The playground (`playground.js` + `playground.css`) is also loaded on every
page. Open it with the `>_` button in the header, the floating launcher, or
Ctrl+` . Any link with `data-playground="<example-id>"` opens it with that
example loaded.

## Deployment

Vercel serves this folder as a static site (`vercel.json`, clean URLs):
`/docs/packages/auth` → `docs/packages-auth.html`.

```bash
vercel --prod          # or push to main
```

## Local development

```bash
cd site
python3 -m http.server 8765     # or: npx serve .
```

Pages are plain HTML; open `http://localhost:8765/docs/packages-core.html`
directly (the clean-URL rewrites only exist on Vercel).

## Design

Soft Brutalism: zero border-radius, visible borders, muted palette, Inter +
JetBrains Mono. See `design.md`.
