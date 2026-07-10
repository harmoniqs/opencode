// ⌘V inside the Amicode chat: the app runs as a cross-origin iframe inside the
// VS Code webview, where native paste and navigator.clipboard deliver no data
// (the webview parent holds no clipboard-read permission to delegate down). The
// extension host CAN read it, so we ask over the amicode postMessage bridge —
// chat_panel.ts reads vscode.env.clipboard and replies with {kind:"clipboard"}.
// Mirrors the profile-input fallback in @opencode-ai/ui's home-cards.
//
// Resolves "" when unframed (plain web/desktop, where native paste already
// works), on a malformed reply, or after `timeoutMs` with no answer — callers
// treat "" as "nothing to insert", so a missing or dead bridge degrades to a
// no-op rather than a hang.

const BRIDGE_TIMEOUT_MS = 1500

export function readClipboardViaBridge(win: Window = window, timeoutMs = BRIDGE_TIMEOUT_MS): Promise<string> {
  return new Promise<string>((resolve) => {
    // Unframed: native paste works — don't post into the void or wait out the timeout.
    if (win.parent === win) {
      resolve("")
      return
    }

    const nonce = Math.random().toString(36).slice(2)
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (text: string) => {
      win.removeEventListener("message", onMessage)
      if (timer !== undefined) clearTimeout(timer)
      resolve(text)
    }

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; kind?: string; nonce?: string; text?: string } | undefined
      if (data?.source !== "amicode" || data.kind !== "clipboard" || data.nonce !== nonce) return
      finish(typeof data.text === "string" ? data.text : "")
    }

    win.addEventListener("message", onMessage)
    win.parent.postMessage({ source: "amicode", kind: "clipboard-request", nonce }, "*")
    timer = setTimeout(() => finish(""), timeoutMs)
  })
}
