import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import * as path from "path"
import { Global } from "@opencode-ai/core/global"
import { createTwoFilesPatch, diffLines } from "diff"

/**
 * Host-local, deliberately non-session storage for external preimages. The
 * manifest contains only digests and artifact names; generated patches never
 * cross this boundary and are reconstructed for an opted-in detail response.
 */
export namespace ExternalDiff {
  export type Assessment =
    | {
        reference: string
        file: string
        state: "changed"
        status: "added" | "modified" | "deleted"
        patch?: string
        additions: number
        deletions: number
      }
    | { reference: string; file: string; state: "unchanged" | "unavailable" }

  type Endpoint = { present: true; content: string } | { present: false }
  type Expected = { present: boolean; digest?: string }
  type Entry = {
    reference: string
    file: string
    baseline: Endpoint
    expected?: Expected
    revision: number
    unavailable?: boolean
    assessment?: Assessment
  }
  type PersistedEntry = Omit<Entry, "baseline" | "assessment"> & {
    baseline: { present: boolean; artifact?: string }
  }
  type Manifest = {
    version: 1
    generation: number
    entries: PersistedEntry[]
    leases?: string[]
  }
  type ReservedEndpoint = {
    reference: string
    file: string
    revision: number
    capability: string
    created: boolean
  }
  type Reservation = {
    id: string
    sessionID: string
    expiresAt: number
    endpoints: ReservedEndpoint[]
  }
  export type PreparedReservation = Pick<Reservation, "id" | "sessionID" | "expiresAt" | "endpoints">

  const entries = new Map<string, Map<string, Entry>>()
  const revisions = new Map<string, number>()
  const reservations = new Map<string, Reservation>()
  const hydrated = new Set<string>()
  const root = () => path.join(Global.Path.data, "external-diff")
  const sessionDir = (sessionID: string) => path.join(root(), encodeURIComponent(sessionID))
  const manifestFile = (sessionID: string) => path.join(sessionDir(sessionID), "manifest.json")
  const artifactFile = (sessionID: string, reference: string) =>
    path.join(sessionDir(sessionID), "artifacts", reference)
  const tombstoneFile = (sessionID: string) => path.join(root(), "tombstones", encodeURIComponent(sessionID))

  function canonical(file: string) {
    return path.resolve(file)
  }
  function digest(endpoint: Endpoint): Expected {
    return endpoint.present
      ? { present: true, digest: createHash("sha256").update(endpoint.content).digest("hex") }
      : { present: false }
  }
  function expectedMatches(expected: Expected, current: Endpoint) {
    const actual = digest(current)
    return expected.present === actual.present && expected.digest === actual.digest
  }
  function read(file: string): Endpoint | undefined {
    try {
      if (!existsSync(file)) return { present: false }
      return { present: true, content: readFileSync(file, "utf8") }
    } catch {
      return undefined
    }
  }
  function same(left: Endpoint, right: Endpoint) {
    return left.present === right.present && (!left.present || left.content === (right as { content: string }).content)
  }
  function readManifest(sessionID: string): Manifest | undefined {
    try {
      const parsed = JSON.parse(readFileSync(manifestFile(sessionID), "utf8"))
      if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return
      return parsed as Manifest
    } catch {
      return
    }
  }
  function tombstoned(sessionID: string) {
    return existsSync(tombstoneFile(sessionID))
  }
  function persist(sessionID: string, session: Map<string, Entry>, leases?: string[]) {
    if (tombstoned(sessionID)) return false
    mkdirSync(sessionDir(sessionID), { recursive: true })
    const previous = readManifest(sessionID)
    const manifest: Manifest = {
      version: 1,
      generation: (previous?.generation ?? 0) + 1,
      leases: leases?.length ? leases : undefined,
      entries: [...session.values()].map((entry) => ({
        reference: entry.reference,
        file: entry.file,
        expected: entry.expected,
        revision: entry.revision,
        unavailable: entry.unavailable,
        baseline: entry.baseline.present ? { present: true, artifact: entry.reference } : { present: false },
      })),
    }
    const target = manifestFile(sessionID)
    const temporary = `${target}.${crypto.randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(manifest))
    if (tombstoned(sessionID)) {
      rmSync(temporary, { force: true })
      return false
    }
    renameSync(temporary, target)
    return true
  }
  function writeArtifact(sessionID: string, entry: Entry) {
    if (!entry.baseline.present) return true
    if (tombstoned(sessionID)) return false
    const target = artifactFile(sessionID, entry.reference)
    mkdirSync(path.dirname(target), { recursive: true })
    const temporary = `${target}.${crypto.randomUUID()}.tmp`
    writeFileSync(temporary, entry.baseline.content)
    if (tombstoned(sessionID)) {
      rmSync(temporary, { force: true })
      return false
    }
    renameSync(temporary, target)
    if (!tombstoned(sessionID)) return true
    rmSync(target, { force: true })
    return false
  }
  function hydrate(sessionID: string) {
    // Startup and lazy rehydration repair interrupted artifact writes without
    // touching a directory protected by a manifest lease.
    sweep()
    if (hydrated.has(sessionID)) return
    hydrated.add(sessionID)
    if (tombstoned(sessionID)) return
    const manifest = readManifest(sessionID)
    if (!manifest) return
    const session = new Map<string, Entry>()
    for (const stored of manifest.entries) {
      let baseline: Endpoint = { present: false }
      let unavailable = stored.unavailable
      if (stored.baseline.present) {
        const artifact = stored.baseline.artifact && artifactFile(sessionID, stored.baseline.artifact)
        try {
          if (!artifact) throw new Error("missing artifact name")
          baseline = { present: true, content: readFileSync(artifact, "utf8") }
        } catch {
          unavailable = true
        }
      }
      session.set(stored.file, {
        reference: stored.reference,
        file: stored.file,
        baseline,
        expected: stored.expected,
        revision: stored.revision,
        unavailable,
      })
    }
    if (session.size) entries.set(sessionID, session)
  }
  function changed(entry: Entry, current: Endpoint, patch: boolean): Assessment {
    const baseline = entry.baseline.present ? entry.baseline.content : ""
    const content = current.present ? current.content : ""
    let additions = 0
    let deletions = 0
    for (const change of diffLines(baseline, content)) {
      if (change.added) additions += change.count || 0
      if (change.removed) deletions += change.count || 0
    }
    return {
      reference: entry.reference,
      file: entry.file,
      state: "changed",
      status: !entry.baseline.present ? "added" : !current.present ? "deleted" : "modified",
      ...(patch ? { patch: createTwoFilesPatch(entry.file, entry.file, baseline, content) } : {}),
      additions,
      deletions,
    }
  }
  function setAssessment(sessionID: string, entry: Entry, assessment: Assessment) {
    if (JSON.stringify(entry.assessment) === JSON.stringify(assessment)) return
    entry.assessment = assessment
    revisions.set(sessionID, (revisions.get(sessionID) ?? 0) + 1)
  }
  function reassess(sessionID: string, entry: Entry) {
    const current = read(entry.file)
    if (!current || entry.unavailable)
      return setAssessment(sessionID, entry, { reference: entry.reference, file: entry.file, state: "unavailable" })
    if (same(entry.baseline, current))
      return setAssessment(sessionID, entry, { reference: entry.reference, file: entry.file, state: "unchanged" })
    if (entry.expected && !expectedMatches(entry.expected, current))
      return setAssessment(sessionID, entry, { reference: entry.reference, file: entry.file, state: "unavailable" })
    return setAssessment(sessionID, entry, changed(entry, current, false))
  }

  /** Reserve all endpoints before a registered mutation. Duplicate canonical paths reject self-moves. */
  export function prepare(input: {
    sessionID: string
    files: string[]
    ttlMs?: number
  }): PreparedReservation | undefined {
    if (tombstoned(input.sessionID)) return
    hydrate(input.sessionID)
    const files = input.files.map(canonical)
    if (files.length === 0 || new Set(files).size !== files.length) return
    const current = entries.get(input.sessionID)
    const baselines = new Map<string, Endpoint>()
    for (const file of files) {
      if (current?.has(file)) continue
      const baseline = read(file)
      if (!baseline) return
      baselines.set(file, baseline)
    }
    const session = current ?? new Map<string, Entry>()
    if (!current) entries.set(input.sessionID, session)
    const created: Entry[] = []
    const endpoints: ReservedEndpoint[] = []
    for (const file of files) {
      const existing = session.get(file)
      if (existing) {
        endpoints.push({
          reference: existing.reference,
          file,
          revision: existing.revision,
          capability: crypto.randomUUID(),
          created: false,
        })
        continue
      }
      const entry = {
        reference: `external_${crypto.randomUUID()}`,
        file,
        baseline: baselines.get(file)!,
        revision: 0,
      } satisfies Entry
      session.set(file, entry)
      created.push(entry)
      setAssessment(input.sessionID, entry, { reference: entry.reference, file, state: "unavailable" })
      endpoints.push({ reference: entry.reference, file, revision: 0, capability: crypto.randomUUID(), created: true })
    }
    // Publish a lease before artifact bytes. A tombstone wins over this lease,
    // and a late creator fails closed instead of recreating deleted ownership.
    if (
      !persist(input.sessionID, session, created.map((entry) => entry.reference)) ||
      !created.every((entry) => writeArtifact(input.sessionID, entry)) ||
      !persist(input.sessionID, session)
    ) {
      for (const entry of created) session.delete(entry.file)
      if (session.size === 0) entries.delete(input.sessionID)
      return
    }
    const reservation: Reservation = {
      id: crypto.randomUUID(),
      sessionID: input.sessionID,
      expiresAt: Date.now() + (input.ttlMs ?? 60_000),
      endpoints,
    }
    reservations.set(reservation.id, reservation)
    return reservation
  }
  function valid(input: { sessionID: string; reservation: PreparedReservation }) {
    if (tombstoned(input.sessionID)) return
    const stored = reservations.get(input.reservation.id)
    if (!stored || stored.sessionID !== input.sessionID || stored.sessionID !== input.reservation.sessionID) return
    if (stored.expiresAt < Date.now() || stored.expiresAt !== input.reservation.expiresAt) return
    if (
      stored.endpoints.length !== input.reservation.endpoints.length ||
      stored.endpoints.some((endpoint, index) => {
        const candidate = input.reservation.endpoints[index]
        return (
          endpoint.reference !== candidate?.reference ||
          endpoint.capability !== candidate?.capability ||
          endpoint.revision !== candidate?.revision ||
          endpoint.file !== candidate?.file
        )
      })
    )
      return
    const session = entries.get(input.sessionID)
    if (!session || stored.endpoints.some((endpoint) => session.get(endpoint.file)?.revision !== endpoint.revision))
      return
    return stored
  }
  /** Commit a complete reservation group from endpoint bytes read by this server. */
  export function commit(input: { sessionID: string; reservation: PreparedReservation }) {
    const reservation = valid(input)
    if (!reservation) return false
    const session = entries.get(input.sessionID)!
    const states = reservation.endpoints.map((endpoint) => read(endpoint.file))
    if (states.some((state) => !state)) return false
    for (const [index, endpoint] of reservation.endpoints.entries()) {
      const entry = session.get(endpoint.file)!
      entry.expected = digest(states[index]!)
      entry.revision++
      reassess(input.sessionID, entry)
    }
    if (!persist(input.sessionID, session)) return false
    reservations.delete(reservation.id)
    return true
  }
  /** Abort a reservation without replacing a prior committed expected state. */
  export function abort(input: { sessionID: string; reservation: PreparedReservation }) {
    const reservation = valid(input)
    if (!reservation) return false
    const session = entries.get(input.sessionID)!
    for (const endpoint of reservation.endpoints) {
      const entry = session.get(endpoint.file)!
      if (endpoint.created && !entry.expected) {
        session.delete(endpoint.file)
        rmSync(artifactFile(input.sessionID, endpoint.reference), { force: true })
        continue
      }
      reassess(input.sessionID, entry)
    }
    if (session.size === 0) entries.delete(input.sessionID)
    else persist(input.sessionID, session)
    reservations.delete(reservation.id)
    return true
  }
  /** Delete ownership before physical artifacts so a stale reservation can never republish it. */
  export function remove(sessionID: string) {
    mkdirSync(path.dirname(tombstoneFile(sessionID)), { recursive: true })
    writeFileSync(tombstoneFile(sessionID), JSON.stringify({ generation: Date.now() }))
    entries.delete(sessionID)
    hydrated.add(sessionID)
    for (const [id, reservation] of reservations) if (reservation.sessionID === sessionID) reservations.delete(id)
    rmSync(sessionDir(sessionID), { recursive: true, force: true })
  }
  /** Idempotently removes only unmanifested or tombstoned artifact directories. */
  export function sweep() {
    try {
      for (const name of readdirSync(root())) {
        if (name === "tombstones") continue
        const id = decodeURIComponent(name)
        if (tombstoned(id) || !readManifest(id)) rmSync(path.join(root(), name), { recursive: true, force: true })
      }
    } catch {}
  }
  export function assessed(
    sessionID: string,
    options?: { patch?: boolean },
  ): { version: 1; revision: number; assessments: Assessment[] } {
    hydrate(sessionID)
    const session = entries.get(sessionID)
    if (session) for (const entry of session.values()) if (entry.expected) reassess(sessionID, entry)
    const assessments = session
      ? [...session.values()].flatMap((entry) => {
          if (!entry.assessment) return []
          if (!options?.patch || entry.assessment.state !== "changed") return [entry.assessment]
          const current = read(entry.file)
          return current ? [changed(entry, current, true)] : [entry.assessment]
        })
      : []
    return { version: 1, revision: revisions.get(sessionID) ?? 0, assessments }
  }
  /** Test-only restart seam; production restart rehydrates lazily from the manifest. */
  export function resetMemoryForTest() {
    entries.clear()
    revisions.clear()
    reservations.clear()
    hydrated.clear()
  }
}
