// AMICODE: pure parse/guard helpers for the amicode_ask question card.
// JSX-free so they are directly testable under `bun test` (repo idiom).

export interface AskInput {
  question: string
  options: string[]
  // Optional per-option detail lines (same order/length as options). Present
  // only when the tool passed a valid, length-matched string[] — otherwise
  // omitted (the card renders without details, never rejected for this).
  details?: string[]
}

// Reads question/options (and optional details) from the tool part's INPUT
// args (not the output text). Tolerant: non-object, missing/empty question,
// or no usable string options → undefined (caller falls back to the collapsed
// chip). Invalid details (length mismatch / non-strings) are treated as
// absent — they never reject the whole card. Details stay aligned with their
// option through the invalid-option filter.
export function parseAskInput(input: unknown): AskInput | undefined {
  if (typeof input !== "object" || input === null) return undefined
  const question = (input as Record<string, unknown>).question
  const options = (input as Record<string, unknown>).options
  const details = (input as Record<string, unknown>).details
  if (typeof question !== "string" || question.trim().length === 0) return undefined
  if (!Array.isArray(options)) return undefined

  const detailsValid =
    Array.isArray(details) &&
    details.length === options.length &&
    details.every((detail) => typeof detail === "string")

  const pairs = options
    .map((option, index) => ({ option, detail: detailsValid ? (details[index] as string).trim() : undefined }))
    .filter(
      (pair): pair is { option: string; detail: string | undefined } =>
        typeof pair.option === "string" && pair.option.trim().length > 0,
    )
  if (pairs.length === 0) return undefined

  return {
    question: question.trim(),
    options: pairs.map((pair) => pair.option.trim()),
    ...(detailsValid ? { details: pairs.map((pair) => pair.detail ?? "") } : {}),
  }
}

// Staleness guard: a question stays actionable until the USER has replied —
// i.e. some user message exists LATER (ULID order: lexicographically greater
// id) than the card's message. Assistant text streamed after the ask call
// must NOT lock the card (live-demo bug, 2026-07-03).
export function hasUserReplyAfter(
  messages: readonly { id: string; role?: string }[],
  messageID: string,
): boolean {
  if (typeof messageID !== "string" || messageID.length === 0) return false
  for (const message of messages) {
    if (message.role !== "user") continue
    if (typeof message.id !== "string" || message.id.length === 0) continue
    if (message.id > messageID) return true
  }
  return false
}
