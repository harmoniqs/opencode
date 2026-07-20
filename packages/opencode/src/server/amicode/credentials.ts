// AMICODE: the CredentialStore — the ONE seam through which connection
// credentials reach disk (ADR 0001, amicode#159/#162). Per-connection-type
// backends declare their file (env override → ~/.amico default, the
// problems.ts idiom — here the override vars are the SAME ones the amicode
// CLI honors, so the test seam and the CLI-compatibility seam are one
// mechanism) and their schema. Byte shapes are golden-fixture locked
// (test/server/fixtures/credentials): cloud.json must stay parseable by the
// amicode CLI's remote-config reader (amico-run/src/remote_config.ts)
// unchanged. SECURITY: no credential value ever appears in an error message
// or log line — errors carry structure, never bytes.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export type ConnectionType = "company-compute" | "pasqal-cloud"

/** FROZEN byte shape — every existing CLI consumer parses this unchanged. */
export interface CompanyComputeCredential {
  base_url: string
  token: string
}
/** Token-only at rest: project id + real token (+ optional expiry metadata).
 *  A password NEVER has a field to land in — see the poison guard below. */
export interface PasqalCredential {
  project_id: string
  token: string
  expires_at?: string
}
export type Credential = CompanyComputeCredential | PasqalCredential

/** $AMICO_CLOUD_FILE overrides the path — the same override the amicode CLI's
 *  remote-config reader honors (remote_config.ts cloudConfigFile). */
export function cloudFile(): string {
  const env = process.env.AMICO_CLOUD_FILE
  if (env && env.trim() !== "") return env
  return path.join(homedir(), ".amico", "cloud.json")
}
/** $AMICO_PASQAL_FILE override; default lives beside cloud.json. */
export function pasqalFile(): string {
  const env = process.env.AMICO_PASQAL_FILE
  if (env && env.trim() !== "") return env
  return path.join(homedir(), ".amico", "pasqal.json")
}

// --- poison guard: writing any object carrying a password-like key through
// this seam must be impossible. The encoders below are allowlist-only (they
// build a fresh object from the declared schema keys), so a stray key can
// never serialize; this guard additionally makes the attempt LOUD instead of
// silently trimmed. The message never echoes the key or its value.
const POISON_KEY = /pass|pwd|user|login|secret/i
function rejectPoisonKeys(value: Record<string, unknown>): void {
  for (const key of Object.keys(value)) {
    if (POISON_KEY.test(key)) throw new Error("credential rejected: password-like keys are never persisted")
  }
}

interface Backend {
  file(): string
  /** allowlist-encode to the frozen byte shape; throws on schema violations */
  encode(value: Record<string, unknown>): string
  /** tolerant decode: anything off-schema is absent, never a throw */
  decode(raw: unknown): Credential | undefined
}

const BACKENDS: Record<ConnectionType, Backend> = {
  "company-compute": {
    file: cloudFile,
    encode(value) {
      rejectPoisonKeys(value)
      const base = typeof value.base_url === "string" ? value.base_url.trim().replace(/\/+$/, "") : ""
      const token = typeof value.token === "string" ? value.token.trim() : ""
      if (base === "" || token === "")
        throw new Error('company-compute credential needs non-empty "base_url" and "token"')
      return JSON.stringify({ base_url: base, token }, null, 2) + "\n"
    },
    decode(raw) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
      const d = raw as Record<string, unknown>
      if (typeof d.base_url !== "string" || d.base_url === "") return undefined
      if (typeof d.token !== "string" || d.token === "") return undefined
      return { base_url: d.base_url.replace(/\/+$/, ""), token: d.token }
    },
  },
  "pasqal-cloud": {
    file: pasqalFile,
    encode(value) {
      rejectPoisonKeys(value)
      const project = typeof value.project_id === "string" ? value.project_id.trim() : ""
      const token = typeof value.token === "string" ? value.token.trim() : ""
      if (project === "" || token === "")
        throw new Error('pasqal-cloud credential needs non-empty "project_id" and "token"')
      const out: PasqalCredential = { project_id: project, token }
      if (typeof value.expires_at === "string" && value.expires_at.trim() !== "") out.expires_at = value.expires_at.trim()
      return JSON.stringify(out, null, 2) + "\n"
    },
    decode(raw) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
      const d = raw as Record<string, unknown>
      if (typeof d.project_id !== "string" || d.project_id === "") return undefined
      if (typeof d.token !== "string" || d.token === "") return undefined
      const out: PasqalCredential = { project_id: d.project_id, token: d.token }
      if (typeof d.expires_at === "string" && d.expires_at !== "") out.expires_at = d.expires_at
      return out
    },
  },
}

// --- the seam surface: read / write / clear per connection type ---

export function readCredential(type: "company-compute"): CompanyComputeCredential | undefined
export function readCredential(type: "pasqal-cloud"): PasqalCredential | undefined
export function readCredential(type: ConnectionType): Credential | undefined
export function readCredential(type: ConnectionType): Credential | undefined {
  const backend = BACKENDS[type]
  const file = backend.file()
  let raw: unknown
  try {
    if (!existsSync(file)) return undefined
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined // missing/unreadable/unparseable → absent, never a throw
  }
  return backend.decode(raw)
}

export function writeCredential(type: "company-compute", value: CompanyComputeCredential): void
export function writeCredential(type: "pasqal-cloud", value: PasqalCredential): void
export function writeCredential(type: ConnectionType, value: Credential): void {
  const backend = BACKENDS[type]
  const bytes = backend.encode(value as unknown as Record<string, unknown>)
  const target = backend.file()
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, bytes)
}

/** Remove the credential file; absent is a no-op. */
export function clearCredential(type: ConnectionType): void {
  rmSync(BACKENDS[type].file(), { force: true })
}
