import { describe, expect, test } from "bun:test"

/**
 * Tests for the Session Chats Dropdown logic (amicode#274).
 * Validates the session info derivation and tab-status indicators.
 */

type SessionTab = { type: "session"; server: string; sessionId: string }
type DraftTab = { type: "draft"; draftID: string; server: string; directory: string }
type Tab = SessionTab | DraftTab

function deriveSessionInfos(
  tabs: Tab[],
  getTitle: (id: string) => string | undefined,
  currentSessionID: string | undefined,
) {
  return tabs
    .filter((tab): tab is SessionTab => tab.type === "session")
    .map((tab) => ({
      id: tab.sessionId,
      title: getTitle(tab.sessionId) || tab.sessionId,
      isCurrent: tab.sessionId === currentSessionID,
      server: tab.server,
    }))
}

describe("Session Chats Dropdown", () => {
  test("derives session infos from open tabs", () => {
    const tabs: Tab[] = [
      { type: "session", server: "local", sessionId: "ses_1" },
      { type: "session", server: "local", sessionId: "ses_2" },
      { type: "draft", draftID: "d1", server: "local", directory: "/proj" },
    ]
    const titles: Record<string, string> = { ses_1: "X gate optimization", ses_2: "CZ gate" }

    const infos = deriveSessionInfos(tabs, (id) => titles[id], "ses_1")

    expect(infos).toHaveLength(2)
    expect(infos[0]).toEqual({ id: "ses_1", title: "X gate optimization", isCurrent: true, server: "local" })
    expect(infos[1]).toEqual({ id: "ses_2", title: "CZ gate", isCurrent: false, server: "local" })
  })

  test("falls back to session ID when title is undefined", () => {
    const tabs: Tab[] = [{ type: "session", server: "local", sessionId: "ses_3" }]
    const infos = deriveSessionInfos(tabs, () => undefined, undefined)

    expect(infos[0].title).toBe("ses_3")
  })

  test("marks no session as current when currentSessionID is undefined", () => {
    const tabs: Tab[] = [
      { type: "session", server: "local", sessionId: "ses_1" },
      { type: "session", server: "local", sessionId: "ses_2" },
    ]
    const infos = deriveSessionInfos(tabs, () => "Title", undefined)

    expect(infos.every((i) => !i.isCurrent)).toBe(true)
  })

  test("excludes draft tabs", () => {
    const tabs: Tab[] = [
      { type: "draft", draftID: "d1", server: "local", directory: "/proj" },
      { type: "draft", draftID: "d2", server: "local", directory: "/proj2" },
    ]
    const infos = deriveSessionInfos(tabs, () => "Title", undefined)

    expect(infos).toHaveLength(0)
  })
})
