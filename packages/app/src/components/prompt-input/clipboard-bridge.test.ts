import { describe, expect, test } from "bun:test"
import { readClipboardViaBridge } from "./clipboard-bridge"

type Listener = (event: MessageEvent) => void

// A stand-in for a framed window (parent !== self) that records outgoing
// clipboard-requests and lets a test play back the host's reply.
function fakeFramedWindow() {
  const listeners = new Set<Listener>()
  const posted: Array<Record<string, unknown>> = []
  const win = {
    addEventListener: (_type: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: Listener) => listeners.delete(fn),
    parent: {
      postMessage: (message: Record<string, unknown>) => posted.push(message),
    },
  } as unknown as Window
  return {
    win,
    posted,
    reply: (message: Record<string, unknown>) => listeners.forEach((fn) => fn({ data: message } as MessageEvent)),
    listenerCount: () => listeners.size,
  }
}

describe("readClipboardViaBridge", () => {
  test("requests the OS clipboard from the host and resolves with the reply", async () => {
    const bridge = fakeFramedWindow()
    const pending = readClipboardViaBridge(bridge.win)

    expect(bridge.posted).toHaveLength(1)
    const request = bridge.posted[0]
    expect(request.source).toBe("amicode")
    expect(request.kind).toBe("clipboard-request")
    expect(typeof request.nonce).toBe("string")

    bridge.reply({ source: "amicode", kind: "clipboard", nonce: request.nonce, text: "solve a CZ gate" })

    expect(await pending).toBe("solve a CZ gate")
    expect(bridge.listenerCount()).toBe(0) // listener cleaned up
  })

  test("ignores replies whose nonce does not match the request", async () => {
    const bridge = fakeFramedWindow()
    const pending = readClipboardViaBridge(bridge.win, 15)

    // A stale reply from an earlier request must not resolve this one.
    bridge.reply({ source: "amicode", kind: "clipboard", nonce: "someone-elses-nonce", text: "leaked" })

    expect(await pending).toBe("") // falls through to the timeout instead
  })

  test("resolves empty on a malformed reply body", async () => {
    const bridge = fakeFramedWindow()
    const pending = readClipboardViaBridge(bridge.win, 15)
    const request = bridge.posted[0]

    bridge.reply({ source: "amicode", kind: "clipboard", nonce: request.nonce }) // no text field

    expect(await pending).toBe("")
  })

  test("resolves empty without posting when the app is not framed", async () => {
    const posted: unknown[] = []
    const win = {
      addEventListener: () => {},
      removeEventListener: () => {},
      postMessage: (message: unknown) => posted.push(message),
    } as unknown as Window
    // parent === self → not inside a webview iframe
    ;(win as unknown as { parent: Window }).parent = win

    expect(await readClipboardViaBridge(win)).toBe("")
    expect(posted).toHaveLength(0)
  })
})
