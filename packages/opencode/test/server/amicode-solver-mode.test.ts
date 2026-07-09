import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readSolverMode, solverModeBody, setSolverModeBody } from "@/server/amicode/solver-mode"

const tmp = () => path.join(mkdtempSync(path.join(tmpdir(), "solver-")), "solver-mode.json")

describe("solver mode", () => {
  test("defaults piccolo/ready; malformed file → default", () => {
    const f = tmp()
    expect(readSolverMode(f)).toEqual({ mode: "piccolo", status: "ready" })
    writeFileSync(f, "garbage")
    expect(readSolverMode(f)).toEqual({ mode: "piccolo", status: "ready" })
  })
  test("POST hp → switching (ready is the extension's word, not ours)", () => {
    const f = tmp()
    const res = JSON.parse(setSolverModeBody("hp", f))
    expect(res).toMatchObject({ ok: true, mode: "hp", status: "switching" })
    expect(JSON.parse(readFileSync(f, "utf8")).requested_at).toBeTruthy()
  })
  test("idempotent: re-selecting the settled mode does not re-trigger switching", () => {
    const f = tmp()
    writeFileSync(f, JSON.stringify({ mode: "hp", status: "ready" }))
    expect(JSON.parse(setSolverModeBody("hp", f))).toMatchObject({ mode: "hp", status: "ready" })
  })
  test("bad mode rejected", () => {
    expect(JSON.parse(setSolverModeBody("turbo", tmp())).ok).toBe(false)
    expect(JSON.parse(setSolverModeBody(undefined, tmp())).ok).toBe(false)
  })
  test("GET body reflects the file", () => {
    const f = tmp()
    writeFileSync(f, JSON.stringify({ mode: "hp", status: "switching" }))
    expect(JSON.parse(solverModeBody(f))).toMatchObject({ ok: true, mode: "hp", status: "switching" })
  })
})
