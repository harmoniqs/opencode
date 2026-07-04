// AMICODE: single consumer of the AMICODE_DIFF sentinel wire (spec A —
// amicode_tools.ts sentinelLine). The sentinel is the LAST line of an
// amicode_* tool return: `AMICODE_DIFF {problem, entity, action, seq, diff}`.
// Strict parse; ANY failure → undefined and callers fall back to the legacy
// chip, so old sessions keep rendering. Never throws.

const PREFIX = "AMICODE_DIFF "

export type DiffEntry = { from: unknown; to: unknown }
export type DiffSentinel = {
  problem: string
  entity: string
  action: string
  seq?: number
  diff: Record<string, DiffEntry>
}

export function parseDiffSentinel(output: unknown): DiffSentinel | undefined {
  if (typeof output !== "string") return undefined
  const lines = output.trimEnd().split("\n")
  const last = lines[lines.length - 1]
  if (!last?.startsWith(PREFIX)) return undefined
  try {
    const raw = JSON.parse(last.slice(PREFIX.length))
    if (typeof raw !== "object" || raw === null) return undefined
    if (typeof raw.entity !== "string" || typeof raw.action !== "string") return undefined
    const diff: Record<string, DiffEntry> = {}
    if (typeof raw.diff === "object" && raw.diff !== null)
      for (const [key, value] of Object.entries(raw.diff as Record<string, any>))
        diff[key] = { from: value?.from ?? null, to: value?.to ?? null }
    return {
      problem: typeof raw.problem === "string" ? raw.problem : "",
      entity: raw.entity,
      action: raw.action,
      seq: typeof raw.seq === "number" ? raw.seq : undefined,
      diff,
    }
  } catch {
    return undefined
  }
}

export const ENTITY_LABELS: Record<string, string> = {
  system: "System",
  formulation: "Formulation",
  run: "Run",
  device_session: "Device",
  calibration: "Calibration",
  problem: "Problem",
}
export function entityLabel(kind: string): string {
  const known = ENTITY_LABELS[kind]
  if (known) return known
  const raw = kind.replaceAll("_", " ")
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : kind
}

function short(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  return JSON.stringify(value)
}

/** `System · levels 3→4 · omega 4.8` — dotted diff keys render bare (last
 *  segment); creates (from null) render value-only; the spec-A elision key
 *  `…` renders as a bare ellipsis. Empty diff → the action. One line, always. */
export function receiptText(sentinel: DiffSentinel): string {
  const parts = Object.entries(sentinel.diff).map(([key, entry]) => {
    if (key === "…") return "…"
    const bare = key.split(".").pop() ?? key
    if (entry.from === null || entry.from === undefined) return `${bare} ${short(entry.to)}`
    return `${bare} ${short(entry.from)}→${short(entry.to)}`
  })
  const body = parts.length > 0 ? parts.join(" · ") : sentinel.action
  return `${entityLabel(sentinel.entity)} · ${body}`
}

/** For any raw-output display path: drop a trailing sentinel line. NOTE: the
 *  current fork has NO such path — card.tsx deliberately never renders the raw
 *  tool return, and amicode_* parts never reach GenericTool (message-part.tsx
 *  routes them all to AmicodeToolCard). Exported + tested so the spec's strip
 *  rule holds by construction if a raw path is ever added. */
export function stripSentinel(output: unknown): string {
  if (typeof output !== "string") return ""
  const lines = output.trimEnd().split("\n")
  if (lines[lines.length - 1]?.startsWith(PREFIX)) lines.pop()
  return lines.join("\n").trimEnd()
}
