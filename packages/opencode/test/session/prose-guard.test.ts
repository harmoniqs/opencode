import { describe, expect, test } from "bun:test"
import { askedQuestionInProse, PROSE_QUESTION_NUDGE } from "../../src/session/prose-guard"

// Coverage for the Amico interview prose guard (amicode#245). Behavior is
// unchanged — a prose question in an active interview is still forced into a
// card, at most once per assistant message — but the nudge text is bilingual:
// it instructs options-with-recommended-first for choice questions and the
// text kind for free-form questions. A turn that called the question tool
// (either kind) never triggers the nudge.

describe("askedQuestionInProse", () => {
  const prose = [{ type: "text", text: "Reasoning done. What is your name?" }]

  test("a prose question in an active interview triggers the nudge", () => {
    expect(askedQuestionInProse({ alreadyNudged: false, parts: prose, interviewActive: true })).toBe(true)
  })

  test("a turn that called the question tool never triggers it", () => {
    const parts = [
      { type: "tool", tool: "question" },
      { type: "text", text: "What is your name?" },
    ]
    expect(askedQuestionInProse({ alreadyNudged: false, parts, interviewActive: true })).toBe(false)
  })

  test("an already-nudged message is let through (at most once per message)", () => {
    expect(askedQuestionInProse({ alreadyNudged: true, parts: prose, interviewActive: true })).toBe(false)
  })

  test("text that does not end in a question mark is not a prose question", () => {
    const parts = [{ type: "text", text: "Recording the system now." }]
    expect(askedQuestionInProse({ alreadyNudged: false, parts, interviewActive: true })).toBe(false)
  })

  test("a trailing quote or bracket after the question mark still counts", () => {
    const parts = [{ type: "text", text: 'And your affiliation — "where do you work?"' }]
    expect(askedQuestionInProse({ alreadyNudged: false, parts, interviewActive: true })).toBe(true)
  })

  test("outside an active interview a prose question is left alone", () => {
    expect(askedQuestionInProse({ alreadyNudged: false, parts: prose, interviewActive: false })).toBe(false)
  })

  test("missing parts never throw and never nudge", () => {
    expect(askedQuestionInProse({ alreadyNudged: false, parts: undefined, interviewActive: true })).toBe(false)
  })
})

describe("PROSE_QUESTION_NUDGE", () => {
  test("still forces every question through the question tool", () => {
    expect(PROSE_QUESTION_NUDGE).toContain("`question` tool")
    expect(PROSE_QUESTION_NUDGE).toContain("plain prose renders nothing to answer")
  })

  test("instructs options with the recommended option first for choice questions", () => {
    expect(PROSE_QUESTION_NUDGE).toContain("(Recommended)")
  })

  test("instructs the text kind for free-form questions", () => {
    expect(PROSE_QUESTION_NUDGE).toContain('kind: "text"')
  })
})
