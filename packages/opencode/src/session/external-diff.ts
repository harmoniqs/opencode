import * as path from "path"
import { createTwoFilesPatch, diffLines } from "diff"

export namespace ExternalDiff {
  export type Assessment =
    | {
        reference: string
        file: string
        state: "changed"
        patch: string
        additions: number
        deletions: number
      }
    | { reference: string; file: string; state: "unavailable" }

  type Entry = {
    reference: string
    file: string
    baseline: string
    assessment?: Assessment
  }

  const entries = new Map<string, Map<string, Entry>>()
  const revisions = new Map<string, number>()

  function canonical(file: string) {
    return path.resolve(file)
  }

  export function capture(input: { sessionID: string; file: string; baseline: string }) {
    const file = canonical(input.file)
    const session = entries.get(input.sessionID) ?? new Map<string, Entry>()
    entries.set(input.sessionID, session)
    const existing = session.get(file)
    if (existing) return existing.reference

    const reference = `external_${crypto.randomUUID()}`
    session.set(file, { reference, file, baseline: input.baseline })
    return reference
  }

  export function settle(input: { sessionID: string; reference: string; file: string; current: string }) {
    const entry = entries.get(input.sessionID)?.get(canonical(input.file))
    if (!entry || entry.reference !== input.reference) return

    let additions = 0
    let deletions = 0
    for (const change of diffLines(entry.baseline, input.current)) {
      if (change.added) additions += change.count || 0
      if (change.removed) deletions += change.count || 0
    }
    entry.assessment = {
      reference: entry.reference,
      file: entry.file,
      state: "changed",
      patch: createTwoFilesPatch(entry.file, entry.file, entry.baseline, input.current),
      additions,
      deletions,
    }
    revisions.set(input.sessionID, (revisions.get(input.sessionID) ?? 0) + 1)
  }

  export function unavailable(input: { sessionID: string; reference: string; file: string }) {
    const entry = entries.get(input.sessionID)?.get(canonical(input.file))
    if (!entry || entry.reference !== input.reference) return
    entry.assessment = { reference: entry.reference, file: entry.file, state: "unavailable" }
    revisions.set(input.sessionID, (revisions.get(input.sessionID) ?? 0) + 1)
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
