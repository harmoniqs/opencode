// Amico interview prose-question guard — the prompt loop's rules, extracted so
// they are unit-testable (same pattern as turn-output.ts for the silent-turn
// guard).
//
// The pulse-designer interview must ask every question via the `question` tool
// (it renders the clickable card). Models intermittently drift and ask in PROSE
// instead, which leaves the user with no card and stalls the interview. When a
// turn ends by asking a question in prose — no question tool call, final text
// ends in "?" — while an interview is active, the loop injects a synthetic
// nudge so the model re-asks via the tool. The guard fires at most once per
// assistant message so a genuinely stubborn turn can't loop forever.
//
// The nudge is bilingual (amicode#245): the model picks the card shape from
// the question it is re-asking — a choice question lists options (recommended
// first), a free-form question uses kind: "text". The loop deliberately does
// no classification of prose intent.

/** The part shapes this rule cares about. Structural on purpose — it accepts
 *  any superset, so callers can pass the full SessionV1 part union unchanged. */
export interface ProseGuardPartLike {
  type: string
  text?: string
  tool?: string
}

/** True when an assistant turn asked the user a question in prose and should
 *  be nudged to re-ask via the `question` tool. */
export function askedQuestionInProse(input: {
  /** This exact assistant message was already nudged (at most once per message). */
  alreadyNudged: boolean
  parts: readonly ProseGuardPartLike[] | undefined
  /** The session has recorded at least one entity via an amicode_* tool. */
  interviewActive: boolean
}): boolean {
  if (input.alreadyNudged) return false
  const parts = input.parts ?? []
  if (parts.some((p) => p.type === "tool" && p.tool === "question")) return false
  const text = parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n")
    .trimEnd()
  // Heuristic: final non-empty line ends with "?" (a question to the user).
  if (!/\?["')\]]*\s*$/.test(text)) return false
  return input.interviewActive
}

/** The synthetic user-turn text injected when the guard fires. */
export const PROSE_QUESTION_NUDGE =
  "[system] You just asked the user a question in plain text. The interview " +
  "requires the `question` tool for every question so the user gets a clickable " +
  "card — plain prose renders nothing to answer. Re-ask that exact question by " +
  "calling the `question` tool now, and do not repeat the question in prose. " +
  "Pick the card shape from the question you are re-asking: a choice question " +
  "lists its options (default option first with \"(Recommended)\"); a free-form " +
  "question — one expecting an open-ended typed answer, like a name or a number " +
  "— uses kind: \"text\" and no options."
