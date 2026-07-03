// AMICODE: data source for the Vaults panel tab (GET /amicode/vaults).
// Relays `amico-vault status --json` (harmoniqs/amico) verbatim; every
// failure mode is synthesized into the SAME plural shape so the web app
// parses exactly one schema. Contract: status() never rejects.
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { run } from "@/util/process"

const TIMEOUT_MS = 8_000
const CACHE_MS = 10_000

export function synthesize(code: string, detail: string): string {
  return JSON.stringify({ ok: false, mounts: [], error: `${code}: ${detail}` })
}

export function candidates(env: Record<string, string | undefined>, home: string): string[] {
  const out: string[] = []
  if (env.AMICO_VAULT_BIN) out.push(env.AMICO_VAULT_BIN)
  if (env.AMICO_OPS) out.push(path.join(env.AMICO_OPS, "scripts", "amico-vault"))
  out.push(path.join(home, ".amico", "ops", "scripts", "amico-vault"))
  return out
}

function resolveCli(): string | undefined {
  for (const candidate of candidates(process.env, homedir())) {
    if (existsSync(candidate)) return candidate
  }
  return Bun.which("amico-vault") ?? undefined
}

let cache: { at: number; body: string } | undefined

export async function status(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.body
  const body = await statusUncached().catch((err) => synthesize("bad_output", String(err)))
  cache = { at: Date.now(), body }
  return body
}

async function statusUncached(): Promise<string> {
  const cli = resolveCli()
  if (!cli) return synthesize("cli_not_found", "amico-vault not found — is amico installed?")
  const started = Date.now()
  // abort is the actual deadline; `timeout` is only the SIGTERM→SIGKILL grace
  // period inside the wrapper's abort handler (it does NOT arm a deadline by
  // itself — see util/process.ts:74-107).
  const result = await run([cli, "status", "--json"], {
    abort: AbortSignal.timeout(TIMEOUT_MS),
    timeout: 2_000,
    nothrow: true,
  })
  if (result.code !== 0) {
    if (Date.now() - started >= TIMEOUT_MS)
      return synthesize("timeout", `amico-vault status did not finish within ${TIMEOUT_MS / 1000}s`)
    const detail = result.stderr.toString().trim() || "amico-vault exited non-zero"
    return synthesize(`exit_${result.code}`, detail.slice(0, 300))
  }
  const text = result.stdout.toString().trim()
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object")
  } catch {
    return synthesize("bad_output", "amico-vault produced unparseable JSON")
  }
  return text
}
