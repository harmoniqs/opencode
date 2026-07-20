import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, lstatSync } from "node:fs"
import { tmpdir, homedir } from "node:os"
import path from "node:path"
import { candidates, synthesize, normalizeRef, sanitizeVaultName, attachVault } from "@/server/amicode/vaults"

describe("synthesize", () => {
  test("emits the plural failure shape the UI parser expects", () => {
    const parsed = JSON.parse(synthesize("cli_not_found", "amico-vault not found"))
    expect(parsed).toEqual({ ok: false, mounts: [], error: "cli_not_found: amico-vault not found" })
  })
})

describe("candidates", () => {
  const home = "/home/u"
  test("resolution order: AMICO_VAULT_BIN, then AMICO_OPS, then the canonical ops path", () => {
    expect(candidates({ AMICO_VAULT_BIN: "/x/bin/av", AMICO_OPS: "/y/ops" }, home)).toEqual([
      "/x/bin/av",
      "/y/ops/scripts/amico-vault",
      "/home/u/.amico/ops/scripts/amico-vault",
    ])
  })
  test("unset env vars are skipped; canonical path is always last", () => {
    expect(candidates({}, home)).toEqual(["/home/u/.amico/ops/scripts/amico-vault"])
  })
})

describe("sanitizeVaultName", () => {
  test("folds to lowercase kebab; empty → 'vault'", () => {
    expect(sanitizeVaultName("My Lab Vault!")).toBe("my-lab-vault")
    expect(sanitizeVaultName("  ---  ")).toBe("vault")
  })
})

describe("normalizeRef", () => {
  test("owner/repo → github clone URL, name from repo", () => {
    expect(normalizeRef("harmoniqs/armonia-jack")).toEqual({
      kind: "repo",
      url: "git@github.com:harmoniqs/armonia-jack.git",
      name: "armonia-jack",
    })
  })
  test("bare name → default harmoniqs namespace", () => {
    expect(normalizeRef("armonia-kate")).toEqual({
      kind: "repo",
      url: "git@github.com:harmoniqs/armonia-kate.git",
      name: "armonia-kate",
    })
  })
  test("explicit git URL is used verbatim", () => {
    const url = "git@github.com:someone/their-vault.git"
    expect(normalizeRef(url)).toEqual({ kind: "repo", url, name: "their-vault" })
  })
  test("absolute path → local attach", () => {
    expect(normalizeRef("/data/my-vault")).toEqual({ kind: "path", path: "/data/my-vault", name: "my-vault" })
  })
  test("~ path is home-expanded", () => {
    const r = normalizeRef("~/vaults/mine")
    expect(r?.kind).toBe("path")
    expect((r as { path: string }).path).toBe(path.join(homedir(), "vaults/mine"))
  })
  test("empty / whitespace → undefined", () => {
    expect(normalizeRef("")).toBeUndefined()
    expect(normalizeRef("   ")).toBeUndefined()
  })
})

describe("attachVault", () => {
  test("non-JSON body → bad_request", async () => {
    expect(JSON.parse(await attachVault("not json"))).toEqual({ ok: false, error: "bad_request: body must be JSON {ref}" })
  })
  test("missing ref → bad_request", async () => {
    expect(JSON.parse(await attachVault(JSON.stringify({})))).toMatchObject({ ok: false })
  })
  test("local path without a marker → not_a_vault", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "vaults-root-"))
    const bare = mkdtempSync(path.join(tmpdir(), "bare-dir-"))
    const out = JSON.parse(await attachVault(JSON.stringify({ ref: bare }), root))
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/^not_a_vault:/)
  })
  test("local vault dir with a marker → symlinked into the root, ok:true", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "vaults-root-"))
    const src = mkdtempSync(path.join(tmpdir(), "src-vault-"))
    writeFileSync(path.join(src, ".amico-vault.toml"), 'kind = "personal"\nname = "src-vault"\n')
    const out = JSON.parse(await attachVault(JSON.stringify({ ref: src }), root))
    expect(out.ok).toBe(true)
    const dest = path.join(root, out.name)
    expect(existsSync(dest)).toBe(true)
    expect(lstatSync(dest).isSymbolicLink()).toBe(true)
  })
  test("duplicate mount name → exists", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "vaults-root-"))
    mkdirSync(path.join(root, "taken"))
    const out = JSON.parse(await attachVault(JSON.stringify({ ref: "/whatever/taken" }), root))
    expect(out.error).toMatch(/^exists:/)
  })
})
