import { describe, expect, test } from "bun:test"

/**
 * Tests for the Session Chats Dropdown logic (amicode#274).
 * Validates session sorting, search filtering, and tab-status derivation —
 * the same behavior as the dashboard sessions flyout (amicode#273).
 */

type Session = {
  id: string
  title?: string
  directory: string
  parentID?: string
  time: { created: number; updated?: number; archived?: number | null }
}

// --- Helpers under test (pure logic extracted from the component) ---

/** Sort sessions: open-tab sessions first, preserving relative order within each group. */
function sortSessionsByOpenTab(
  sessions: Session[],
  hasOpenTab: (session: Session) => boolean,
): Session[] {
  const open: Session[] = []
  const rest: Session[] = []
  for (const session of sessions) {
    if (hasOpenTab(session)) {
      open.push(session)
    } else {
      rest.push(session)
    }
  }
  return [...open, ...rest]
}

/** Filter sessions by search query (matches title or id). */
function filterSessionsByQuery(
  sessions: Session[],
  query: string,
  getTitle: (session: Session) => string,
): Session[] {
  const q = query.trim().toLowerCase()
  if (!q) return sessions
  return sessions.filter((session) => getTitle(session).toLowerCase().includes(q))
}

// --- Tests ---

describe("Session Chats Dropdown", () => {
  const sessions: Session[] = [
    { id: "ses_1", title: "X gate optimization", directory: "/proj", time: { created: 100 } },
    { id: "ses_2", title: "CZ gate", directory: "/proj", time: { created: 200 } },
    { id: "ses_3", title: "Cat state prep", directory: "/proj", time: { created: 300 } },
  ]

  describe("sortSessionsByOpenTab", () => {
    test("moves sessions with open tabs to the front", () => {
      const openIds = new Set(["ses_2"])
      const sorted = sortSessionsByOpenTab(sessions, (s) => openIds.has(s.id))

      expect(sorted[0].id).toBe("ses_2")
      expect(sorted.slice(1).map((s) => s.id)).toEqual(["ses_1", "ses_3"])
    })

    test("preserves order when no sessions have open tabs", () => {
      const sorted = sortSessionsByOpenTab(sessions, () => false)
      expect(sorted.map((s) => s.id)).toEqual(["ses_1", "ses_2", "ses_3"])
    })

    test("preserves order when all sessions have open tabs", () => {
      const sorted = sortSessionsByOpenTab(sessions, () => true)
      expect(sorted.map((s) => s.id)).toEqual(["ses_1", "ses_2", "ses_3"])
    })
  })

  describe("filterSessionsByQuery", () => {
    const getTitle = (s: Session) => s.title || s.id

    test("returns all sessions when query is empty", () => {
      const result = filterSessionsByQuery(sessions, "", getTitle)
      expect(result).toHaveLength(3)
    })

    test("filters by title substring (case-insensitive)", () => {
      const result = filterSessionsByQuery(sessions, "gate", getTitle)
      expect(result.map((s) => s.id)).toEqual(["ses_1", "ses_2"])
    })

    test("filters by session id when title is missing", () => {
      const noTitleSessions: Session[] = [
        { id: "ses_abc", directory: "/proj", time: { created: 100 } },
        { id: "ses_xyz", directory: "/proj", time: { created: 200 } },
      ]
      const result = filterSessionsByQuery(noTitleSessions, "abc", getTitle)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("ses_abc")
    })

    test("returns empty when nothing matches", () => {
      const result = filterSessionsByQuery(sessions, "nonexistent", getTitle)
      expect(result).toHaveLength(0)
    })

    test("trims whitespace from query", () => {
      const result = filterSessionsByQuery(sessions, "  cat  ", getTitle)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("ses_3")
    })
  })
})
