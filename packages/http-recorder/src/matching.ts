import { Option, Schema } from "effect"
import { REDACTED, secretFindings } from "./redaction.js"
import type { HttpInteraction, RequestMatcher, RequestSnapshot } from "./types.js"

const JsonValue = Schema.fromJsonString(Schema.Unknown)
export const decodeJson = Schema.decodeUnknownOption(JsonValue)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

export const canonicalizeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .toSorted()
        .map((key) => [key, canonicalizeJson(value[key])]),
    )
  }
  return value
}

export type { RequestMatcher } from "./types.js"

export const canonicalSnapshot = (snapshot: RequestSnapshot): string =>
  JSON.stringify({
    method: snapshot.method,
    url: snapshot.url,
    headers: canonicalizeJson(snapshot.headers),
    body: Option.match(decodeJson(snapshot.body), {
      onNone: () => snapshot.body,
      onSome: canonicalizeJson,
    }),
  })

export const defaultMatcher: RequestMatcher = (incoming, recorded) =>
  canonicalSnapshot(incoming) === canonicalSnapshot(recorded)

/** Placeholder standing in for elided system-prompt prose. Substituting rather than
 *  deleting keeps "a system message is present, with content" part of the match. */
const SYSTEM_PROMPT_ELIDED = "<system prompt elided for matching>"

/** Top-level keys carrying the system prompt: OpenAI Responses uses `instructions`,
 *  Anthropic Messages uses `system`. */
const SYSTEM_PROMPT_KEYS = ["instructions", "system"] as const

/** Keys carrying a message list, where the prompt may instead arrive as a
 *  `role: "system"` entry (the shape the OpenCode proxy sends). */
const MESSAGE_LIST_KEYS = ["input", "messages"] as const

/** Neutralizes system-prompt prose wherever a provider puts it, leaving every other
 *  part of the request — model, tools, the conversation itself — matched exactly. */
const withoutSystemPrompt = (snapshot: RequestSnapshot): RequestSnapshot => {
  const body = jsonBody(snapshot.body)
  if (!isRecord(body)) return snapshot

  const next: Record<string, unknown> = { ...body }
  let changed = false

  for (const key of SYSTEM_PROMPT_KEYS) {
    if (!(key in next)) continue
    delete next[key]
    changed = true
  }

  for (const key of MESSAGE_LIST_KEYS) {
    const list = next[key]
    if (!Array.isArray(list)) continue
    let listChanged = false
    const elided = list.map((entry) => {
      if (!isRecord(entry) || entry["role"] !== "system" || !("content" in entry)) return entry
      listChanged = true
      return { ...entry, content: SYSTEM_PROMPT_ELIDED }
    })
    if (!listChanged) continue
    next[key] = elided
    changed = true
  }

  return changed ? { ...snapshot, body: JSON.stringify(next) } : snapshot
}

/**
 * Like {@link defaultMatcher}, but ignores the system prompt.
 *
 * A cassette records the exact request that produced its response, system prompt
 * included — so any edit to a prompt invalidates every cassette that carries it,
 * even when the behaviour under test has nothing to do with prompt text. Tests that
 * assert on transport mechanics (tool loops, streaming, retries) should pin the
 * mechanics and stay indifferent to wording.
 *
 * Use this when the prompt is incidental to what the test asserts. Do NOT use it for
 * a test whose subject IS the prompt — there the exact text is the assertion.
 */
export const promptAgnosticMatcher: RequestMatcher = (incoming, recorded) =>
  canonicalSnapshot(withoutSystemPrompt(incoming)) === canonicalSnapshot(withoutSystemPrompt(recorded))

export const safeText = (value: unknown) => {
  if (value === undefined) return "undefined"
  if (secretFindings(value).length > 0) return JSON.stringify(REDACTED)
  const text = JSON.stringify(value)
  if (!text) return typeof value
  return text.length > 300 ? `${text.slice(0, 300)}...` : text
}

const jsonBody = (body: string) => Option.getOrUndefined(decodeJson(body))

const valueDiffs = (expected: unknown, received: unknown, base = "$", limit = 8): ReadonlyArray<string> => {
  if (Object.is(expected, received)) return []
  if (isRecord(expected) && isRecord(received)) {
    return [...new Set([...Object.keys(expected), ...Object.keys(received)])]
      .toSorted()
      .flatMap((key) => valueDiffs(expected[key], received[key], `${base}.${key}`, limit))
      .slice(0, limit)
  }
  if (Array.isArray(expected) && Array.isArray(received)) {
    return Array.from({ length: Math.max(expected.length, received.length) }, (_, index) => index)
      .flatMap((index) => valueDiffs(expected[index], received[index], `${base}[${index}]`, limit))
      .slice(0, limit)
  }
  return [`${base} expected ${safeText(expected)}, received ${safeText(received)}`]
}

const headerDiffs = (expected: Record<string, string>, received: Record<string, string>) =>
  [...new Set([...Object.keys(expected), ...Object.keys(received)])].toSorted().flatMap((key) => {
    if (expected[key] === received[key]) return []
    if (expected[key] === undefined) return [`  ${key} unexpected ${safeText(received[key])}`]
    if (received[key] === undefined) return [`  ${key} missing expected ${safeText(expected[key])}`]
    return [`  ${key} expected ${safeText(expected[key])}, received ${safeText(received[key])}`]
  })

export const requestDiff = (expected: RequestSnapshot, received: RequestSnapshot): ReadonlyArray<string> => {
  const lines: string[] = []
  if (expected.method !== received.method) {
    lines.push("method:", `  expected ${expected.method}, received ${received.method}`)
  }
  if (expected.url !== received.url) {
    lines.push("url:", `  expected ${expected.url}`, `  received ${received.url}`)
  }
  const headers = headerDiffs(expected.headers, received.headers)
  if (headers.length > 0) lines.push("headers:", ...headers.slice(0, 8))
  const expectedBody = jsonBody(expected.body)
  const receivedBody = jsonBody(received.body)
  const body =
    expectedBody !== undefined && receivedBody !== undefined
      ? valueDiffs(expectedBody, receivedBody).map((line) => `  ${line}`)
      : expected.body === received.body
        ? []
        : [`  expected ${safeText(expected.body)}, received ${safeText(received.body)}`]
  if (body.length > 0) lines.push("body:", ...body)
  return lines
}

export const selectSequential = (
  interactions: ReadonlyArray<HttpInteraction>,
  incoming: RequestSnapshot,
  match: RequestMatcher,
  index: number,
): { readonly interaction: HttpInteraction | undefined; readonly detail: string } => {
  const interaction = interactions[index]
  if (!interaction) return { interaction, detail: `interaction ${index + 1} of ${interactions.length} not recorded` }
  if (!match(incoming, interaction.request))
    return { interaction: undefined, detail: requestDiff(interaction.request, incoming).join("\n") }
  return { interaction, detail: "" }
}
