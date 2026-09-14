import { SessionMutation } from "./mutation"
import type { SessionLineage } from "./lineage"

/**
 * The deterministic gate-migration + coordinated-release surface (amicode#1083).
 *
 * Two concerns, kept separate by design (Key Decision: compatibility discovery
 * is separate from mutation-context validation):
 *
 *  1. **Compatibility discovery** — a versioned {@link SessionRollout.Capability}
 *     ({@link SessionRollout.Capability.discover}) and the mixed-version
 *     {@link SessionRollout.Matrix} resolver. Both are pure functions: they read
 *     engine support, client generation, and the session root's persisted mode,
 *     and NEVER probe a mutation route.
 *  2. **Release readiness** — {@link SessionRollout.Release} parses a release
 *     manifest and computes a machine-readable all-required-passed verdict. It
 *     only READS a manifest and reports; it performs NO release act, and default
 *     enablement always stays `off` (the flip is a human gate, out of this code).
 *
 * This module never tags a fork, pins a binary, publishes an extension, runs
 * overlay sync, or flips default-enablement on — those are human-only acts.
 */
export namespace SessionRollout {
  /** Reuse the #1077 mutation-registry generation as the rollout protocol version — one source of truth, no parallel constant. */
  export const PROTOCOL_VERSION = SessionMutation.Registry.version

  /** The three lineage modes, reused verbatim from the #972 lineage surface. */
  export type Mode = SessionLineage.Mode

  /**
   * Where a session sits relative to the ledger migration.
   *  - `none`       — a full-native root born after rollout; nothing to migrate.
   *  - `epoch`      — an explicit opted-in post-upgrade epoch (partial mode).
   *  - `unmigrated` — a legacy session that never opened an epoch.
   */
  export type MigrationBoundary =
    | { kind: "none" }
    | { kind: "epoch"; startedAt: number }
    | { kind: "unmigrated" }

  /** The versioned discovery object. */
  export type Capability = {
    protocol_version: number
    mode: Mode
    migration_boundary: MigrationBoundary
  }

  const legacyCapability = (protocolVersion: number): Capability => ({
    protocol_version: protocolVersion,
    mode: "legacy",
    migration_boundary: { kind: "unmigrated" },
  })

  /**
   * Compatibility discovery for a NEW client. Deterministic and route-free: it
   * decides full / partial / legacy from the engine's advertised support and the
   * session root's persisted mode + epoch marker only. It never probes, writes,
   * or touches the filesystem.
   *
   *  - Unsupported (old) engine → legacy, whatever the root.
   *  - Supported engine + full root → full (unless `fullDiscoveryEnabled` is off).
   *  - Supported engine + partial root WITH an epoch marker → partial.
   *  - Everything else (legacy root, or a partial root with no epoch) → legacy.
   *    A partial mode is never inferred without an explicit epoch boundary.
   *
   * `fullDiscoveryEnabled` (default true) is the rollback gate: with it off, a
   * full root downgrades to legacy so a partially-torn-down release can never
   * authorize a full-provenance mutation.
   */
  export namespace Capability {
    export function discover(input: {
      supported: readonly number[]
      requested: number
      root: { mode: Mode; epochStartedAt?: number }
      fullDiscoveryEnabled?: boolean
    }): Capability {
      const fullEnabled = input.fullDiscoveryEnabled ?? true
      if (!input.supported.includes(input.requested)) return legacyCapability(input.requested)
      if (input.root.mode === "full")
        return fullEnabled
          ? { protocol_version: input.requested, mode: "full", migration_boundary: { kind: "none" } }
          : legacyCapability(input.requested)
      if (input.root.mode === "partial" && input.root.epochStartedAt !== undefined)
        return {
          protocol_version: input.requested,
          mode: "partial",
          migration_boundary: { kind: "epoch", startedAt: input.root.epochStartedAt },
        }
      return legacyCapability(input.requested)
    }
  }

  export type Client = "new" | "old"
  export type EngineSupport = { supported: readonly number[]; requested: number }
  export type MatrixLabel = "full" | "partial" | "legacy" | "pre_ledger"
  export type MatrixOutcome = Capability & { label: MatrixLabel }

  /**
   * The supported mixed-version matrix. Every outcome is visibly labelled and
   * only the true full case ever claims full provenance.
   *
   *  - old engine + new client → legacy (label `legacy`).
   *  - new engine + old client → the old client keeps its pre-ledger view; mode
   *    is legacy (never a ledger mode) and label `pre_ledger` makes it visible.
   *  - new engine + new client → delegates to {@link Capability.discover}: full
   *    for a full root, otherwise labelled partial / legacy.
   */
  export namespace Matrix {
    export function resolve(input: {
      engine: EngineSupport
      client: Client
      root: { mode: Mode; epochStartedAt?: number }
    }): MatrixOutcome {
      // An old client does not speak the ledger protocol: it retains its
      // pre-ledger view regardless of the engine, and never claims a ledger mode.
      if (input.client === "old") return { ...legacyCapability(input.engine.requested), label: "pre_ledger" }
      const cap = Capability.discover({ supported: input.engine.supported, requested: input.engine.requested, root: input.root })
      const label: MatrixLabel = cap.mode === "full" ? "full" : cap.mode === "partial" ? "partial" : "legacy"
      return { ...cap, label }
    }
  }

  /**
   * Migration transitions. The ONLY path off legacy is an explicit epoch start;
   * there is deliberately no infer/backfill function — a partial epoch is never
   * derived by background inference.
   */
  export namespace Migration {
    export type StartResult =
      | { kind: "started"; mode: "partial"; migration_boundary: { kind: "epoch"; startedAt: number } }
      | { kind: "rejected"; reason: string }

    export function startEpoch(input: { current: Mode; boundary: number }): StartResult {
      if (input.current !== "legacy")
        return { kind: "rejected", reason: `only a legacy session may open a post-upgrade epoch (current: ${input.current})` }
      return { kind: "started", mode: "partial", migration_boundary: { kind: "epoch", startedAt: input.boundary } }
    }
  }

  /** The generation at which ledger provenance begins; v1 (=1) reservations pre-date it. */
  export const LEDGER_GENERATION = 2

  export type ReservationResult =
    | { kind: "legacy"; label: "legacy" }
    | { kind: "ledger"; generation: number }

  /**
   * Resolve an in-flight reservation. A v1 (pre-ledger) reservation — any
   * generation before {@link LEDGER_GENERATION} — resolves as a legacy result
   * and is never silently adopted into a ledger operation.
   */
  export function resolveReservation(input: {
    reservation: { generation: number }
    ledgerGeneration?: number
  }): ReservationResult {
    const ledgerGeneration = input.ledgerGeneration ?? LEDGER_GENERATION
    if (input.reservation.generation < ledgerGeneration) return { kind: "legacy", label: "legacy" }
    return { kind: "ledger", generation: input.reservation.generation }
  }

  /**
   * Rollback safety. The danger during a rollback is a window where full
   * discovery is still live but the client mutation routes are already gone: a
   * full capability would then authorize a mutation with no route to honor it —
   * an uncontextualized full-provenance mutation. The correct rollback disables
   * full discovery FIRST, then withdraws client routes.
   */
  export namespace Rollback {
    export type State = { fullDiscovery: boolean; clientRoutes: boolean }

    export function unsafe(state: State): boolean {
      return state.fullDiscovery && !state.clientRoutes
    }

    /** The correct teardown sequence: disable full discovery before withdrawing client routes. */
    export function plan(): State[] {
      return [
        { fullDiscovery: true, clientRoutes: true },
        { fullDiscovery: false, clientRoutes: true },
        { fullDiscovery: false, clientRoutes: false },
      ]
    }
  }

  /**
   * The release manifest schema/parsing and the machine-readable
   * all-required-passed gate evaluator. Pure data/validation: it reads a
   * manifest and computes readiness. It performs NO release act, and default
   * enablement always stays `off`.
   */
  export namespace Release {
    export type Gate = { id: string; required: boolean; passed: boolean }
    export type Completion = { forkAt: number; binaryPinAt: number; extensionAt: number }
    export type Manifest = {
      forkTag: string
      binaryChecksums: Record<string, string>
      lockPin: string
      extensionVersion: string
      overlayProvenance: { verified: boolean }
      rehearsalCaseIDs: readonly string[]
      matrixCaseIDs: readonly string[]
      completion: Completion
      gates: readonly Gate[]
    }

    export type ParseResult = { ok: true; manifest: Manifest } | { ok: false; errors: string[] }

    const isObject = (value: unknown): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && !Array.isArray(value)

    const isStringArray = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every((entry) => typeof entry === "string")

    export function parse(input: unknown): ParseResult {
      const errors: string[] = []
      if (!isObject(input)) return { ok: false, errors: ["manifest must be an object"] }

      if (typeof input.forkTag !== "string" || input.forkTag.length === 0) errors.push("forkTag must be a non-empty string")
      if (
        !isObject(input.binaryChecksums) ||
        !Object.values(input.binaryChecksums).every((entry) => typeof entry === "string")
      )
        errors.push("binaryChecksums must be a record of platform → checksum strings")
      if (typeof input.lockPin !== "string" || input.lockPin.length === 0) errors.push("lockPin must be a non-empty string")
      if (typeof input.extensionVersion !== "string" || input.extensionVersion.length === 0)
        errors.push("extensionVersion must be a non-empty string")
      if (!isObject(input.overlayProvenance) || typeof input.overlayProvenance.verified !== "boolean")
        errors.push("overlayProvenance.verified must be a boolean")
      if (!isStringArray(input.rehearsalCaseIDs)) errors.push("rehearsalCaseIDs must be an array of strings")
      if (!isStringArray(input.matrixCaseIDs)) errors.push("matrixCaseIDs must be an array of strings")
      if (
        !isObject(input.completion) ||
        typeof input.completion.forkAt !== "number" ||
        typeof input.completion.binaryPinAt !== "number" ||
        typeof input.completion.extensionAt !== "number"
      )
        errors.push("completion must carry numeric forkAt, binaryPinAt, and extensionAt")
      if (
        !Array.isArray(input.gates) ||
        !input.gates.every(
          (gate) =>
            isObject(gate) &&
            typeof gate.id === "string" &&
            typeof gate.required === "boolean" &&
            typeof gate.passed === "boolean",
        )
      )
        errors.push("gates must be an array of {id, required, passed}")

      if (errors.length > 0) return { ok: false, errors }

      const raw = input as Record<string, unknown>
      return {
        ok: true,
        manifest: {
          forkTag: raw.forkTag as string,
          binaryChecksums: raw.binaryChecksums as Record<string, string>,
          lockPin: raw.lockPin as string,
          extensionVersion: raw.extensionVersion as string,
          overlayProvenance: { verified: (raw.overlayProvenance as { verified: boolean }).verified },
          rehearsalCaseIDs: raw.rehearsalCaseIDs as string[],
          matrixCaseIDs: raw.matrixCaseIDs as string[],
          completion: raw.completion as Completion,
          gates: raw.gates as Gate[],
        },
      }
    }

    /**
     * Readiness verdict. `defaultEnablement` is ALWAYS `off`: this evaluator
     * reports readiness only — flipping enablement on is a human gate that lives
     * outside this code (AC7). `ready` is true iff every required field, every
     * mandatory rehearsal/matrix case, and every required gate is satisfied.
     */
    export type Readiness = {
      ready: boolean
      defaultEnablement: "off"
      missing: string[]
    }

    export function evaluate(
      manifest: Manifest,
      mandatory: { rehearsalCaseIDs: readonly string[]; matrixCaseIDs: readonly string[] },
    ): Readiness {
      const missing: string[] = []

      if (manifest.forkTag.length === 0) missing.push("fork tag is empty")
      if (Object.keys(manifest.binaryChecksums).length === 0) missing.push("binary checksums are empty")
      else if (Object.values(manifest.binaryChecksums).some((entry) => entry.length === 0))
        missing.push("a binary checksum is empty")
      if (manifest.lockPin.length === 0) missing.push("lock pin is empty")
      if (manifest.extensionVersion.length === 0) missing.push("extension version is empty")
      if (!manifest.overlayProvenance.verified) missing.push("overlay provenance is not verified")

      for (const id of mandatory.rehearsalCaseIDs)
        if (!manifest.rehearsalCaseIDs.includes(id)) missing.push(`mandatory rehearsal case missing: ${id}`)
      for (const id of mandatory.matrixCaseIDs)
        if (!manifest.matrixCaseIDs.includes(id)) missing.push(`mandatory matrix case missing: ${id}`)

      for (const gate of manifest.gates)
        if (gate.required && !gate.passed) missing.push(`required gate failed: ${gate.id}`)

      return { ready: missing.length === 0, defaultEnablement: "off", missing }
    }

    /**
     * The release-ordering evaluator: fork release completes before the verified
     * binary pin, which completes before the extension release. Reads the
     * manifest's declared completion order — it does NOT perform any release act.
     */
    export function orderingSatisfied(manifest: Manifest): boolean {
      const { forkAt, binaryPinAt, extensionAt } = manifest.completion
      return forkAt < binaryPinAt && binaryPinAt < extensionAt
    }
  }
}
