import { describe, expect, test } from "bun:test"
import { bugDockFrameSrc, createBugDockController } from "./bug-dock-controller"

// amicode/opencode#117: the bug-report dock's controller — a module-singleton
// state machine the dock component renders against. Plain-module seams (like
// #116's report-bug.ts) because the app has no component-render test surface
// (Solid needs its compile-time transform; see the issue's Testing Decisions).
//
// Bridge contract (the extension slice, amicode#250, mirrors these shapes):
//   DOWN {source:"amicode", kind:"open-bug-report",  sessionID}
//   DOWN {source:"amicode", kind:"close-bug-report", sessionID}
//   UP   {source:"amicode", kind:"bug-filed",         sessionID, url}
//   UP   {source:"amicode", kind:"bug-report-closed", sessionID}

const openMessage = (sessionID: string) => ({ source: "amicode", kind: "open-bug-report", sessionID })

function setup(opts?: { enabled?: boolean }) {
  const posts: { kind: string; payload: Record<string, unknown> }[] = []
  const dockCalls: string[] = []
  const controller = createBugDockController({
    enabled: opts?.enabled ?? (() => true),
    post: (kind, payload) => posts.push({ kind, payload }),
    dock: {
      open: () => dockCalls.push("open"),
      close: () => dockCalls.push("close"),
    },
  })
  return { controller, posts, dockCalls }
}

describe("bug-dock controller: open-bug-report (AC1)", () => {
  test("a valid open-bug-report opens the dock on the given session, expanded", () => {
    const { controller, dockCalls } = setup()
    expect(controller.phase()).toBe("closed")

    controller.handleBridgeMessage(openMessage("ses_bug1"))

    expect(controller.phase()).toBe("chat")
    expect(controller.sessionID()).toBe("ses_bug1")
    expect(controller.collapsed()).toBe(false)
    // The dock drives the #116 seam's open() — the button side reads isOpen().
    expect(dockCalls).toEqual(["open"])
  })

  test("the frame src pins the bug session's route on the app origin (deck chat-iframe precedent)", () => {
    const src = bugDockFrameSrc({
      origin: "http://localhost:4096",
      serverKey: "test-server-key",
      sessionID: "ses_bug1",
      colorScheme: "dark",
    })
    const url = new URL(src)
    expect(url.origin).toBe("http://localhost:4096")
    expect(url.pathname.endsWith("/session/ses_bug1")).toBe(true)
    expect(url.pathname.startsWith("/server/")).toBe(true)
    expect(url.searchParams.get("colorScheme")).toBe("dark")
    // A namespaced pane instance — the deck's idiom — so the iframe's global
    // UI state never fights the main window.
    expect(url.searchParams.get("amicode_pane")).toBe("bug-dock")
  })

  test("the frame src carries auth + hidden-project params when present", () => {
    const src = bugDockFrameSrc({
      origin: "http://localhost:4096",
      serverKey: "test-server-key",
      sessionID: "ses_bug1",
      colorScheme: "light",
      authToken: "tok",
      hiddenProject: "/wt/hidden",
    })
    const url = new URL(src)
    expect(url.searchParams.get("auth_token")).toBe("tok")
    expect(url.searchParams.get("amicode_hide_project")).toBe("/wt/hidden")
  })
})

describe("bug-dock controller: collapse keeps the session alive (AC2)", () => {
  test("the chevron collapses and re-expands, posting nothing and never closing", () => {
    const { controller, posts, dockCalls } = setup()
    controller.handleBridgeMessage(openMessage("ses_bug1"))
    posts.length = 0
    dockCalls.length = 0

    controller.toggleCollapsed()
    expect(controller.collapsed()).toBe(true)
    expect(controller.phase()).toBe("chat")

    controller.toggleCollapsed()
    expect(controller.collapsed()).toBe(false)

    // Collapse is not close: zero bridge traffic, the dock seam stays open.
    expect(posts).toEqual([])
    expect(dockCalls).toEqual([])
  })

  test("reveal() re-expands an open-but-collapsed dock without posting (the button's revealNonce path)", () => {
    const { controller, posts } = setup()
    controller.handleBridgeMessage(openMessage("ses_bug1"))
    controller.toggleCollapsed()
    expect(controller.collapsed()).toBe(true)

    controller.reveal()

    expect(controller.collapsed()).toBe(false)
    expect(controller.phase()).toBe("chat")
    expect(posts).toEqual([])
  })

  test("collapse/reveal on a closed dock are no-ops", () => {
    const { controller, posts, dockCalls } = setup()
    controller.toggleCollapsed()
    controller.reveal()
    expect(controller.phase()).toBe("closed")
    expect(controller.collapsed()).toBe(false)
    expect(posts).toEqual([])
    expect(dockCalls).toEqual([])
  })
})
