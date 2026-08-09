// amicode: in-app zoom for the WEB host (the plain browser at :3002 and the
// amicode VS Code webview). The desktop build zooms through Electron (menu
// roles); the web build had NO zoom at all — Cmd+=/-/0 fell through to the
// host, which zooms the whole editor window (or the browser tab), never the
// app. This module owns a CSS zoom on the document root, persisted
// per-window, and feeds the same platform.webviewZoom signal the titlebar
// and terminal already watch.
//
// Two hosts, two zoom owners (amicode#266):
//  - Framed (the amicode VS Code webview): the WORKBENCH owns zoom. The host
//    intercepts the zoom chords before the webview document ever sees the
//    keydown, so in-app CSS zoom cannot fire there — the app posts a zoom
//    intent over the extension bridge instead and the extension executes the
//    matching workbench.action.zoomIn/Out/Reset. The app's own zoom signal
//    stays at 1: the host's zoom level is not observable from inside the
//    webview.
//  - Unframed (plain browser): CSS zoom on the document root, as before.
import { createSignal } from "solid-js"

const KEY = "amicode-zoom"
const MIN = 0.5
const MAX = 3
const STEP = 0.1

const clamp = (value: number) => Math.min(Math.max(value, MIN), MAX)

function readSaved(): number {
  if (typeof localStorage === "undefined") return 1
  const parsed = Number.parseFloat(localStorage.getItem(KEY) ?? "1")
  return Number.isFinite(parsed) ? clamp(parsed) : 1
}

const [webZoom, setSignal] = createSignal(readSaved())

/** Framed = inside the amicode VS Code webview, extension host present. */
export const inWebview = () => typeof window !== "undefined" && window.parent !== window

/** The bridge envelope the extension answers with a workbench zoom action. */
export const ZOOM_BRIDGE_KIND = "zoom"
export type ZoomAction = "in" | "out" | "reset"

function postZoom(action: ZoomAction) {
  try {
    window.parent?.postMessage({ source: "amicode", kind: ZOOM_BRIDGE_KIND, action }, "*")
  } catch {}
}

function apply(zoom: number) {
  if (typeof document === "undefined") return
  const html = document.documentElement
  if (zoom === 1) {
    html.style.removeProperty("zoom")
    html.style.removeProperty("transform")
    html.style.removeProperty("transform-origin")
  } else {
    // Try CSS zoom first (better text rendering), fallback to transform
    html.style.setProperty("zoom", String(zoom))
    // Also set transform as backup for browsers that don't support zoom
    html.style.setProperty("transform", `scale(${zoom})`)
    html.style.setProperty("transform-origin", "top left")
  }
}

// Apply zoom immediately and also after a small delay to ensure DOM is ready
apply(webZoom())
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => apply(webZoom()), { once: true })
  // Fallback: also try after a short timeout in case DOMContentLoaded already fired
  setTimeout(() => apply(webZoom()), 0)
}

export function setWebZoom(next: number) {
  const zoom = Math.round(clamp(next) * 100) / 100
  apply(zoom)
  setSignal(zoom)
  try {
    localStorage.setItem(KEY, String(zoom))
  } catch {
    // storage may be unavailable in a sandboxed webview — zoom still applies
  }
}

// Zoom routes to the workbench when framed (the host owns zoom there — its
// chords never reach this document) and to the in-app CSS zoom otherwise
// (plain-browser host, where this module is the only zoom owner).
export const webZoomIn = () => (inWebview() ? postZoom("in") : setWebZoom(webZoom() + STEP))
export const webZoomOut = () => (inWebview() ? postZoom("out") : setWebZoom(webZoom() - STEP))
export const webZoomReset = () => (inWebview() ? postZoom("reset") : setWebZoom(1))
export { webZoom }
