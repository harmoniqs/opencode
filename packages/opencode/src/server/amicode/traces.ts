import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import os from "os"
import path from "path"

// AMICODE: reader for the local turn-level traces the amicode plugin writes
// (one JSONL of spans per session under ~/.amico/amicode/traces).
//
// MIRROR (change both in one change-set): the span envelope is defined by the
// WRITER — harmoniqs/amicode packages/extension/opencode-plugin/traces.ts:
//   {v:1, ts, session, span:"model"|"tool"|"turn", id, name,
//    dur_ms|null, attrs:{...}, error:string|null}
// Malformed lines are skipped (append-only stream discipline). Same
// never-reject contract as problems.ts: every body is a JSON string.

export function tracesRoot(): string {
  const env = process.env.AMICODE_TRACE_DIR
  if (env && env.trim() !== "") return env
  return path.join(os.homedir(), ".amico", "amicode", "traces")
}

export function synthesizeTraces(code: string, detail: string): string {
  return JSON.stringify({ ok: false, sessions: [], spans: [], error: `${code}: ${detail}` })
}

type Span = {
  v: number
  ts: string
  session: string
  span: string
  id: string
  name: string
  dur_ms: number | null
  attrs: Record<string, unknown>
  error: string | null
}

function readSpans(file: string): Span[] {
  let text = ""
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return []
  }
  const out: Span[] = []
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue
    try {
      const parsed = JSON.parse(line)
      if (parsed && parsed.v === 1 && typeof parsed.span === "string") out.push(parsed as Span)
    } catch {
      /* torn/malformed line — skip */
    }
  }
  return out
}

/** Index: one row per session — enough for a trace list UI and for spotting
 *  the failure patterns (error counts) and cost drivers (token totals). */
export function tracesIndexBody(root: string = tracesRoot()): string {
  try {
    if (!existsSync(root)) return JSON.stringify({ ok: true, sessions: [], error: null })
    const sessions = readdirSync(root)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const spans = readSpans(path.join(root, f))
        const models = spans.filter((s) => s.span === "model")
        const tokensIn = models.reduce((n, s) => n + (Number((s.attrs?.tokens as any)?.input) || 0), 0)
        const cacheRead = models.reduce((n, s) => n + (Number((s.attrs?.tokens as any)?.cache?.read) || 0), 0)
        return {
          session: f.slice(0, -6),
          spans: spans.length,
          model_calls: models.length,
          tool_calls: spans.filter((s) => s.span === "tool").length,
          errors: spans.filter((s) => s.error !== null).length,
          input_tokens: tokensIn,
          cache_read_tokens: cacheRead,
          model_ms: models.reduce((n, s) => n + (s.dur_ms ?? 0), 0),
          first_ts: spans[0]?.ts ?? null,
          last_ts: spans[spans.length - 1]?.ts ?? null,
          mtime_ms: statSync(path.join(root, f)).mtimeMs,
        }
      })
      .sort((a, b) => b.mtime_ms - a.mtime_ms)
    return JSON.stringify({ ok: true, sessions, error: null })
  } catch (err) {
    return synthesizeTraces("bad_output", String(err))
  }
}

/** One session's spans (newest last), bounded. */
export function traceBody(session: string | undefined, limit = 500, root: string = tracesRoot()): string {
  if (!session || !/^[\w.-]+$/.test(session)) return synthesizeTraces("bad_request", "session id required")
  const file = path.join(root, `${session}.jsonl`)
  if (!existsSync(file)) return synthesizeTraces(`not_found:${session}`, "no trace for that session")
  try {
    const spans = readSpans(file)
    const bounded = spans.slice(Math.max(0, spans.length - Math.max(1, Math.min(limit, 5000))))
    return JSON.stringify({ ok: true, session, spans: bounded, total: spans.length, error: null })
  } catch (err) {
    return synthesizeTraces("bad_output", String(err))
  }
}
