/**
 * The Zudo theme applied on top of the viewer's own stylesheet.
 */

/** Built-in page CSS; `customCss` is appended after it. */
export const THEME_CSS = `
:root{--zd-ink:#1A1A2E;--zd-red:#C0392B;--zd-bg:#FAFAF9;--zd-border:#E5E7EB}
*{border-radius:0!important}
html,body{margin:0;background:var(--zd-bg);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.zudo-bar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:14px;height:56px;padding:0 20px;background:var(--zd-ink);color:var(--zd-bg);border-bottom:3px solid var(--zd-red)}
.zudo-bar a{display:inline-flex;align-items:center;color:inherit;text-decoration:none}
.zudo-bar img{height:22px;width:auto;display:block}
.zudo-bar .zudo-sep{width:1px;height:22px;background:rgba(250,250,249,.25)}
.zudo-bar .zudo-title{font-weight:800;font-size:14px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zudo-bar .zudo-spec{margin-left:auto;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:rgba(250,250,249,.75);border:2px solid rgba(250,250,249,.3);padding:6px 10px}
.zudo-bar .zudo-spec:hover{border-color:var(--zd-bg);color:var(--zd-bg)}
.zudo-foot{padding:16px 20px;border-top:1px solid var(--zd-border);color:#6B7280;font-size:12px;display:flex;gap:8px;align-items:center}
.zudo-foot img{height:14px;width:auto}
.swagger-ui .topbar{display:none}
.swagger-ui .info .title{font-weight:900;letter-spacing:-.01em;color:var(--zd-ink)}
.swagger-ui .opblock{border-width:2px;box-shadow:none}
.swagger-ui .btn{border-width:2px;font-weight:700}
.swagger-ui .btn.execute{background:var(--zd-red);border-color:var(--zd-red)}
.swagger-ui .scheme-container{box-shadow:none;border-bottom:1px solid var(--zd-border);background:#fff}
`;
