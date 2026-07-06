// Terminal-state semantics for the run-dir contract — a documented MIRROR of
// amicode's canonical reader (packages/extension/src/run_dir_reader.ts,
// readTerminalState). ONE-SPINE RULE (amicode #84): the run-dir contract has a
// single terminal semantic, and every consumer — the extension's RunsManager
// AND this server's run-status/run-series endpoints — must agree on it:
//
//   * FINISHED (written by amico-run, the orchestrator) is the ONLY terminal
//     authority. Script output (e.g. the DONE line) never decides status.
//   * FINISHED's `status` field decides the outcome; a missing/torn/mid-write
//     FINISHED is NOT terminal — callers keep polling (never latch "failed"
//     off a read race).
//   * A cooperative user-stop exits 0 → FINISHED says "completed"; the
//     AMICODE_STOPPED marker relabels it "stopped" so no surface reads a
//     user-stop as a genuine convergence (and nothing promotes it).
//   * Fidelity comes only from result.toml, and only when status is completed.
//
// If you change semantics here, change readTerminalState in amicode too.

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export interface TerminalState {
  status: "completed" | "stopped" | "failed" | "aborted"
  fidelity: number | null
  iterations: number | null
}

function tomlScalar(text: string, key: string): number | null {
  const m = text.match(new RegExp(`^${key}\\s*=\\s*([0-9eE+.\\-]+)\\s*$`, "m"))
  if (!m) return null
  const v = Number(m[1])
  return Number.isFinite(v) ? v : null
}

function tomlString(text: string, key: string): string | null {
  const m = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"\\s*$`, "m"))
  return m ? m[1] : null
}

/** undefined = not terminal yet (no FINISHED, or torn/invalid mid-write) —
 *  keep polling; never report failed off a read race. */
export function readTerminalState(dir: string, log?: string): TerminalState | undefined {
  const fp = path.join(dir, "FINISHED")
  if (!existsSync(fp)) return undefined
  let finished: string
  try {
    finished = readFileSync(fp, "utf8")
  } catch {
    return undefined
  }
  const raw = tomlString(finished, "status")
  if (raw !== "completed" && raw !== "failed" && raw !== "aborted" && raw !== "stopped") return undefined
  let status: TerminalState["status"] = raw
  if (status === "completed") {
    const body =
      log ??
      (() => {
        try {
          return readFileSync(path.join(dir, "run.log"), "utf8")
        } catch {
          return ""
        }
      })()
    if (body.includes("AMICODE_STOPPED")) status = "stopped"
  }
  let fidelity: number | null = null
  let iterations: number | null = null
  if (status === "completed") {
    try {
      const result = readFileSync(path.join(dir, "result.toml"), "utf8")
      fidelity = tomlScalar(result, "fidelity")
      iterations = tomlScalar(result, "iterations")
    } catch {
      /* result.toml absent: completed with no recorded fidelity */
    }
  }
  return { status, fidelity, iterations }
}

/** Contract status → the run window's display vocabulary ("finished" et al). */
export function displayStatus(s: TerminalState["status"]): string {
  return s === "completed" ? "finished" : s
}
