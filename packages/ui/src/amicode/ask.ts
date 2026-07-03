// AMICODE: pure parse/guard helpers for the amicode_ask question card.
// JSX-free so they are directly testable under `bun test` (repo idiom).

export interface AskInput {
  question: string
  options: string[]
}

// Reads question/options from the tool part's INPUT args (not the output
// text). Tolerant: non-object, missing/empty question, or no usable string
// options → undefined (caller falls back to the collapsed chip).
export function parseAskInput(input: unknown): AskInput | undefined {
  if (typeof input !== "object" || input === null) return undefined
  const question = (input as Record<string, unknown>).question
  const options = (input as Record<string, unknown>).options
  if (typeof question !== "string" || question.trim().length === 0) return undefined
  if (!Array.isArray(options)) return undefined
  const usable = options
    .filter((option): option is string => typeof option === "string" && option.trim().length > 0)
    .map((option) => option.trim())
  if (usable.length === 0) return undefined
  return { question: question.trim(), options: usable }
}

// Staleness guard input: a question is actionable only while its part lives in
// the LAST assistant message. Message ids are ULIDs → lexicographic max is the
// most recent.
export function latestAssistantMessageID(
  messages: readonly { id: string; role?: string }[],
): string | undefined {
  let best: string | undefined
  for (const message of messages) {
    if (message.role !== "assistant") continue
    if (typeof message.id !== "string" || message.id.length === 0) continue
    if (!best || message.id > best) best = message.id
  }
  return best
}
