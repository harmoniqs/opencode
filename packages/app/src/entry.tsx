// @refresh reload

import * as Sentry from "@sentry/solid"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { type Platform, PlatformProvider } from "@/context/platform"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"
import { handleNotificationClick } from "@/utils/notification-click"
import { authFromToken } from "@/utils/server"
import pkg from "../package.json"
import { ServerConnection } from "./context/server"

const DEFAULT_SERVER_URL_KEY = "opencode.settings.dat:defaultServerUrl"

const getLocale = () => {
  if (typeof navigator !== "object") return "en" as const
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    if (language.toLowerCase().startsWith("zh")) return "zh" as const
  }
  return "en" as const
}

const getRootNotFoundError = () => {
  const key = "error.dev.rootNotFound" as const
  const locale = getLocale()
  return locale === "zh" ? (zh[key] ?? en[key]) : en[key]
}

const getStorage = (key: string) => {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const setStorage = (key: string, value: string | null) => {
  if (typeof localStorage === "undefined") return
  try {
    if (value !== null) {
      localStorage.setItem(key, value)
      return
    }
    localStorage.removeItem(key)
  } catch {
    return
  }
}

const readDefaultServerUrl = () => getStorage(DEFAULT_SERVER_URL_KEY)
const writeDefaultServerUrl = (url: string | null) => setStorage(DEFAULT_SERVER_URL_KEY, url)

const notify: Platform["notify"] = async (title, description, href) => {
  if (!("Notification" in window)) return

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => "denied")
      : Notification.permission

  if (permission !== "granted") return

  const inView = document.visibilityState === "visible" && document.hasFocus()
  if (inView) return

  const notification = new Notification(title, {
    body: description ?? "",
    icon: "https://opencode.ai/favicon-96x96-v3.png",
  })

  notification.onclick = () => {
    handleNotificationClick(href)
    notification.close()
  }
}

const openLink: Platform["openLink"] = (url) => {
  window.open(url, "_blank")
}

const back: Platform["back"] = () => {
  window.history.back()
}

const forward: Platform["forward"] = () => {
  window.history.forward()
}

const restart: Platform["restart"] = async () => {
  window.location.reload()
}

// Amicode webview: the chat iframe is sandboxed + cross-origin, so
// navigator.clipboard and the native paste event's clipboardData are both
// denied. Ask the extension host over the message bridge instead — it reads
// the OS clipboard and replies (same proven pattern as home-cards.tsx's
// readClipboardViaBridge). Framed contexts only; plain browser tabs use
// native paste and never call this.
const readClipboardText: Platform["readClipboardText"] = () => {
  if (window.parent === window) return Promise.resolve(null)
  return new Promise((resolve) => {
    const nonce = Math.random().toString(36).slice(2)
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; kind?: string; nonce?: string; text?: string } | undefined
      if (data?.source !== "amicode" || data.kind !== "clipboard" || data.nonce !== nonce) return
      window.removeEventListener("message", onMessage)
      resolve(typeof data.text === "string" ? data.text : null)
    }
    window.addEventListener("message", onMessage)
    window.parent.postMessage({ source: "amicode", kind: "clipboard-request", nonce }, "*")
    setTimeout(() => {
      window.removeEventListener("message", onMessage)
      resolve(null)
    }, 1500)
  })
}

// Amicode webview (generalized): the same sandboxed-iframe paste failure
// hits every OTHER editable in the app too — provider API-key fields,
// settings inputs, etc. — not just the chat composer (which has its own
// handler, above, and calls stopPropagation() on every paste it handles —
// so this document-level listener never double-fires there). It only
// activates when the native paste event gave nothing, so it's a no-op
// everywhere clipboardData already works (plain browser tabs, desktop).
const isFormField = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

const installGlobalPasteFallback = () => {
  document.addEventListener("paste", (event) => {
    const target = event.target
    const isEditable = isFormField(target) || (target instanceof HTMLElement && target.isContentEditable)
    if (!isEditable) return
    if (event.clipboardData?.getData("text/plain")) return

    event.preventDefault()
    void readClipboardText().then((text) => {
      if (!text) return
      if (isFormField(target)) {
        const start = target.selectionStart ?? target.value.length
        const end = target.selectionEnd ?? target.value.length
        target.value = target.value.slice(0, start) + text + target.value.slice(end)
        target.selectionStart = target.selectionEnd = start + text.length
        target.dispatchEvent(new Event("input", { bubbles: true }))
      } else {
        document.execCommand("insertText", false, text)
      }
    })
  })
}

// Amicode webview: the write side of readClipboardText. The sandboxed iframe's
// native copy (and navigator.clipboard.writeText) never lands in the OS
// clipboard, so ⌘V — which reads the OS clipboard over the bridge — would paste
// stale content. Push the text to the extension host, which writes
// vscode.env.clipboard, keeping read and write on one clipboard. Framed
// contexts only; plain browser tabs use native copy and never reach here.
const writeClipboardText: Platform["writeClipboardText"] = (text) => {
  if (window.parent === window) return Promise.resolve(false)
  window.parent.postMessage({ source: "amicode", kind: "clipboard-write", text }, "*")
  return Promise.resolve(true)
}

// The copy-side companion to installGlobalPasteFallback: mirror every ⌘C/⌘X
// selection to the OS clipboard via the bridge so a following ⌘V pastes what
// was actually copied in-chat. Mirror-only (no preventDefault) — the native
// selection copy / cut-removal still runs; we just also update the OS clipboard
// the paste bridge reads. Reads the document selection, falling back to a
// form field's own selection (which window.getSelection() does not expose).
const installGlobalCopyBridge = () => {
  if (window.parent === window) return
  document.addEventListener(
    "keydown",
    (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key !== "c" && key !== "x") return
      let text = window.getSelection()?.toString() ?? ""
      const target = event.target
      if (!text && isFormField(target)) {
        const start = target.selectionStart ?? 0
        const end = target.selectionEnd ?? 0
        text = target.value.slice(start, end)
      }
      if (text) void writeClipboardText(text)
    },
    true,
  )
}

const root = document.getElementById("root")
if (!(root instanceof HTMLElement) && import.meta.env.DEV) {
  throw new Error(getRootNotFoundError())
}

const getCurrentUrl = () => {
  if (location.hostname.includes("opencode.ai")) return "http://localhost:4096"
  if (import.meta.env.DEV)
    return `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"}:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"}`
  return location.origin
}

const getDefaultUrl = () => {
  const lsDefault = readDefaultServerUrl()
  if (lsDefault) return lsDefault
  return getCurrentUrl()
}

const clearAuthToken = () => {
  const params = new URLSearchParams(location.search)
  if (!params.has("auth_token")) return
  params.delete("auth_token")
  history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash)
}

const platform: Platform = {
  platform: "web",
  version: pkg.version,
  openLink,
  back,
  forward,
  restart,
  notify,
  getDefaultServer: async () => {
    const stored = readDefaultServerUrl()
    return stored ? ServerConnection.Key.make(stored) : null
  },
  setDefaultServer: writeDefaultServerUrl,
  readClipboardText,
  writeClipboardText,
}

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE ?? `web@${pkg.version}`,
    initialScope: {
      tags: {
        platform: "web",
      },
    },
    integrations: (integrations) => {
      return integrations.filter(
        (i) =>
          i.name !== "Breadcrumbs" && !(import.meta.env.OPENCODE_CHANNEL === "prod" && i.name === "GlobalHandlers"),
      )
    },
  })
}

if (root instanceof HTMLElement) {
  installGlobalPasteFallback()
  installGlobalCopyBridge()
  const auth = authFromToken(new URLSearchParams(location.search).get("auth_token"))
  clearAuthToken()
  const server: ServerConnection.Http = {
    type: "http",
    authToken: !!auth,
    http: {
      url: getCurrentUrl(),
      ...auth,
    },
  }
  render(
    () => (
      <PlatformProvider value={platform}>
        <AppBaseProviders>
          <AppInterface
            defaultServer={ServerConnection.Key.make(getDefaultUrl())}
            canonicalLocalServer={ServerConnection.key(server)}
            servers={[server]}
            disableHealthCheck
          />
        </AppBaseProviders>
      </PlatformProvider>
    ),
    root,
  )
}
