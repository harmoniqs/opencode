// AMICODE: pure helpers for amicode_* tool parts — stage labels, entity-rail
// stage routing, and tool-summary → chip-text parsing. Kept JSX-free so it is
// directly testable under `bun test` (repo idiom: message-part.test.ts /
// message-part-text.ts).

const STAGES: Record<string, string> = {
  amicode_pick_system: "System",
  amicode_set_model: "Model",
  amicode_formulate: "Formulation",
  amicode_solve: "Run",
}

export function amicodeStage(tool: string) {
  const known = STAGES[tool]
  if (known) return known
  const raw = tool.replace(/^amicode_/, "").replaceAll("_", " ")
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : tool
}

// --- Entity rail (Layer-3) ---

export type RailStage = "System" | "Formulation" | "Run"
export const RAIL_STAGES: readonly RailStage[] = ["System", "Formulation", "Run"]

// Which rail chip a tool feeds. pick_system AND set_model both update the
// System entity (the model params live on the system). Unknown amicode_*
// tools have no rail slot in v0 (they still get the inline chip).
export function railStage(tool: string): RailStage | undefined {
  switch (tool) {
    case "amicode_pick_system":
    case "amicode_set_model":
      return "System"
    case "amicode_formulate":
      return "Formulation"
    case "amicode_solve":
      return "Run"
    default:
      return undefined
  }
}

// Tolerant compaction of a tool's human-readable summary into chip text.
// Input shape (v0 tools): "System updated (transmon, 3 levels, omega=5, delta=-0.2, drive_max=0.5)"
// → "transmon · 3 lvl · ω=5 · δ=−0.2 · cap 0.5".
// Tokens with no known rewrite pass through as-is (raw-parenthetical fallback);
// no parenthetical / empty parenthetical / non-string → undefined.
const TOKEN_REWRITES: readonly [RegExp, string][] = [
  [/^omega=/i, "ω="],
  [/^delta=/i, "δ="],
  [/^drive_max=/i, "cap "],
  [/^(\d+)\s*levels?$/i, "$1 lvl"],
]

export function chipTextFromSummary(output: unknown): string | undefined {
  if (typeof output !== "string") return undefined
  const match = output.match(/\(([^)]*)\)/)
  if (!match) return undefined
  const inner = match[1].trim()
  if (!inner) return undefined
  const tokens = inner.split(/\s*,\s*/).filter(Boolean)
  if (tokens.length === 0) return undefined
  return tokens
    .map((token) => {
      for (const [pattern, replacement] of TOKEN_REWRITES) {
        if (pattern.test(token)) return token.replace(pattern, replacement)
      }
      return token
    })
    .map((token) => token.replace("=-", "=−")) // typographic minus for display
    .join(" · ")
}
