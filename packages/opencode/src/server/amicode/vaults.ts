// AMICODE: data source for the Vaults panel tab (GET /amicode/vaults).
// Relays `amico-vault status --json` (harmoniqs/amico) verbatim; every
// failure mode is synthesized into the SAME plural shape so the web app
// parses exactly one schema. Contract: status() never rejects.
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { run } from "@/util/process"

const TIMEOUT_MS = 8_000
const CACHE_MS = 10_000
const CLONE_TIMEOUT_MS = 120_000

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

// ── Attach an existing vault (POST /amicode/vaults) ────────────────────────
// Clones a repo (primary) or symlinks a local vault dir (secondary) into the
// vaults root, so resolveMountStack discovers it like any other mount. Its
// success does NOT depend on the amico-vault CLI (a fresh user may not have it)
// — it returns its own {ok,name,…} shape, distinct from status()'s mounts shape.

function vaultsRoot(): string {
  return process.env.AMICO_VAULTS_ROOT || path.join(homedir(), ".amico", "vaults")
}

/** Fold a proposed name into a safe mount dir name (lowercase kebab) — parity
 *  with the extension's sanitizeVaultName (substrate/vault_setup.ts). */
export function sanitizeVaultName(raw: string): string {
  const s = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
  return s || "vault"
}

export type VaultRef = { kind: "repo"; url: string; name: string } | { kind: "path"; path: string; name: string }

/** Resolve a user reference to a clone URL or local path + destination name:
 *   - absolute / ~ / ./ path   → local attach (symlink)
 *   - git URL (git@… | …://)   → clone
 *   - owner/repo               → clone git@github.com:owner/repo.git
 *   - bare name                → clone git@github.com:harmoniqs/<name>.git */
export function normalizeRef(raw: string): VaultRef | undefined {
  const ref = (raw ?? "").trim()
  if (!ref) return undefined
  const repoName = (r: string) => sanitizeVaultName(path.basename(r).replace(/\.git$/, ""))
  if (ref.startsWith("/") || ref.startsWith("~") || ref.startsWith("./") || ref.startsWith("../")) {
    const abs = ref.startsWith("~") ? path.join(homedir(), ref.slice(1)) : path.resolve(ref)
    return { kind: "path", path: abs, name: sanitizeVaultName(path.basename(abs)) }
  }
  if (ref.includes("://") || ref.startsWith("git@")) return { kind: "repo", url: ref, name: repoName(ref) }
  if (/^[\w.-]+\/[\w.-]+$/.test(ref))
    return { kind: "repo", url: `git@github.com:${ref.replace(/\.git$/, "")}.git`, name: repoName(ref) }
  if (/^[\w.-]+$/.test(ref)) return { kind: "repo", url: `git@github.com:harmoniqs/${ref}.git`, name: sanitizeVaultName(ref) }
  return undefined
}

const attachErr = (code: string, detail: string) => JSON.stringify({ ok: false, error: `${code}: ${detail}` })

/** Attach an existing vault. JSON body `{ ref }`. Returns `{ok:true,name,kind}`
 *  on success (mount discovered on next session), else `{ok:false,error}`. */
export async function attachVault(rawBody: string, root: string = vaultsRoot()): Promise<string> {
  let parsed: { ref?: unknown }
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return attachErr("bad_request", "body must be JSON {ref}")
  }
  if (typeof parsed.ref !== "string" || parsed.ref.trim() === "") return attachErr("bad_request", "ref is required")
  const spec = normalizeRef(parsed.ref)
  if (!spec) return attachErr("bad_request", `unrecognized vault reference: ${parsed.ref}`)
  const dest = path.join(root, spec.name)
  if (existsSync(dest)) return attachErr("exists", `a vault named "${spec.name}" is already attached`)
  let kind = "personal"
  try {
    mkdirSync(root, { recursive: true })
    if (spec.kind === "path") {
      const marker = path.join(spec.path, ".amico-vault.toml")
      if (!existsSync(marker)) return attachErr("not_a_vault", "that path has no .amico-vault.toml marker")
      symlinkSync(spec.path, dest)
    } else {
      const res = await run(["git", "clone", spec.url, dest], {
        abort: AbortSignal.timeout(CLONE_TIMEOUT_MS),
        nothrow: true,
      })
      if (res.code !== 0) return attachErr("clone_failed", (res.stderr.toString().trim() || "git clone failed").slice(0, 300))
      // An attached vault normally carries its own marker; stamp a personal
      // fallback only if it doesn't, so discovery never skips it for a missing kind.
      const marker = path.join(dest, ".amico-vault.toml")
      if (!existsSync(marker)) writeFileSync(marker, `kind = "personal"\nname = "${spec.name}"\n`)
    }
  } catch (err) {
    return attachErr("attach_failed", String(err))
  }
  cache = undefined // bust the status() cache so the Vaults tab reflects the new mount
  return JSON.stringify({ ok: true, name: spec.name, kind, path: dest })
}
