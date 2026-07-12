// AMICODE (widget kernel): srcdoc assembly for the sandboxed widget frame.
// Owns the normative CSP (spec T2.3, review-amended): sandboxing alone does
// NOT block network, the CSP does. blob: in script-src exists solely so the
// runtime can execute the widget module via import() of a Blob URL. Pure,
// unit-tested — including the </script escape, which is what keeps a hostile
// or unlucky widget source from breaking out of its script element.
import { RUNTIME_JS } from "./widget-runtime"

export const WIDGET_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src https: data:"

/** JSON-encode the widget source for inline embedding; \\u003c-escape keeps
 *  "</script>" and "<!--" inert inside the script element. */
export function embedCode(code: string): string {
  return JSON.stringify(code).replace(/</g, "\\u003c")
}

export function buildSrcdoc(opts: { code: string; tokens: Record<string, string>; density: string }): string {
  const rootVars = Object.entries(opts.tokens)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ")
  return `<!doctype html>
<html data-density="${opts.density}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">
<style>
:root { ${rootVars} }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body { font-family: var(--amc-font-sans); color: var(--amc-text); font-size: 13px; }
button, input { font-family: inherit; }
</style>
</head>
<body>
<div id="amc-root"></div>
<script>window.__amcWidgetCode = ${embedCode(opts.code)};</script>
<script>${RUNTIME_JS}</script>
</body>
</html>`
}
