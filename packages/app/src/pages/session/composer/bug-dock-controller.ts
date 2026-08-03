// amicode/opencode#117: the bug-report dock's controller — a module-singleton
// state machine the dock component (session-bug-dock.tsx) renders against.
// Kept component-free so the contract stays unit-testable (the app has no
// component-render test surface — Solid needs its compile-time transform;
// see the issue's Testing Decisions). Lifecycle spec: amicode ADR 0004 —
// collapse never kills; only the close control (pre-file) or filing ends the
// bug session; the extension owns the real close after archiving.
//
// Bridge contract (mirrored by the extension slice, amicode#250):
//   DOWN {source:"amicode", kind:"open-bug-report",  sessionID}
//   DOWN {source:"amicode", kind:"close-bug-report", sessionID}
//   UP   {source:"amicode", kind:"bug-filed",         sessionID, url}
//   UP   {source:"amicode", kind:"bug-report-closed", sessionID}
import { createSignal } from "solid-js"
import { ServerConnection } from "@/context/server"
import { bugReportEnabled } from "@/utils/amicode-bug-report"
import { sessionHref } from "@/utils/session-route"
import { bugDock } from "./bug-dock"

export const OPEN_BUG_REPORT_KIND = "open-bug-report"
export const CLOSE_BUG_REPORT_KIND = "close-bug-report"
export const BUG_FILED_KIND = "bug-filed"
export const BUG_REPORT_CLOSED_KIND = "bug-report-closed"

/** "closed" — no dock. "chat" — dock live, iframe hosting the bug session.
 *  "filed" — terminal end-state (issue link) until the extension closes it. */
export type BugDockPhase = "closed" | "chat" | "filed"

export type BugDockControllerDeps = {
  /** the boot-param gate (amicode_bug_report=1) — the dock is inert without it */
  enabled?: () => boolean
  /** bridge up-post — defaults to the amicode message envelope */
  post?: (kind: string, payload: Record<string, unknown>) => void
  /** the #116 open-state seam — the dock owns open()/close() */
  dock?: Pick<typeof bugDock, "open" | "close">
}

const defaultPost = (kind: string, payload: Record<string, unknown>) => {
  try {
    window.parent?.postMessage({ source: "amicode", kind, ...payload }, "*")
  } catch {}
}

/** The dock body's iframe URL — the deck's URL-pinned chat-iframe idiom
 *  (split-frame's paneSrc): the app at the bug session's route, booted as a
 *  namespaced pane so its global UI state never fights the main window. */
export function bugDockFrameSrc(input: {
  origin: string
  serverKey: string
  sessionID: string
  colorScheme: string
  authToken?: string
  hiddenProject?: string
}): string {
  const url = new URL(input.origin)
  url.pathname = sessionHref(ServerConnection.Key.make(input.serverKey), input.sessionID)
  url.search = ""
  url.searchParams.set("colorScheme", input.colorScheme)
  if (input.authToken) url.searchParams.set("auth_token", input.authToken)
  if (input.hiddenProject) url.searchParams.set("amicode_hide_project", input.hiddenProject)
  url.searchParams.set("amicode_pane", "bug-dock")
  return url.href
}

export function createBugDockController(deps: BugDockControllerDeps = {}) {
  const enabled = deps.enabled ?? bugReportEnabled
  const post = deps.post ?? defaultPost
  const dock = deps.dock ?? bugDock

  const [sessionID, setSessionID] = createSignal<string>()
  const [open, setOpen] = createSignal(false)
  const [collapsed, setCollapsed] = createSignal(false)
  const [filedUrl, setFiledUrl] = createSignal<string>()

  const phase = (): BugDockPhase => {
    if (!open()) return "closed"
    return filedUrl() ? "filed" : "chat"
  }

  const adopt = (id: string) => {
    setSessionID(id)
    setCollapsed(false)
    setFiledUrl(undefined)
    setOpen(true)
    dock.open()
  }

  const dismiss = () => {
    setOpen(false)
    setSessionID(undefined)
    setCollapsed(false)
    setFiledUrl(undefined)
    dock.close()
  }

  const handleBridgeMessage = (data: unknown) => {
    if (typeof data !== "object" || !data) return
    const message = data as { source?: unknown; kind?: unknown; sessionID?: unknown }
    if (message.source !== "amicode") return
    if (message.kind === OPEN_BUG_REPORT_KIND) {
      if (!enabled()) return
      if (typeof message.sessionID !== "string" || !message.sessionID) return
      adopt(message.sessionID)
      return
    }
    if (message.kind === CLOSE_BUG_REPORT_KIND) {
      // Extension-initiated close (post-archive teardown): close quietly —
      // the extension already knows, posting bug-report-closed back would lie.
      if (!open() || message.sessionID !== sessionID()) return
      dismiss()
    }
  }

  /** The chevron — collapse/re-expand only. Never posts, never closes:
   *  collapsing the dock keeps the bug session alive (ADR 0004). */
  const toggleCollapsed = () => {
    if (!open()) return
    setCollapsed((value) => !value)
  }

  /** Re-expand an open-but-collapsed dock — the button's revealNonce path.
   *  Never posts. */
  const reveal = () => {
    if (!open()) return
    setCollapsed(false)
  }

  /** The close control — the ONLY user action that ends an unfiled session.
   *  Posts bug-report-closed exactly once (the dock is closed after the first
   *  request, so there is no second), then dismisses locally; the extension
   *  aborts + hard-deletes the session. */
  const requestClose = () => {
    const id = sessionID()
    if (!open() || !id) return
    post(BUG_REPORT_CLOSED_KIND, { sessionID: id })
    dismiss()
  }

  return {
    phase,
    sessionID,
    collapsed,
    filedUrl,
    handleBridgeMessage,
    toggleCollapsed,
    reveal,
    requestClose,
  }
}

export type BugDockController = ReturnType<typeof createBugDockController>

/** The one dock per window — the component renders against this instance. */
export const bugDockController = createBugDockController()
