export * as ProvenanceMatrix from "./provenance-matrix"

import { type Boundary, type Field } from "./session-receipt"

/**
 * The adversarial full-provenance matrix (amicode#1084) — the release GATE.
 *
 * This is the versioned manifest of case IDs (the deliberation resolution): each
 * row declares its fixture, setup, trigger, expected authorization decision,
 * expected receipts/assessments, permitted display-safe fields, prohibited egress
 * fields, cleanup, and required mode. A case is COVERED only when its row runs and
 * produces its declared observable result — the E2E fixtures in the opencode
 * (engine) and app (ui) harnesses run each row against the REAL session-lineage,
 * mutation, receipt, privacy, and view-model contracts.
 *
 * The gate ({@link gate}) consumes the manifest and a set of green case IDs and
 * emits `all_required_passed` ONLY when every required case is green. Product-denied
 * outcomes are asserted expected results (their rows carry
 * `expectedAuthorization: "denied"`), never failed tests. The gate NEVER flips
 * default enablement — that flip is a human-only release act, so
 * `defaultEnablement` is always `"off"` (AC8). This module composes with the #1083
 * `SessionRollout.Release` evaluator: {@link requiredCaseIDs} is the mandatory
 * matrix-case set that evaluator checks.
 *
 * This module is pure data + logic. It lives in `@opencode-ai/schema` — the one
 * package BOTH the opencode engine and the app frontend depend on — so a single
 * versioned manifest is the shared source of truth across every harness.
 */

/** The matrix version. Bump on any row-schema or required-set change. */
export const VERSION = 1

// ── Enumerated dimensions (the AC coverage axes) ────────────────────────────

/** Mutation origins (AC1). `opaque` = a shell / mcp / custom-tool / cli action with no ledger identity. */
export const Origins = ["agent", "child_agent", "user", "system", "opaque"] as const
export type Origin = (typeof Origins)[number]

/** Lineage modes (AC1 / AC6). */
export const Modes = ["full", "partial", "legacy"] as const
export type Mode = (typeof Modes)[number]

/** Filesystem resource classes (AC2). */
export const ResourceClasses = [
  "workspace",
  "non_git_external",
  "external_repo",
  "internal",
  "binary",
  "artifact",
  "directory",
  "trash",
  "restore",
  "symlink",
  "alias",
  "unsupported_provider",
] as const
export type ResourceClass = (typeof ResourceClasses)[number]

/** Observable mutation outcomes (AC3). */
export const Outcomes = [
  "success",
  "denied",
  "failed",
  "aborted",
  "partial",
  "conflict",
  "unavailable",
  "opaque",
  "quota",
  "expiry",
] as const
export type Outcome = (typeof Outcomes)[number]

/**
 * The egress boundaries that must never carry capability, evidence, or protected
 * metadata (AC5). A subset of the receipt {@link Boundary} union — `files_changed`,
 * `session_metadata`, and the authenticated `external_detail` gate are excluded
 * because they are not the disallowed-egress surfaces this AC guards.
 */
export const EgressBoundaries = ["browser", "transcript", "share", "export", "telemetry", "log", "error"] as const
export type EgressBoundary = (typeof EgressBoundaries)[number] & Boundary

/** Aggregation / version concerns (AC6). */
export const VersionConcerns = [
  "task_aggregation",
  "spawn_aggregation",
  "fork_separation",
  "child_archival",
  "child_deletion",
  "legacy_session",
  "upgrade_epoch",
  "mixed_binaries",
  "rollback",
] as const
export type VersionConcern = (typeof VersionConcerns)[number]

/** The AC group a row belongs to. */
export const Dimensions = [
  "origin",
  "resource",
  "outcome",
  "concurrency",
  "privacy",
  "version",
  "accessibility",
] as const
export type Dimension = (typeof Dimensions)[number]

/** Which harness process runs the row. `engine` = opencode session contracts; `ui` = the app view model. */
export type Harness = "engine" | "ui"

/** The expected authorization decision a row declares. `denied` is an expected result, not a failure. */
export type Authorization = "authorized" | "denied" | "not_applicable"

/** One prohibited egress: a receipt field that must NOT cross a boundary (AC5). */
export type ProhibitedEgress = { field: Field; boundary: EgressBoundary }

/** One matrix row — the full case declaration (deliberation resolution). */
export type Row = {
  /** Stable case ID (the manifest is a manifest of these). */
  id: string
  /** Which AC group. */
  dimension: Dimension
  /** Which harness runs the row. */
  harness: Harness
  /** Required for release readiness. A required case must be green for `all_required_passed`. */
  required: boolean
  /** The lineage mode the case runs in (AC1 / AC6). */
  requiredMode: Mode
  /** The mutation origin exercised (origin rows). */
  origin?: Origin
  /** The filesystem resource class exercised (resource rows). */
  resourceClass?: ResourceClass
  /** The declared observable outcome (outcome rows). */
  expectedOutcome?: Outcome
  /** The aggregation / version concern (version rows). */
  concern?: VersionConcern
  /** The expected authorization decision. */
  expectedAuthorization: Authorization
  /** The isolated fixture — a temp root, sandboxed dir, contained symlink, disposable trash, or in-memory projection. Never a real user directory. */
  fixture: string
  /** Setup steps performed before the trigger. */
  setup: string
  /** The trigger that produces the observable result. */
  trigger: string
  /** The declared observable result — the receipts and assessments the case must produce. */
  expectation: string
  /** Fields the case may surface on the display-safe (Files Changed / browser) projection. */
  permittedDisplaySafeFields: readonly Field[]
  /** Fields that must NOT cross the named egress boundary (AC5). */
  prohibitedEgress: readonly ProhibitedEgress[]
  /** Cleanup + post-run containment assertion. */
  cleanup: string
}

export type Manifest = { version: number; cases: readonly Row[] }

// ── Field groupings used by the display/egress declarations ─────────────────

/** The full display-safe set the Files Changed / browser projection may surface. */
const DISPLAY_SAFE_FIELDS: readonly Field[] = [
  "operation.origin",
  "operation.state",
  "receipt.id",
  "receipt.sequence",
  "receipt.resource",
  "receipt.operation",
  "receipt.outcome",
  "receipt.timeCreated",
  "assessment.receiptID",
  "assessment.confidence",
  "assessment.netState",
  "assessment.evidenceState",
  "assessment.revision",
  "assessment.expiresAt",
  "assessment.timeCreated",
  "evidence.receiptID",
  "derived.additions",
  "derived.deletions",
]

/** Capability + evidence + protected metadata — must never cross an egress boundary (AC5). */
const PROTECTED_FIELDS: readonly Field[] = [
  "context.capability", // capability
  "evidence.content", // evidence bytes
  "operation.id", // protected metadata
  "operation.rootID",
  "operation.sessionID",
  "assessment.id",
  "context.canonicalPath",
  "context.rawHash",
  "context.baseline",
  "context.redactionDecision",
]

// ── The manifest rows, by dimension ─────────────────────────────────────────

const originRows: Row[] = Origins.flatMap((origin) =>
  Modes.map((mode): Row => {
    const opaque = origin === "opaque"
    return {
      id: `origin:${origin}:${mode}`,
      dimension: "origin",
      harness: "engine",
      required: true,
      requiredMode: mode,
      origin,
      // An opaque origin never authorizes a ledger route; a legacy-mode display shows the pre-ledger view.
      expectedAuthorization: opaque ? "not_applicable" : "authorized",
      fixture: `In-memory mutation context + host receipt for a ${origin} origin in ${mode} mode (isolated, no filesystem).`,
      setup: `Issue a mutation context for origin=${origin} against a ${mode}-mode root; build the host receipt with that origin.`,
      trigger:
        opaque
          ? `Execute the opaque route for the ${origin} origin.`
          : `Execute the ledger route and project the receipt at the capability-selected ${mode} view.`,
      expectation:
        mode === "legacy"
          ? `The ${origin} origin resolves to the pre-ledger (legacy) projection — no full-provenance claim.`
          : opaque
            ? `The ${origin} action yields an unknown-mutation receipt (no fabricated resource), attributed to origin=${origin}.`
            : `A ledger receipt carries origin=${origin} on the display-safe projection and is attributed to the active root.`,
      permittedDisplaySafeFields: mode === "legacy" ? [] : DISPLAY_SAFE_FIELDS,
      prohibitedEgress: [],
      cleanup: "Contexts and receipts are in-memory; the operation store is discarded with the test scope.",
    }
  }),
)

const RESOURCE_META: Record<ResourceClass, { authorization: Authorization; outcome: Outcome; expectation: string }> = {
  workspace: { authorization: "authorized", outcome: "success", expectation: "A workspace file resolves to a stable physical identity and records a ledger receipt." },
  non_git_external: { authorization: "authorized", outcome: "success", expectation: "A sandboxed non-Git external file is assessed via host-local external-diff; the patch never crosses." },
  external_repo: { authorization: "authorized", outcome: "success", expectation: "A file in a separate sandboxed Git repo resolves to its own identity and is assessed independently." },
  internal: { authorization: "not_applicable", outcome: "success", expectation: "An internal (out-of-scope) store is never a ledger route — no session receipt is produced." },
  binary: { authorization: "authorized", outcome: "success", expectation: "A binary file records a metadata-only receipt; its bytes stay host-local and never reach display." },
  artifact: { authorization: "authorized", outcome: "success", expectation: "A generated artifact records a ledger receipt; the artifact bytes are host-local evidence only." },
  directory: { authorization: "authorized", outcome: "success", expectation: "A directory endpoint resolves with kind=directory and records an implicit-parent receipt." },
  trash: { authorization: "authorized", outcome: "success", expectation: "A move-to-trash records a delete receipt; the disposable trash fixture holds the removed file." },
  restore: { authorization: "authorized", outcome: "success", expectation: "A restore-from-trash records a revert/restore receipt as the file reappears at its identity." },
  symlink: { authorization: "authorized", outcome: "success", expectation: "A symlink binds the SAME physical identity as its target — the path is discarded before the context." },
  alias: { authorization: "authorized", outcome: "success", expectation: "A hardlink alias binds the SAME identity as its target — aliases and symlinks resolve to one resource." },
  unsupported_provider: { authorization: "denied", outcome: "denied", expectation: "A provider lacking safe-resolve / no-follow-write is DENIED (unsafe_provider) — an expected product-denied result." },
}

const resourceRows: Row[] = ResourceClasses.map((cls): Row => {
  const meta = RESOURCE_META[cls]
  return {
    id: `resource:${cls}`,
    dimension: "resource",
    harness: "engine",
    required: true,
    requiredMode: "full",
    resourceClass: cls,
    expectedOutcome: meta.outcome,
    expectedAuthorization: meta.authorization,
    fixture: `Isolated temp root / sandboxed external dir for a ${cls} resource (contained symlink/alias, disposable trash — never a real user directory).`,
    setup: `Create the ${cls} fixture under an isolated temporary root and register its baseline.`,
    trigger: `Resolve/assess the ${cls} resource through the mutation-identity and external-diff contracts.`,
    expectation: meta.expectation,
    permittedDisplaySafeFields: cls === "internal" ? [] : ["receipt.resource", "receipt.operation", "receipt.outcome"],
    prohibitedEgress: [],
    cleanup: "Remove the temp root; assert containment (every touched path stayed under the isolated fixture).",
  }
})

const OUTCOME_META: Record<Outcome, { authorization: Authorization; expectation: string }> = {
  success: { authorization: "authorized", expectation: "The mutation applies and records an applied receipt." },
  denied: { authorization: "denied", expectation: "A missing/invalid context is DENIED — an expected product-denied result, not a failure." },
  failed: { authorization: "authorized", expectation: "An identity mismatch during a group execute yields a failed group with not-started receipts." },
  aborted: { authorization: "not_applicable", expectation: "An aborted reservation releases root capacity and commits no receipt." },
  partial: { authorization: "authorized", expectation: "A group whose first resource applies and second fails yields a partial group." },
  conflict: { authorization: "denied", expectation: "A source identity that changed between issue and execute is DENIED (identity_changed) — a conflict." },
  unavailable: { authorization: "authorized", expectation: "A missing evidence sidecar reassesses the receipt as evidence unavailable, without a patch payload." },
  opaque: { authorization: "not_applicable", expectation: "An opaque action with no resources yields an unknown-mutation receipt." },
  quota: { authorization: "denied", expectation: "A recursive group over its resource budget is DENIED (resource_budget_exceeded) — a quota result." },
  expiry: { authorization: "denied", expectation: "An expired context is DENIED (expired_context) — an expiry result." },
}

const outcomeRows: Row[] = Outcomes.map((outcome): Row => {
  const meta = OUTCOME_META[outcome]
  return {
    id: `outcome:${outcome}`,
    dimension: "outcome",
    harness: "engine",
    required: true,
    requiredMode: "full",
    expectedOutcome: outcome,
    expectedAuthorization: meta.authorization,
    fixture: "In-memory mutation gate + isolated temp/database fixture; product-denied outcomes are expected results.",
    setup: `Drive the mutation/receipt contract into the ${outcome} condition.`,
    trigger: `Execute the operation that produces the ${outcome} outcome.`,
    expectation: meta.expectation,
    permittedDisplaySafeFields: ["receipt.outcome", "assessment.netState", "assessment.evidenceState"],
    prohibitedEgress: [],
    cleanup: "In-memory contexts discarded; database fixture torn down with the test scope.",
  }
})

const concurrencyRows: Row[] = [
  {
    id: "concurrency:non-attribution",
    dimension: "concurrency",
    harness: "engine",
    required: true,
    requiredMode: "full",
    expectedAuthorization: "authorized",
    fixture: "Two isolated lineage roots writing concurrently in an isolated database fixture.",
    setup: "Create two independent roots; publish receipts to each concurrently.",
    trigger: "Query the active root's committed receipts while an unrelated root is also writing.",
    expectation: "The active root's committed receipts contain ONLY its own operations — an unrelated writer is never attributed to it.",
    permittedDisplaySafeFields: ["operation.origin", "receipt.resource"],
    prohibitedEgress: [],
    cleanup: "Remove both roots; assert each root's receipt set is disjoint.",
  },
  {
    id: "concurrency:cross-root-context-denied",
    dimension: "concurrency",
    harness: "engine",
    required: true,
    requiredMode: "full",
    expectedAuthorization: "denied",
    fixture: "In-memory mutation gate with a root-scoped operation store.",
    setup: "Issue a context for root A; attempt to execute it while the session maps to root B.",
    trigger: "Execute a mutation whose session no longer resolves to the context's root.",
    expectation: "The cross-root execution is DENIED (invalid_context) — a context is bound to one root and never leaks across.",
    permittedDisplaySafeFields: [],
    prohibitedEgress: [],
    cleanup: "In-memory contexts discarded with the test scope.",
  },
]

const privacyRows: Row[] = EgressBoundaries.map((boundary): Row => ({
  id: `privacy:${boundary}`,
  dimension: "privacy",
  harness: "engine",
  required: true,
  requiredMode: "full",
  expectedAuthorization: "not_applicable",
  fixture: "In-memory host receipt carrying capability, evidence bytes, and protected metadata sentinels.",
  setup: "Build a host receipt with capability/evidence/protected-metadata sentinels, then project it at the boundary.",
  trigger: `Serialize the receipt at the ${boundary} egress boundary via the privacy projector.`,
  expectation: `The ${boundary} projection contains NO capability, evidence, or protected-metadata field — only display-safe / redacted values.`,
  permittedDisplaySafeFields: boundary === "browser" ? DISPLAY_SAFE_FIELDS : [],
  prohibitedEgress: PROTECTED_FIELDS.map((field) => ({ field, boundary })),
  cleanup: "In-memory receipt discarded; assert the serialized output contains none of the protected sentinels.",
}))

const VERSION_META: Record<VersionConcern, { mode: Mode; expectation: string }> = {
  task_aggregation: { mode: "full", expectation: "A task_spawn child aggregates under the parent root with a typed task_spawn edge." },
  spawn_aggregation: { mode: "full", expectation: "A session_spawn child aggregates under the parent root with a typed session_spawn edge." },
  fork_separation: { mode: "full", expectation: "A fork gets an independent root and inherits no lineage descendants." },
  child_archival: { mode: "full", expectation: "An archived child is hidden from the root's active descendants." },
  child_deletion: { mode: "full", expectation: "A deleted child retains only its root-owned origin projection — no private metadata is retained." },
  legacy_session: { mode: "legacy", expectation: "A session with no lineage row resolves to legacy mode with no descendants." },
  upgrade_epoch: { mode: "partial", expectation: "An explicit partial epoch tracks spawns after the boundary; pre-epoch history is never backfilled." },
  mixed_binaries: { mode: "legacy", expectation: "old-engine/new-client and new-engine/old-client both resolve to a visibly-labelled non-full view (never a false full claim)." },
  rollback: { mode: "full", expectation: "Rollback disables full discovery before withdrawing client routes — no uncontextualized full mutation window." },
}

const versionRows: Row[] = VersionConcerns.map((concern): Row => {
  const meta = VERSION_META[concern]
  return {
    id: `version:${concern}`,
    dimension: "version",
    harness: "engine",
    required: true,
    requiredMode: meta.mode,
    concern,
    expectedAuthorization: "not_applicable",
    fixture: "Isolated lineage database fixture + the deterministic rollout resolver (no release act performed).",
    setup: `Arrange the ${concern} lineage/version condition in an isolated fixture.`,
    trigger: `Resolve lineage / rollout for the ${concern} concern.`,
    expectation: meta.expectation,
    permittedDisplaySafeFields: [],
    prohibitedEgress: [],
    cleanup: "Remove the lineage roots; the rollout resolver is pure and mutates nothing.",
  }
})

const accessibilityRows: Row[] = [
  {
    id: "a11y:keyboard",
    dimension: "accessibility",
    harness: "ui",
    required: true,
    requiredMode: "full",
    expectedAuthorization: "not_applicable",
    fixture: "The pure lineage-ledger view-model reducer (no DOM, no theme dependency).",
    setup: "Focus a resource row / expanded content in the unified Files Changed surface.",
    trigger: "Keyboard operation: Enter/Space toggles a row; Escape collapses expanded content and refocuses the row.",
    expectation: "Every row is operable by keyboard — Enter/Space toggle, Escape collapses; unrelated keys are no-ops.",
    permittedDisplaySafeFields: [],
    prohibitedEgress: [],
    cleanup: "Pure reducer; nothing to clean up.",
  },
  {
    id: "a11y:themes",
    dimension: "accessibility",
    harness: "ui",
    required: true,
    requiredMode: "full",
    expectedAuthorization: "not_applicable",
    fixture: "The pure status descriptor + capability labels of the unified view-model (theme-independent by construction).",
    setup: "Build the status descriptor for every named state and the full/partial/legacy capability labels.",
    trigger: "Render legibility check across both supported themes.",
    expectation: "Each state is distinguishable by text + icon (never color alone) and the tone is a semantic keyword — legible in BOTH themes.",
    permittedDisplaySafeFields: [],
    prohibitedEgress: [],
    cleanup: "Pure descriptors; nothing to clean up.",
  },
]

/** The versioned adversarial full-provenance matrix. */
export const MANIFEST: Manifest = {
  version: VERSION,
  cases: [
    ...originRows,
    ...resourceRows,
    ...outcomeRows,
    ...concurrencyRows,
    ...privacyRows,
    ...versionRows,
    ...accessibilityRows,
  ],
}

// ── Selectors ────────────────────────────────────────────────────────────────

/** The required case IDs — the mandatory matrix-case set the #1083 release evaluator checks. */
export function requiredCaseIDs(manifest: Manifest = MANIFEST): string[] {
  return manifest.cases.filter((row) => row.required).map((row) => row.id)
}

/** Every case ID in the manifest. */
export function caseIDs(manifest: Manifest = MANIFEST): string[] {
  return manifest.cases.map((row) => row.id)
}

/** The sub-manifest a harness owns — used to run and gate one harness's boundary. */
export function subset(harness: Harness, manifest: Manifest = MANIFEST): Manifest {
  return { version: manifest.version, cases: manifest.cases.filter((row) => row.harness === harness) }
}

// ── The gate ─────────────────────────────────────────────────────────────────

export type GateResult = {
  /** True iff every required case in the manifest is in the green set. */
  all_required_passed: boolean
  /** Always `"off"` — the matrix reports readiness; flipping enablement is a human-only release act (AC8). */
  defaultEnablement: "off"
  /** Required case IDs that are not green (empty when `all_required_passed`). */
  missingRequired: string[]
  /** Totals for reporting. */
  total: number
  requiredTotal: number
  greenTotal: number
}

/**
 * Consume the manifest + the set of case IDs that RAN GREEN, and emit
 * `all_required_passed` only when every required case is green. Default enablement
 * always stays `off`. A product-denied case is green when it produced its declared
 * denial (its row is `expectedAuthorization: "denied"`), so its ID belongs in
 * `green` — the gate treats it exactly like any other required green result.
 */
export function gate(manifest: Manifest, green: ReadonlySet<string>): GateResult {
  const required = manifest.cases.filter((row) => row.required)
  const missingRequired = required.filter((row) => !green.has(row.id)).map((row) => row.id)
  return {
    all_required_passed: missingRequired.length === 0,
    defaultEnablement: "off",
    missingRequired,
    total: manifest.cases.length,
    requiredTotal: required.length,
    greenTotal: [...green].length,
  }
}

// ── Fail-closed coverage assertion ──────────────────────────────────────────

/**
 * Fails closed when the manifest does not COVER every required dimension
 * (AC1–AC7). Called at module load so a matrix that silently dropped a dimension
 * can never ship. Mirrors `SessionReceipt.assertExposureCoverage`.
 */
export function assertCoverage(manifest: Manifest): void {
  if (manifest.version <= 0) throw new Error("provenance matrix must be versioned (version > 0)")

  const ids = manifest.cases.map((row) => row.id)
  if (ids.some((id) => id.length === 0)) throw new Error("provenance matrix has an empty case id")
  if (new Set(ids).size !== ids.length) throw new Error("provenance matrix has duplicate case ids")

  const origins = manifest.cases.filter((row) => row.dimension === "origin")
  for (const origin of Origins)
    for (const mode of Modes)
      if (!origins.some((row) => row.origin === origin && row.requiredMode === mode))
        throw new Error(`provenance matrix missing origin coverage: ${origin} × ${mode}`)

  const resources = manifest.cases.filter((row) => row.dimension === "resource")
  for (const cls of ResourceClasses)
    if (!resources.some((row) => row.resourceClass === cls))
      throw new Error(`provenance matrix missing resource coverage: ${cls}`)

  const outcomes = manifest.cases.filter((row) => row.dimension === "outcome")
  for (const outcome of Outcomes)
    if (!outcomes.some((row) => row.expectedOutcome === outcome))
      throw new Error(`provenance matrix missing outcome coverage: ${outcome}`)

  if (!manifest.cases.some((row) => row.dimension === "concurrency"))
    throw new Error("provenance matrix missing concurrency coverage")

  const privacy = manifest.cases.filter((row) => row.dimension === "privacy")
  for (const boundary of EgressBoundaries) {
    const prohibited = privacy.flatMap((row) => row.prohibitedEgress.filter((p) => p.boundary === boundary).map((p) => p.field))
    if (!prohibited.includes("context.capability"))
      throw new Error(`provenance matrix missing capability egress guard at ${boundary}`)
    if (!prohibited.includes("evidence.content"))
      throw new Error(`provenance matrix missing evidence egress guard at ${boundary}`)
    if (!prohibited.some((field) => field.startsWith("operation.") || field.startsWith("context.") || field === "assessment.id"))
      throw new Error(`provenance matrix missing protected-metadata egress guard at ${boundary}`)
  }

  const versions = manifest.cases.filter((row) => row.dimension === "version")
  for (const concern of VersionConcerns)
    if (!versions.some((row) => row.concern === concern))
      throw new Error(`provenance matrix missing version coverage: ${concern}`)

  const accessibility = manifest.cases.filter((row) => row.dimension === "accessibility")
  if (accessibility.length < 2 || !accessibility.every((row) => row.harness === "ui"))
    throw new Error("provenance matrix missing keyboard + both-theme accessibility coverage on the ui harness")
}

assertCoverage(MANIFEST)
