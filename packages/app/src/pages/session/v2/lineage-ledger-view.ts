// The unified lineage-ledger view-model (amicode#1082).
//
// This module is the render slice's data core: it turns the server's
// display-safe lineage-ledger projection (the #1078 `browser`-boundary
// projection — see packages/opencode/src/session/receipt-privacy.ts) into the
// Files Changed render model. It consumes ONLY projected facts and assessments;
// it has no path to tool-metadata or filesystem-watcher inference (amicode#1082
// AC1), and no host-only capability, path, evidence, or redaction field is part
// of its input type (those are denied at the browser boundary by construction).

/** Capability discovery result — the sole selector between the three views. */
export type LedgerCapabilityMode = "full" | "partial" | "legacy"

/** One immutable receipt fact as projected to the browser. */
export type LedgerProjectionReceipt = {
  id?: string
  sequence?: number
  resource?: string
  operation?: string
  outcome?: string
  timeCreated?: number
}

/** One append-only assessment revision as projected to the browser. */
export type LedgerProjectionAssessment = {
  receiptID?: string
  confidence?: string
  netState?: string
  evidenceState?: string
  revision?: number
  expiresAt?: number
  timeCreated?: number
}

/**
 * One browser-projected ledger record: operation context + an immutable receipt
 * fact and/or an assessment revision + derived counts. `resourceKey` and
 * `operation.session` are display-safe grouping identities the server projects
 * (a stable logical resource id and a source-session label) — NOT the host-only
 * canonical path or raw session id, which stay denied at this boundary. When
 * `resourceKey` is absent the display path groups the resource.
 */
export type LedgerProjectionRecord = {
  resourceKey?: string
  operation?: { origin?: string; session?: string; state?: string }
  receipt?: LedgerProjectionReceipt
  assessment?: LedgerProjectionAssessment
  derived?: { additions?: number; deletions?: number }
}

export type LedgerCapabilityLabel = {
  mode: LedgerCapabilityMode
  label: string
  description: string
}

// Fixed explanatory text, selected only by capability discovery (amicode#1082
// AC7). Legacy and partial never imply full historical provenance.
export const LEDGER_CAPABILITY_LABELS: Record<LedgerCapabilityMode, LedgerCapabilityLabel> = {
  full: {
    mode: "full",
    label: "Full provenance",
    description: "Every session-visible change is recorded in the lineage ledger.",
  },
  partial: {
    mode: "partial",
    label: "Partial provenance",
    description: "This session upgraded mid-run; changes made before the upgrade are not in the ledger.",
  },
  legacy: {
    mode: "legacy",
    label: "Legacy view",
    description: "This session predates the lineage ledger, so full historical provenance is not available.",
  },
}

export function ledgerCapabilityLabel(mode: LedgerCapabilityMode): LedgerCapabilityLabel {
  return LEDGER_CAPABILITY_LABELS[mode]
}

// --- Status semantics (amicode#1082 AC5) --------------------------------------

export type LedgerStatusKind =
  | "added"
  | "modified"
  | "deleted"
  | "reverted"
  | "conflicted"
  | "unavailable"
  | "opaque"
  | "partial"
  | "unknown"

/** A semantic tone keyword (never a raw color) — color is redundant to icon + text. */
export type LedgerStatusTone = "success" | "danger" | "warning" | "neutral"

/**
 * The status icon glyphs, as a literal subset of the shared icon-name union.
 * Kept UI-package-free so the view model stays testable without the UI deps;
 * every literal here is a valid `@opencode-ai/ui/icon` name, so the component
 * assigns it to `Icon` with no cast.
 */
export type LedgerStatusIcon =
  | "plus"
  | "edit-small-2"
  | "trash"
  | "arrow-undo-down"
  | "warning"
  | "circle-ban-sign"
  | "glasses"
  | "dash"
  | "help"

export type LedgerStatusInput = {
  operation?: string
  outcome?: string
  netState?: string
  evidenceState?: string
}

export type LedgerStatusDescriptor = {
  kind: LedgerStatusKind
  label: string
  icon: LedgerStatusIcon
  tone: LedgerStatusTone
  accessibleName: string
}

// Each state pairs a distinct text label with a distinct icon glyph, so the
// status is legible in both themes without depending on color.
const STATUS_PRESENTATION: Record<LedgerStatusKind, { label: string; icon: LedgerStatusIcon; tone: LedgerStatusTone }> = {
  added: { label: "Added", icon: "plus", tone: "success" },
  modified: { label: "Modified", icon: "edit-small-2", tone: "neutral" },
  deleted: { label: "Deleted", icon: "trash", tone: "danger" },
  reverted: { label: "Reverted", icon: "arrow-undo-down", tone: "neutral" },
  conflicted: { label: "Conflicted", icon: "warning", tone: "danger" },
  unavailable: { label: "Unavailable", icon: "circle-ban-sign", tone: "warning" },
  opaque: { label: "Opaque", icon: "glasses", tone: "warning" },
  partial: { label: "Partial", icon: "dash", tone: "warning" },
  unknown: { label: "Unknown", icon: "help", tone: "warning" },
}

export function describeLedgerStatus(input: LedgerStatusInput): LedgerStatusDescriptor {
  const kind = statusKind(input)
  const presentation = STATUS_PRESENTATION[kind]
  const accessibleName = `${presentation.label}. Execution ${input.outcome ?? "unknown"}. Assessment ${
    input.netState ?? "none"
  }. Evidence ${input.evidenceState ?? "unavailable"}.`
  return { kind, label: presentation.label, icon: presentation.icon, tone: presentation.tone, accessibleName }
}

// Precedence (amicode#1082 deliberation): the immutable execution outcome is
// always reflected; the latest assessment supplies net + evidence; an
// unavailable *assessment* never hides the execution fact (only netState
// "unavailable" selects that kind — an unavailable evidence bit does not).
function statusKind(input: LedgerStatusInput): LedgerStatusKind {
  if (input.outcome === "partial") return "partial"
  if (input.netState === "conflicted" || input.outcome === "conflicted") return "conflicted"
  if (input.netState === "unavailable") return "unavailable"
  if (input.netState === "opaque" || (!input.netState && input.outcome === "opaque")) return "opaque"
  if (input.netState === "added") return "added"
  if (input.netState === "modified") return "modified"
  if (input.netState === "deleted") return "deleted"
  if (input.netState === "reverted") return "reverted"
  const operation = (input.operation ?? "").toLowerCase()
  if (operation.includes("delete") || operation.includes("trash") || operation.includes("remove")) return "deleted"
  if (operation.includes("create") || operation.includes("add")) return "added"
  if (operation.includes("revert") || operation.includes("restore")) return "reverted"
  return "modified"
}

// --- The view model -----------------------------------------------------------

export type LedgerAssessmentEntry = {
  revision: number
  confidence?: string
  netState?: string
  evidenceState?: string
  expiresAt?: number
  timeCreated?: number
}

export type LedgerHistoryEntry = {
  receiptID: string
  sequence: number
  operation?: string
  outcome?: string
  origin?: string
  resource?: string
  timeCreated?: number
  assessments: LedgerAssessmentEntry[]
}

export type LedgerResourceRow = {
  id: string
  displayPath: string
  aliases: string[]
  status: LedgerStatusDescriptor
  origins: string[]
  sources: string[]
  receiptCount: number
  evidenceState?: string
  history: LedgerHistoryEntry[]
}

export type LedgerUnknownItem = {
  receiptID: string
  sequence: number
  operation?: string
  outcome?: string
  origin?: string
  timeCreated?: number
}

export type LedgerView = {
  capability: LedgerCapabilityLabel
  resources: LedgerResourceRow[]
  unknown: LedgerUnknownItem[]
  page: { size: number; cursor: number; nextCursor?: number; total: number }
}

export type LedgerViewInput = {
  capability: { mode: LedgerCapabilityMode }
  records: readonly LedgerProjectionRecord[]
  page?: { size?: number; cursor?: number }
}

const DEFAULT_PAGE_SIZE = 50

export function buildLedgerView(input: LedgerViewInput): LedgerView {
  const facts = collectFacts(input.records)
  const rows = buildRows(facts).sort(byLatestAssessmentThenId)
  const unknown = facts.unknown.slice().sort((a, b) => a.sequence - b.sequence)

  const size = input.page?.size ?? DEFAULT_PAGE_SIZE
  const cursor = input.page?.cursor ?? 0
  const total = rows.length
  const nextCursor = cursor + size < total ? cursor + size : undefined

  return {
    capability: ledgerCapabilityLabel(input.capability.mode),
    resources: rows.slice(cursor, cursor + size),
    unknown,
    page: { size, cursor, nextCursor, total },
  }
}

/** Independently pages an expanded resource's receipt history (deliberation). */
export function pageReceiptHistory(row: LedgerResourceRow, input: { cursor?: number; limit: number }) {
  const cursor = input.cursor ?? 0
  const entries = row.history.slice(cursor, cursor + input.limit)
  const nextCursor = cursor + input.limit < row.history.length ? cursor + input.limit : undefined
  return { entries, nextCursor }
}

type CollectedFact = {
  fact: LedgerProjectionReceipt
  origin?: string
  session?: string
  resourceKey?: string
}

// First-seen wins for a receipt id: an immutable execution fact is never
// rewritten by a later record carrying the same id (amicode#1082 AC3).
function collectFacts(records: readonly LedgerProjectionRecord[]) {
  const receipts = new Map<string, CollectedFact>()
  const order: string[] = []
  const assessments = new Map<string, Map<number, LedgerAssessmentEntry>>()

  for (const rec of records) {
    const id = rec.receipt?.id
    if (id && !receipts.has(id)) {
      receipts.set(id, {
        fact: rec.receipt!,
        origin: rec.operation?.origin,
        session: rec.operation?.session,
        resourceKey: rec.resourceKey,
      })
      order.push(id)
    }
    const assessment = rec.assessment
    if (assessment?.receiptID) {
      const revisions = assessments.get(assessment.receiptID) ?? new Map<number, LedgerAssessmentEntry>()
      const revision = assessment.revision ?? 1
      if (!revisions.has(revision))
        revisions.set(revision, {
          revision,
          confidence: assessment.confidence,
          netState: assessment.netState,
          evidenceState: assessment.evidenceState,
          expiresAt: assessment.expiresAt,
          timeCreated: assessment.timeCreated,
        })
      assessments.set(assessment.receiptID, revisions)
    }
  }

  const known: string[] = []
  const unknown: LedgerUnknownItem[] = []
  for (const id of order) {
    const entry = receipts.get(id)!
    // A receipt with no resource identity is an Unknown Mutation Receipt — an
    // uncertainty item, never a fabricated resource row (amicode#1082 AC4).
    if (!entry.fact.resource) {
      unknown.push({
        receiptID: id,
        sequence: entry.fact.sequence ?? 0,
        operation: entry.fact.operation,
        outcome: entry.fact.outcome,
        origin: entry.origin,
        timeCreated: entry.fact.timeCreated,
      })
      continue
    }
    known.push(id)
  }

  return { receipts, known, unknown, assessments }
}

function buildRows(facts: ReturnType<typeof collectFacts>): LedgerResourceRow[] {
  const groups = new Map<string, string[]>()
  const groupOrder: string[] = []
  for (const id of facts.known) {
    const entry = facts.receipts.get(id)!
    const key = entry.resourceKey ?? entry.fact.resource!
    if (!groups.has(key)) {
      groups.set(key, [])
      groupOrder.push(key)
    }
    groups.get(key)!.push(id)
  }

  return groupOrder.map((key) => {
    const ids = groups
      .get(key)!
      .slice()
      .sort((a, b) => sequenceOf(facts, a) - sequenceOf(facts, b))
    const history: LedgerHistoryEntry[] = ids.map((id) => {
      const entry = facts.receipts.get(id)!
      const revisions = [...(facts.assessments.get(id)?.values() ?? [])].sort((a, b) => a.revision - b.revision)
      return {
        receiptID: id,
        sequence: entry.fact.sequence ?? 0,
        operation: entry.fact.operation,
        outcome: entry.fact.outcome,
        origin: entry.origin,
        resource: entry.fact.resource,
        timeCreated: entry.fact.timeCreated,
        assessments: revisions,
      }
    })

    const latest = history[history.length - 1]
    const displayPath = latest.resource ?? ""
    const finalAssessment = latestAssessment(history)
    return {
      id: key,
      displayPath,
      aliases: distinct(history.map((entry) => entry.resource).filter((path): path is string => !!path && path !== displayPath)),
      status: describeLedgerStatus({
        operation: latest.operation,
        outcome: latest.outcome,
        netState: finalAssessment?.netState,
        evidenceState: finalAssessment?.evidenceState,
      }),
      origins: distinct(history.map((entry) => entry.origin).filter((origin): origin is string => !!origin)),
      sources: distinct(ids.map((id) => facts.receipts.get(id)!.session).filter((session): session is string => !!session)),
      receiptCount: ids.length,
      evidenceState: finalAssessment?.evidenceState,
      history,
    }
  })
}

// The final assessment is the one on the highest-sequence receipt, at its
// highest revision — the current net + evidence state for the resource.
function latestAssessment(history: LedgerHistoryEntry[]): LedgerAssessmentEntry | undefined {
  let winner: LedgerAssessmentEntry | undefined
  let winnerSequence = -1
  let winnerRevision = -1
  for (const entry of history)
    for (const assessment of entry.assessments)
      if (entry.sequence > winnerSequence || (entry.sequence === winnerSequence && assessment.revision > winnerRevision)) {
        winner = assessment
        winnerSequence = entry.sequence
        winnerRevision = assessment.revision
      }
  return winner
}

// Sort resources by latest assessment revision (most-reassessed first), then by
// stable resource id (amicode#1082 deliberation).
function byLatestAssessmentThenId(a: LedgerResourceRow, b: LedgerResourceRow): number {
  const revisionDelta = maxRevision(b) - maxRevision(a)
  if (revisionDelta !== 0) return revisionDelta
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function maxRevision(row: LedgerResourceRow): number {
  let max = 0
  for (const entry of row.history) for (const assessment of entry.assessments) max = Math.max(max, assessment.revision)
  return max
}

function sequenceOf(facts: ReturnType<typeof collectFacts>, id: string): number {
  return facts.receipts.get(id)!.fact.sequence ?? 0
}

function distinct(values: string[]): string[] {
  return [...new Set(values)]
}

// --- Keyboard operation (amicode#1082 AC8) ------------------------------------

export type LedgerKeyContext = {
  focusKind: "row" | "content"
  id: string
  expanded: boolean
}

export type LedgerKeyAction =
  | { type: "toggle"; id: string }
  | { type: "collapse"; id: string; refocus: string }
  | { type: "none" }

// Enter or Space on a resource row toggles it; Escape collapses an expanded
// resource and returns focus to its row. Tab order is native DOM order (the
// component renders filters, rows, continuations, and unknown items in reading
// order), so it needs no reducer here.
export function applyLedgerKeyDown(
  event: { key: string; preventDefault: () => void },
  context: LedgerKeyContext,
): LedgerKeyAction {
  if (context.focusKind === "row" && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault()
    return { type: "toggle", id: context.id }
  }
  if (event.key === "Escape" && context.expanded) {
    event.preventDefault()
    return { type: "collapse", id: context.id, refocus: context.id }
  }
  return { type: "none" }
}
