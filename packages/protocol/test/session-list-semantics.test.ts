import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import { SessionListSemantics, SessionsQuery } from "../src/groups/session-list-semantics"

const decode = Schema.decodeUnknownSync(SessionsQuery)

const liveFields = () => {
  const probe: Record<string, unknown> = {}
  try {
    decode(probe)
  } catch {
    throw new Error("empty query should decode — session.list has no required fields")
  }
  return Object.keys(SessionsQuery.fields).sort()
}

describe("SessionListSemantics (H5: the drift gate)", () => {
  it("the live session.list query schema matches the frozen semantics manifest", () => {
    const fields = liveFields()
    expect(fields).toEqual(SessionListSemantics.queryFields.map((field) => field.name).sort())
    for (const field of SessionListSemantics.queryFields) {
      expect((SessionsQuery.fields as Record<string, unknown>)[field.name]).toBeDefined()
    }
    // Optionality is part of the frozen meaning: the manifest records every
    // field as optional, and the live schema agrees — an empty query decodes.
    expect(SessionListSemantics.queryFields.every((field) => !field.required)).toBe(true)
  })

  it("an additive optional field with a base default passes the gate", () => {
    const next: readonly SessionListSemantics.QueryField[] = [
      ...SessionListSemantics.queryFields,
      { name: "fleet_view", kind: "filter", required: false, default: undefined },
    ]
    const verdict = SessionListSemantics.classify(SessionListSemantics.queryFields, next)
    expect(verdict).toEqual({ ok: true })
  })

  it("removing a query field without a companion update fails the gate", () => {
    const next = SessionListSemantics.queryFields.filter((field) => field.name !== "directory")
    const verdict = SessionListSemantics.classify(SessionListSemantics.queryFields, next)
    expect(verdict.ok).toBe(false)
  })

  it("flipping a field from optional to required fails the gate", () => {
    const next = SessionListSemantics.queryFields.map((field) =>
      field.name === "workspace" ? { ...field, required: true } : field,
    )
    const verdict = SessionListSemantics.classify(SessionListSemantics.queryFields, next)
    expect(verdict.ok).toBe(false)
  })

  it("changing a default fails the gate", () => {
    const next = SessionListSemantics.queryFields.map((field) =>
      field.name === "limit" ? { ...field, default: 100 } : field,
    )
    const verdict = SessionListSemantics.classify(SessionListSemantics.queryFields, next)
    expect(verdict.ok).toBe(false)
  })
})
