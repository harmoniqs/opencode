// @refresh reload

import * as Sentry from "@sentry/solid"
import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { adoptHiddenProject } from "@/utils/amicode-hidden-project"
import { type Platform, PlatformProvider } from "@/context/platform"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"
import { installGlobalClipboardFallback } from "@/utils/global-clipboard"
import { webZoom } from "@/utils/web-zoom"
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

// Amicode webview: window.open from the sandboxed chat iframe has no route to
// a real browser, and the markdown link click handler preventDefaults every
// click (plain or ⌘), so links in chat were dead. Post the URL over the same
// bridge as the clipboard (host: kind "open-external" → vscode.env.openExternal,
// https:// only). Framed contexts only; plain browser tabs keep window.open.
const openLink: Platform["openLink"] = (url) => {
  if (window.parent === window) {
    window.open(url, "_blank")
    return
  }
  window.parent.postMessage({ source: "amicode", kind: "open-external", url }, "*")
}

// Amicode webview: raw <a href> clicks never reach platform.openLink — the
// Markdown renderer stamps plain anchors (no interceptor), and native
// navigation/popups from the sandboxed iframe are dead ends. Route every
// external anchor click to the extension host over the same bridge, in the
// capture phase so component-level handlers (link.tsx → openLink) don't fire
// a second postMessage. Framed contexts only; relative/router hrefs pass
// through untouched.
const installLinkBridge = () => {
  if (window.parent === window) return
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const href = target.closest("a[href]")?.getAttribute("href")
      if (!href || !/^https?:\/\//i.test(href)) return
      event.preventDefault()
      event.stopPropagation()
      window.parent.postMessage({ source: "amicode", kind: "open-external", url: href }, "*")
    },
    true,
  )
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
  if (!params.has("auth_token") && !params.has("amicode_hide_project")) return
  params.delete("auth_token")
  params.delete("amicode_hide_project")
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
  webviewZoom: webZoom,
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
  // Amicode webview: route ⌘V/⌘C/⌘X for every editable through the
  // extension-host bridge (framed contexts only — self-gates unframed).
  installGlobalClipboardFallback(window)
  installLinkBridge()
  adoptHiddenProject(location.search) // amicode#203: hide the extension's scaffold project
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
