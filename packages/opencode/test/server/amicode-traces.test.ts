import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { tracesIndexBody, traceBody } from "@/server/amicode/traces"

const SPAN = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    ts: "2026-07-09T00:00:00Z",
    session: "ses_a",
    span: "model",
    id: "m1",
    name: "google/gemini-2.5-flash",
    dur_ms: 4200,
    attrs: { tokens: { input: 25054, output: 168, cache: { read: 0, write: 0 } } },
    error: null,
    ...over,
  })

describe("traces reader", () => {
  test("index aggregates per session: counts, tokens, errors; skips malformed lines", () => {
    const root = mkdtempSync(path.join(tmpdir(), "traces-"))
    writeFileSync(
      path.join(root, "ses_a.jsonl"),
      [
        SPAN(),
        SPAN({ id: "m2", error: '"APIError"' }),
        "not json",
        SPAN({ span: "tool", id: "c1", name: "amicode_solve" }),
      ].join("\n") + "\n",
    )
    const idx = JSON.parse(tracesIndexBody(root))
    expect(idx.ok).toBe(true)
    expect(idx.sessions).toHaveLength(1)
    expect(idx.sessions[0]).toMatchObject({
      session: "ses_a",
      spans: 3,
      model_calls: 2,
      tool_calls: 1,
      errors: 1,
      input_tokens: 50108,
    })
  })
  test("session read: bounded, newest-last, id validated", () => {
    const root = mkdtempSync(path.join(tmpdir(), "traces-"))
    writeFileSync(
      path.join(root, "ses_b.jsonl"),
      [SPAN({ id: "1" }), SPAN({ id: "2" }), SPAN({ id: "3" })].join("\n") + "\n",
    )
    const two = JSON.parse(traceBody("ses_b", 2, root))
    expect(two.spans.map((s: any) => s.id)).toEqual(["2", "3"])
    expect(two.total).toBe(3)
    expect(JSON.parse(traceBody("../etc", 5, root)).ok).toBe(false)
    expect(JSON.parse(traceBody("nope", 5, root)).ok).toBe(false)
  })
})
