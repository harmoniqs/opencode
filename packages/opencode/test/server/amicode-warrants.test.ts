// Warrant routes (spec-20260727-164748 §9.5). The two things worth pinning: the
// ledger read is tolerant per-line but never invents a warrant, and the approve
// argv maps ONLY declared bounds — because §5.1 rule 2 refuses a launch needing a
// bound the warrant omits, so a helpfully-defaulted flag here would silently widen
// what the researcher thought they granted.
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { approveArgv, ledgerPath, readWarrants, warrantsBody } from "../../src/server/amicode/warrants"

const approval = (over: Record<string, unknown> = {}) => ({
  type: "approval",
  ts: "2026-07-27T20:00:00Z",
  plan_hash: "9f2c",
  bounds: { max_solves: 8, max_size_class: "MEDIUM" },
  expires_at: "2026-07-27T21:00:00Z",
  issued_by: "user:ui",
  ...over,
})

function withLedger(lines: unknown[]): { file: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "warrants-route-"))
  const file = join(dir, "runs.jsonl")
  writeFileSync(file, lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n")
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

describe("ledgerPath", () => {
  test("honours AMICO_LEDGER so the card reads the SAME file the gate does", () => {
    expect(ledgerPath({ AMICO_LEDGER: "/tmp/x.jsonl" })).toBe("/tmp/x.jsonl")
    expect(ledgerPath({})).toContain(join(".amico", "ledger", "runs.jsonl"))
  })
})

describe("readWarrants", () => {
  test("a missing ledger yields none — which reads as pending, never as approved", () => {
    expect(readWarrants(join(tmpdir(), "definitely-absent-", String(Math.abs(1)), "x.jsonl"))).toEqual([])
  })

  test("returns approval rows and ignores every other kind", () => {
    const { file, cleanup } = withLedger([approval(), { type: "solve", ts: "t" }, { type: "dispatch", ts: "t" }])
    try {
      const rows = readWarrants(file)
      expect(rows).toHaveLength(1)
      expect(rows[0].plan_hash).toBe("9f2c")
      expect(rows[0].issued_by).toBe("user:ui")
    } finally {
      cleanup()
    }
  })

  test("one corrupt line does not blind the card to the others", () => {
    const { file, cleanup } = withLedger(["{not json", approval({ plan_hash: "keeper" })])
    try {
      expect(readWarrants(file).map((r) => r.plan_hash)).toEqual(["keeper"])
    } finally {
      cleanup()
    }
  })

  test("rows missing plan_hash or expires_at are skipped, not defaulted", () => {
    const { file, cleanup } = withLedger([
      { type: "approval", ts: "t", bounds: {}, expires_at: "t2", issued_by: "u" },
      { type: "approval", ts: "t", plan_hash: "p", bounds: {}, issued_by: "u" },
    ])
    try {
      expect(readWarrants(file)).toEqual([])
    } finally {
      cleanup()
    }
  })

  test("counts solve rows under each plan, in the same pass", () => {
    const { file, cleanup } = withLedger([
      approval({ plan_hash: "p1" }),
      { type: "solve", ts: "t", plan_hash: "p1" },
      { type: "solve", ts: "t", plan_hash: "p1" },
      { type: "solve", ts: "t", plan_hash: "other" },
      { type: "solve", ts: "t" },
      approval({ plan_hash: "p2" }),
    ])
    try {
      const rows = readWarrants(file)
      expect(rows.find((r) => r.plan_hash === "p1")?.solves_used).toBe(2)
      // A plan with no solves is 0, not undefined — the chip renders "0 of N".
      expect(rows.find((r) => r.plan_hash === "p2")?.solves_used).toBe(0)
    } finally {
      cleanup()
    }
  })

  test("warrantsBody is ok:true with the rows", () => {
    const { file, cleanup } = withLedger([approval()])
    try {
      expect(JSON.parse(warrantsBody(file))).toMatchObject({ ok: true, warrants: [{ plan_hash: "9f2c" }] })
    } finally {
      cleanup()
    }
  })
})

describe("approveArgv", () => {
  test("plan_hash is required", () => {
    expect(approveArgv({})).toEqual({ error: "plan_hash is required" })
    expect(approveArgv({ plan_hash: "  " })).toEqual({ error: "plan_hash is required" })
  })

  test("only DECLARED bounds become flags", () => {
    expect(approveArgv({ plan_hash: "p" })).toEqual([
      "ledger", "approve", "--plan-hash", "p", "--issued-by", "user:ui",
    ])
  })

  test("maps each declared bound", () => {
    expect(
      approveArgv({ plan_hash: "p", bounds: { max_solves: 4, tier: "hpc", max_size_class: "MEDIUM", device: "ro" }, expires_in: 900 }),
    ).toEqual([
      "ledger", "approve", "--plan-hash", "p",
      "--max-solves", "4", "--tier", "hpc", "--max-size-class", "MEDIUM", "--device", "ro",
      "--expires-in", "900", "--issued-by", "user:ui",
    ])
  })

  test("unusable bound values are dropped rather than coerced", () => {
    expect(
      approveArgv({ plan_hash: "p", bounds: { max_solves: 0, tier: "  ", max_size_class: "LARGE", device: "yes" }, expires_in: -1 }),
    ).toEqual(["ledger", "approve", "--plan-hash", "p", "--issued-by", "user:ui"])
  })

  test("issued_by marks a button press, so an audit can tell it from the CLI", () => {
    const argv = approveArgv({ plan_hash: "p" }) as string[]
    expect(argv[argv.indexOf("--issued-by") + 1]).toBe("user:ui")
  })
})
