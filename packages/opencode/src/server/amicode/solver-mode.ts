import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import os from "os"
import path from "path"

// AMICODE: solver mode — the state behind the home page's
// [Piccolo | Piccolissimo + Altissimo] toggle, file-backed so the amicode
// EXTENSION can react (it watches this file, grants/revokes the `issimo`
// entitlement, re-preps the session config, restarts the server, then flips
// status back to "ready" — see amicode packages/extension/src/solver_mode.ts,
// the other half of this contract; change both in one change-set).
//
//   {"mode":"piccolo"|"hp", "status":"ready"|"switching", "requested_at": ISO}
//
// POST here only ever writes status:"switching" — "ready" is the extension's
// word, given after the switch actually happened. Same never-reject JSON-body
// discipline as the sibling modules.

export type SolverMode = "piccolo" | "hp"

export function solverModeFile(): string {
  const ops = process.env.AMICODE_OPS_DIR ?? path.join(os.homedir(), ".amico", "amicode")
  return path.join(ops, "solver-mode.json")
}

export function readSolverMode(file: string = solverModeFile()): { mode: SolverMode; status: "ready" | "switching" } {
  try {
    if (!existsSync(file)) return { mode: "piccolo", status: "ready" }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { mode?: unknown; status?: unknown }
    return {
      mode: parsed.mode === "hp" ? "hp" : "piccolo",
      status: parsed.status === "switching" ? "switching" : "ready",
    }
  } catch {
    return { mode: "piccolo", status: "ready" }
  }
}

export function solverModeBody(file: string = solverModeFile()): string {
  const state = readSolverMode(file)
  return JSON.stringify({ ok: true, ...state, error: null })
}

export function setSolverModeBody(modeRaw: string | undefined, file: string = solverModeFile()): string {
  if (modeRaw !== "piccolo" && modeRaw !== "hp")
    return JSON.stringify({ ok: false, mode: null, status: null, error: "bad_request: mode must be piccolo|hp" })
  const current = readSolverMode(file)
  // Idempotent: re-selecting the active, settled mode is a no-op (no restart).
  if (current.mode === modeRaw && current.status === "ready") return solverModeBody(file)
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ mode: modeRaw, status: "switching", requested_at: new Date().toISOString() }))
  } catch (err) {
    return JSON.stringify({ ok: false, mode: null, status: null, error: `write_failed: ${String(err)}` })
  }
  return solverModeBody(file)
}
