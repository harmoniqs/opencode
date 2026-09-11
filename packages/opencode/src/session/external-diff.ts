import { existsSync, readFileSync } from "node:fs"
import * as path from "path"
import { createTwoFilesPatch, diffLines } from "diff"

export namespace ExternalDiff {
  export type Assessment =
    | {
        reference: string
        file: string
        state: "changed"
        status: "added" | "modified" | "deleted"
        patch: string
        additions: number
        deletions: number
      }
    | { reference: string; file: string; state: "unchanged" | "unavailable" }

  type Endpoint = { present: true; content: string } | { present: false }

  type Entry = {
    reference: string
    file: string
    baseline: Endpoint
    expected?: Endpoint
    revision: number
    assessment?: Assessment
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

  function canonical(file: string) {
    return path.resolve(file)
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

  function changed(entry: Entry, current: Endpoint): Assessment {
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
      patch: createTwoFilesPatch(entry.file, entry.file, baseline, content),
      additions,
      deletions,
    }
  }

  function setAssessment(sessionID: string, entry: Entry, assessment: Assessment) {
    entry.assessment = assessment
    revisions.set(sessionID, (revisions.get(sessionID) ?? 0) + 1)
  }

  function reassess(sessionID: string, entry: Entry) {
    const current = read(entry.file)
    if (!current)
      return setAssessment(sessionID, entry, { reference: entry.reference, file: entry.file, state: "unavailable" })
    if (same(entry.baseline, current)) {
      return setAssessment(sessionID, entry, { reference: entry.reference, file: entry.file, state: "unchanged" })
    }
    if (entry.expected && !same(entry.expected, current)) {
      return setAssessment(sessionID, entry, { reference: entry.reference, file: entry.file, state: "unavailable" })
    }
    return setAssessment(sessionID, entry, changed(entry, current))
  }

  /** Reserve all endpoints before a registered mutation. Duplicate canonical paths reject self-moves. */
  export function prepare(input: {
    sessionID: string
    files: string[]
    ttlMs?: number
  }): PreparedReservation | undefined {
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
      setAssessment(input.sessionID, entry, { reference: entry.reference, file, state: "unavailable" })
      endpoints.push({ reference: entry.reference, file, revision: 0, capability: crypto.randomUUID(), created: true })
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
    const stored = reservations.get(input.reservation.id)
    if (!stored || stored.sessionID !== input.sessionID || stored.sessionID !== input.reservation.sessionID) return
    if (stored.expiresAt < Date.now() || stored.expiresAt !== input.reservation.expiresAt) return
    if (
      stored.endpoints.length !== input.reservation.endpoints.length ||
      stored.endpoints.some(
        (endpoint, index) =>
          endpoint.reference !== input.reservation.endpoints[index]?.reference ||
          endpoint.capability !== input.reservation.endpoints[index]?.capability ||
          endpoint.revision !== input.reservation.endpoints[index]?.revision ||
          endpoint.file !== input.reservation.endpoints[index]?.file,
      )
    ) {
      return
    }
    const session = entries.get(input.sessionID)
    if (!session) return
    if (stored.endpoints.some((endpoint) => session.get(endpoint.file)?.revision !== endpoint.revision)) return
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
      entry.expected = states[index]!
      entry.revision++
      reassess(input.sessionID, entry)
    }
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
        continue
      }
      reassess(input.sessionID, entry)
    }
    if (session.size === 0) entries.delete(input.sessionID)
    reservations.delete(reservation.id)
    return true
  }

  export function assessed(sessionID: string): { version: 1; revision: number; assessments: Assessment[] } {
    const session = entries.get(sessionID)
    return {
      version: 1,
      revision: revisions.get(sessionID) ?? 0,
      assessments: session
        ? [...session.values()].flatMap((entry) => (entry.assessment ? [entry.assessment] : []))
        : [],
    }
  }
}
