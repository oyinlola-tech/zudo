/*
 * Tailwind theme for the site. Read at build time by site/tailwind.config.cjs
 * (pnpm site:css); it is not loaded in the browser.
 *
 * Every colour points at a token from css/site.css instead of a hex value, so
 * the utilities the pages already use (bg-zudo-white, border-black, bg-black/5,
 * text-gray-700 …) follow the theme without any page changing. The light values
 * of those tokens are the hex values this file used to hold, so light mode is
 * unchanged. Where one name plays two roles the per-utility keys below split
 * them: text-zudo-blue is lifted in dark for contrast while bg-zudo-blue stays
 * the brand blue; bg-zudo-white is the page while text-zudo-white stays paper.
 */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'zudo-red': 'rgb(var(--z-red-rgb) / <alpha-value>)',
        'zudo-red-dark': 'var(--z-red-hover)',
        'zudo-red-light': 'var(--z-red-light)',
        'zudo-red-soft': 'var(--z-red-soft)',
        'zudo-blue': 'var(--z-blue)',
        'zudo-blue-dark': 'var(--z-blue-hover)',
        'zudo-yellow': 'rgb(var(--z-yellow-rgb) / <alpha-value>)',
        'zudo-yellow-dark': 'var(--z-yellow-dark)',
        'zudo-black': 'rgb(var(--z-ink-rgb) / <alpha-value>)',
        'zudo-navy': 'var(--z-ink-2)',
        'zudo-white': 'rgb(var(--z-paper-rgb) / <alpha-value>)',
        'zudo-green': 'var(--z-green)',
        'zudo-pink': 'var(--z-pink)',
        'zudo-gray': 'var(--z-gray)',
        'zudo-cream': 'var(--z-surface-alt)',
        'zudo-surface': 'var(--z-surface)',
        'zudo-border': 'var(--z-border-strong)',
        'zudo-code-bg': '#1E1E2E',
        'zudo-code-mantle': '#181825',
        'zudo-code-green': '#A6E3A1',
        'zudo-code-pink': '#F5C2E7',
        'zudo-code-blue': '#89B4FA',
        'zudo-code-yellow': '#F9E2AF',
        'zudo-code-red': '#F38BA8',
        'zudo-code-teal': '#94E2D5',
        'zudo-code-mauve': '#CBA6F7',
        'zudo-code-text': '#CDD6F4',
        'zudo-code-muted': '#6C7086',
        'zudo-code-comment': '#9399B2',
        'zudo-code-peach': '#FAB387',
        black: 'rgb(var(--z-black-rgb) / <alpha-value>)',
        gray: {
          50: 'var(--z-gray-50)',
          100: 'var(--z-gray-100)',
          200: 'var(--z-gray-200)',
          300: 'var(--z-gray-300)',
          400: 'var(--z-gray-400)',
          500: 'var(--z-gray-500)',
          600: 'var(--z-gray-600)',
          700: 'var(--z-gray-700)',
          800: 'var(--z-gray-800)',
          900: 'var(--z-gray-900)',
        },
        yellow: { 50: 'var(--z-tint-yellow)' },
        red: { 50: 'var(--z-tint-red)', 700: 'var(--z-red-700)' },
        blue: { 50: 'var(--z-tint-blue)', 700: 'var(--z-blue-700)' },
        green: { 50: 'var(--z-tint-green)' },
        pink: { 50: 'var(--z-tint-pink)' },
      },
      backgroundColor: {
        white: 'rgb(var(--z-surface-rgb) / <alpha-value>)',
        'zudo-white': 'var(--z-bg)',
        'zudo-black': 'rgb(var(--z-inverse-rgb) / <alpha-value>)',
        /* bg-black is a deliberately black block (table heads, banners) and
           stays black in both themes; bg-black/5 and friends are ink tints
           and must follow the theme. Tailwind passes "var(--tw-bg-opacity, 1)"
           when a class has no opacity modifier. */
        black: function (c) {
          var o = c.opacityValue;
          if (o === undefined || String(o).indexOf('var(') === 0) return '#000000';
          return 'rgb(var(--z-black-rgb) / ' + o + ')';
        },
      },
      textColor: {
        'zudo-red': 'var(--z-red-text)',
        'zudo-blue': 'var(--z-blue-text)',
        'zudo-green': 'var(--z-green-text)',
        'zudo-yellow': 'var(--z-yellow-text)',
        'zudo-pink': 'var(--z-pink-text)',
      },
      borderColor: {
        'zudo-red': 'var(--z-red-text)',
        'zudo-blue': 'var(--z-blue-text)',
        'zudo-green': 'var(--z-green-text)',
        'zudo-yellow': 'var(--z-yellow-text)',
        'zudo-pink': 'var(--z-pink-text)',
      },
      borderWidth: {
        '3': '3px',
        '6': '6px',
      },
      boxShadow: {
        'brutal': '4px 4px 0 0 var(--z-shadow)',
        'brutal-lg': '8px 8px 0 0 var(--z-shadow)',
        'brutal-red': '4px 4px 0 0 var(--z-red)',
        'brutal-white': '4px 4px 0 0 rgb(var(--z-paper-rgb))',
      },
      fontFamily: {
        'sans': ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        'system': ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
    }
  }
}
