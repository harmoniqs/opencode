// AMICODE: vault browser data source (GET /amicode/vault-files + /amicode/vault-file).
// Lists and reads files inside attached vault mounts so the app's Vault panel can
// browse the knowledge base the agent works from. Strictly read-only. Contract
// (same as vaults.ts): every builder returns a JSON string and never throws —
// failures come back as `{ok:false, error}` bodies the panel renders inline.
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { getBindHostname, isLoopbackHostname } from "./connections"

const MAX_FILES = 5_000
const MAX_DEPTH = 12
const MAX_BYTES = 512_000

/** Directories that are machinery, not knowledge — never listed. */
const SKIP_DIRS = new Set(["node_modules", "__pycache__"])

/** Text file kinds the panel can render. Everything else is listed but marked
 *  unreadable so the tree still shows the vault's true shape (e.g. catalog
 *  binaries under git-lfs). */
const TEXT_EXT = new Set([
  ".md", ".txt", ".jl", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".toml",
  ".yaml", ".yml", ".csv", ".tex", ".sh", ".css", ".html", ".xml", ".svg", ".gitignore",
])

function vaultsRoot(): string {
  return process.env.AMICO_VAULTS_ROOT || path.join(homedir(), ".amico", "vaults")
}

const err = (code: string, detail: string) => JSON.stringify({ ok: false, error: `${code}: ${detail}` })

/** Vault contents are proprietary knowledge (team mounts hold unpublished
 *  results); browsing is a LOCAL-researcher capability, not a server API. Same
 *  loopback family + bind signal as the credential-mutation guard
 *  (connections.ts) — a 0.0.0.0 / LAN-bound server refuses these routes even
 *  to authed callers, unless AMICO_VAULT_BROWSER=1 explicitly opts a shared
 *  deployment in (=0 forces off everywhere). */
export function browseAllowed(env: Record<string, string | undefined> = process.env): boolean {
  const flag = env.AMICO_VAULT_BROWSER
  if (flag === "1" || flag === "true") return true
  if (flag === "0" || flag === "false") return false
  return isLoopbackHostname(getBindHostname())
}

const browseRefusal = () =>
  err("forbidden", "vault browsing serves loopback servers only (set AMICO_VAULT_BROWSER=1 to override)")

/** A vault opts out of the browser entirely with `browse = false` in its
 *  .amico-vault.toml marker — the agent's read grants are unaffected, but the
 *  panel will not list or serve a byte of it. */
export function browseOptedOut(dir: string): boolean {
  try {
    return /^\s*browse\s*=\s*false\s*$/m.test(readFileSync(path.join(dir, ".amico-vault.toml"), "utf8"))
  } catch {
    return false
  }
}

const optOutRefusal = (mountId: string) => err("forbidden", `vault "${mountId}" opts out of browsing (browse = false)`)

export function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase()
  return TEXT_EXT.has(ext) || TEXT_EXT.has(name.toLowerCase())
}

/** Resolve a mount id (the `name` in its .amico-vault.toml marker, falling back
 *  to the directory basename — parity with vaults.ts scanMounts) to its real
 *  directory. When two mounts declare the same marker name, the one whose
 *  DIRECTORY is also named `id` wins, so a duplicate can't silently shadow a
 *  vault the researcher can see in the mount list. Returns undefined when no
 *  such mount exists. */
export function mountDir(id: string, root: string = vaultsRoot()): string | undefined {
  let entries: string[]
  try {
    entries = readdirSync(root).sort()
  } catch {
    return undefined
  }
  let byName: string | undefined
  for (const base of entries) {
    let text: string
    try {
      text = readFileSync(path.join(root, base, ".amico-vault.toml"), "utf8")
    } catch {
      continue
    }
    const name = text.match(/^\s*name\s*=\s*"([^"]*)"/m)?.[1] || base
    if (name !== id) continue
    if (base === id) return path.join(root, base)
    byName ??= path.join(root, base)
  }
  return byName
}

export type VaultFileEntry = { path: string; name: string; size: number; readable: boolean }

/** Recursive listing of one mount as a FLAT array of relative paths (the panel
 *  folds it into a tree). Dotfiles and machinery dirs are skipped; the vault's
 *  own `.amico-vault.toml` marker is machinery too. */
export function vaultFilesBody(mountId: string | undefined, root: string = vaultsRoot()): string {
  if (!browseAllowed()) return browseRefusal()
  if (!mountId) return err("bad_request", "mount is required")
  const dir = mountDir(mountId, root)
  if (!dir) return err("not_found", `no attached vault named "${mountId}"`)
  if (browseOptedOut(dir)) return optOutRefusal(mountId)
  let realRoot: string
  try {
    realRoot = realpathSync(dir)
  } catch {
    return err("not_found", `no attached vault named "${mountId}"`)
  }
  const files: VaultFileEntry[] = []
  let truncated = false
  const walk = (abs: string, rel: string, depth: number) => {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) {
      truncated = true
      return
    }
    let entries: string[]
    try {
      entries = readdirSync(abs).sort()
    } catch {
      return
    }
    for (const name of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true
        return
      }
      if (name.startsWith(".")) continue
      if (SKIP_DIRS.has(name)) continue
      const absChild = path.join(abs, name)
      const relChild = rel ? `${rel}/${name}` : name
      let st
      try {
        // lstat, not stat: a symlink inside the mount may point ANYWHERE, and
        // a listing that follows it would enumerate names/sizes outside the
        // vault (vaultFileBody blocks the read, but the metadata leaks). Only
        // symlinks whose real target stays inside the mount are walked.
        st = lstatSync(absChild)
        if (st.isSymbolicLink()) {
          const real = realpathSync(absChild)
          if (real !== realRoot && !real.startsWith(realRoot + path.sep)) continue
          st = statSync(real)
        }
      } catch {
        continue
      }
      if (st.isDirectory()) walk(absChild, relChild, depth + 1)
      else if (st.isFile())
        files.push({ path: relChild, name, size: st.size, readable: isTextFile(name) && st.size <= MAX_BYTES })
    }
  }
  walk(dir, "", 0)
  return JSON.stringify({ ok: true, mount: mountId, count: files.length, truncated, files })
}

/** Read one file inside a mount. The traversal guard resolves REAL paths on
 *  both sides — mounts may themselves be symlinks (attachVault symlinks local
 *  vault dirs), so the containment check runs on resolved locations. */
export function vaultFileBody(mountId: string | undefined, relPath: string | undefined, root: string = vaultsRoot()): string {
  if (!browseAllowed()) return browseRefusal()
  if (!mountId) return err("bad_request", "mount is required")
  if (!relPath) return err("bad_request", "path is required")
  const dir = mountDir(mountId, root)
  if (!dir) return err("not_found", `no attached vault named "${mountId}"`)
  if (browseOptedOut(dir)) return optOutRefusal(mountId)
  let realRoot: string
  let realTarget: string
  try {
    realRoot = realpathSync(dir)
    realTarget = realpathSync(path.resolve(dir, relPath))
  } catch {
    return err("not_found", `no such file in "${mountId}": ${relPath}`)
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep))
    return err("forbidden", "path escapes the vault mount")
  let st
  try {
    st = statSync(realTarget)
  } catch {
    return err("not_found", `no such file in "${mountId}": ${relPath}`)
  }
  if (!st.isFile()) return err("bad_request", "path is not a file")
  if (st.size > MAX_BYTES) return err("too_large", `file is ${st.size} bytes (limit ${MAX_BYTES})`)
  if (!isTextFile(realTarget)) return err("not_text", "not a renderable text file")
  let content: string
  try {
    content = readFileSync(realTarget, "utf8")
  } catch (e) {
    return err("read_failed", String(e))
  }
  return JSON.stringify({ ok: true, mount: mountId, path: relPath, size: st.size, content })
}
