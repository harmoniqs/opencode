// AMICODE: pure logic for the "thinking" working indicator (thinking-line.tsx).
// Split out from the SolidJS component so word rotation + label formatting are
// unit-testable without a DOM (fork convention: keep message/part render thin,
// test the pure bits — see run-series.ts / run-series.test.ts).

// Whimsical-but-tasteful gerunds shown while Amico works, in the spirit of the
// Claude Code CLI. Kept lightly on-brand (a couple of quantum-control nods among
// the playful ones). No trailing ellipsis here — the component appends the "…".
export const THINKING_WORDS = [
  "Thinking",
  "Pondering",
  "Ruminating",
  "Percolating",
  "Composing",
  "Harmonizing",
  "Tuning",
  "Noodling",
  "Conjuring",
  "Synthesizing",
  "Reticulating",
  "Optimizing",
] as const

/** Word for a given tick, cycling through THINKING_WORDS (wraps, incl. negatives). */
export function wordAt(tick: number): string {
  const n = THINKING_WORDS.length
  const i = ((Math.floor(tick) % n) + n) % n
  return THINKING_WORDS[i]
}

/** Compact elapsed label: 0s, 12s, 1m 03s, 12m 05s. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`
}

/** Minimal shape of the per-message token accounting we read
 *  (SDK v2 AssistantMessage.tokens — we only need the two growing fields). */
export interface TokenUsage {
  output?: number
  reasoning?: number
}

/** Tokens generated so far this turn — output + reasoning summed across the
 *  turn's assistant messages. This is the number that grows while Amico works;
 *  input/cache are excluded (they're static context, not "thinking" output). */
export function turnTokens(messages: ReadonlyArray<{ tokens?: TokenUsage | null }>): number {
  let n = 0
  for (const m of messages) {
    const t = m.tokens
    if (!t) continue
    n += (t.output ?? 0) + (t.reasoning ?? 0)
  }
  return n
}

/** Compact token label: 42 -> "42", 2400 -> "2.4k", 1_200_000 -> "1.2M". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0"
  if (n < 1000) return String(Math.floor(n))
  if (n < 1_000_000) {
    const k = n / 1000
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`
  }
  const mm = n / 1_000_000
  return `${mm >= 100 ? Math.round(mm) : Math.round(mm * 10) / 10}M`
}
