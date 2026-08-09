import { describe, expect, test } from "bun:test"
import { ZOOM_BRIDGE_KIND, inWebview, webZoom, webZoomIn, webZoomOut, webZoomReset } from "./web-zoom"

// Zoom routing (amicode#266): the WORKBENCH owns zoom inside the webview — the
// host intercepts the chords before this document sees them, so in-app CSS
// zoom is unreachable there. The app posts a bridge envelope instead. On a
// plain browser (unframed) the app owns zoom and the CSS path applies.
//
// happydom's window.parent defaults to the window itself → unframed by
// default; the framed case shadows the property with a posting stub.

function framedWindow(): { restore(): void } {
  const fakeParent = { postMessage: (_msg: unknown) => {} }
  Object.defineProperty(window, "parent", { value: fakeParent, configurable: true })
  return {
    restore() {
      Object.defineProperty(window, "parent", { value: window, configurable: true })
    },
  }
}

describe("web-zoom routing (amicode#266)", () => {
  test("unframed: zoom applies in-app — the signal moves, nothing is posted", () => {
    expect(inWebview()).toBe(false)
    const before = webZoom()
    webZoomIn()
    expect(webZoom()).toBe(Math.round((before + 0.1) * 100) / 100)
    webZoomOut()
    webZoomReset()
    expect(webZoom()).toBe(1)
  })

  test("framed: zoom posts the bridge envelope and leaves the signal at 1", () => {
    const posted: unknown[] = []
    Object.defineProperty(window, "parent", {
      value: { postMessage: (msg: unknown) => posted.push(msg) },
      configurable: true,
    })
    try {
      expect(inWebview()).toBe(true)
      webZoomIn()
      webZoomOut()
      webZoomReset()
      expect(posted).toEqual([
        { source: "amicode", kind: ZOOM_BRIDGE_KIND, action: "in" },
        { source: "amicode", kind: ZOOM_BRIDGE_KIND, action: "out" },
        { source: "amicode", kind: ZOOM_BRIDGE_KIND, action: "reset" },
      ])
      expect(webZoom()).toBe(1)
    } finally {
      framedWindow().restore()
    }
  })

  test("the zoom envelopes carry exactly the three workbench actions", () => {
    const actions: unknown[] = []
    Object.defineProperty(window, "parent", {
      value: { postMessage: (msg: unknown) => actions.push(msg) },
      configurable: true,
    })
    try {
      webZoomIn()
      webZoomOut()
      webZoomReset()
      expect(actions.map((m) => (m as { action: unknown }).action)).toEqual(["in", "out", "reset"])
    } finally {
      framedWindow().restore()
    }
  })
})
