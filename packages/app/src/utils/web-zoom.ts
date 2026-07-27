// amicode: in-app zoom for the WEB host (the amicode VS Code webview and the
// plain browser at :3002). The desktop build zooms through Electron
// (webview-zoom.ts); the web build had NO zoom at all — Cmd+=/-/0 fell
// through to the host, which zooms the whole editor window (or the browser
// tab), never the app. This module owns a CSS zoom on the document root,
// persisted per-window, and feeds the same platform.webviewZoom signal the
// titlebar and terminal already watch.
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

function apply(zoom: number) {
  if (typeof document === "undefined") return
  if (zoom === 1) document.documentElement.style.removeProperty("zoom")
  else document.documentElement.style.setProperty("zoom", String(zoom))
}
apply(webZoom())

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

export const webZoomIn = () => setWebZoom(webZoom() + STEP)
export const webZoomOut = () => setWebZoom(webZoom() - STEP)
export const webZoomReset = () => setWebZoom(1)
export { webZoom }
