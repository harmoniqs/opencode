import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { isTextFile, mountDir, vaultFileBody, vaultFilesBody } from "@/server/amicode/vault-browser"

/** A vaults root with one mount ("armonia-test") holding a small vault. */
function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "vault-browser-root-"))
  const mount = path.join(root, "armonia-test")
  mkdirSync(path.join(mount, "insights"), { recursive: true })
  mkdirSync(path.join(mount, ".obsidian"), { recursive: true })
  mkdirSync(path.join(mount, "node_modules", "junk"), { recursive: true })
  writeFileSync(path.join(mount, ".amico-vault.toml"), 'kind = "personal"\nname = "armonia-test"\n')
  writeFileSync(path.join(mount, "STRATEGY.md"), "# Strategy\n")
  writeFileSync(path.join(mount, "insights", "gate-fidelity.md"), "# Gate fidelity\nSee [[STRATEGY]].\n")
  writeFileSync(path.join(mount, "insights", "pulse.bin"), Buffer.from([0, 1, 2]))
  writeFileSync(path.join(mount, ".obsidian", "workspace.json"), "{}")
  writeFileSync(path.join(mount, "node_modules", "junk", "x.js"), "junk")
  return { root, mount }
}

describe("isTextFile", () => {
  test("markdown and source are text; binaries are not", () => {
    expect(isTextFile("note.md")).toBe(true)
    expect(isTextFile("solve.jl")).toBe(true)
    expect(isTextFile("pulse.bin")).toBe(false)
    expect(isTextFile("pulse.h5")).toBe(false)
  })
})

describe("mountDir", () => {
  test("resolves by marker name, not directory basename", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vault-browser-root-"))
    mkdirSync(path.join(root, "dir-basename"))
    writeFileSync(path.join(root, "dir-basename", ".amico-vault.toml"), 'kind = "team"\nname = "real-name"\n')
    expect(mountDir("real-name", root)).toBe(path.join(root, "dir-basename"))
    expect(mountDir("dir-basename", root)).toBeUndefined()
  })
  test("unknown mount / missing root → undefined", () => {
    expect(mountDir("nope", "/does/not/exist")).toBeUndefined()
  })
})

describe("vaultFilesBody", () => {
  test("lists files recursively; skips dotfiles, .obsidian, node_modules", () => {
    const { root } = fixtureRoot()
    const out = JSON.parse(vaultFilesBody("armonia-test", root))
    expect(out.ok).toBe(true)
    const paths = out.files.map((f: { path: string }) => f.path)
    expect(paths).toEqual(["STRATEGY.md", "insights/gate-fidelity.md", "insights/pulse.bin"])
  })
  test("non-text files are listed but marked unreadable", () => {
    const { root } = fixtureRoot()
    const out = JSON.parse(vaultFilesBody("armonia-test", root))
    const bin = out.files.find((f: { path: string }) => f.path === "insights/pulse.bin")
    expect(bin.readable).toBe(false)
    const md = out.files.find((f: { path: string }) => f.path === "STRATEGY.md")
    expect(md.readable).toBe(true)
  })
  test("missing mount param / unknown mount → ok:false", () => {
    const { root } = fixtureRoot()
    expect(JSON.parse(vaultFilesBody(undefined, root)).ok).toBe(false)
    expect(JSON.parse(vaultFilesBody("ghost", root)).error).toMatch(/^not_found:/)
  })
})

describe("vaultFileBody", () => {
  test("reads a markdown file", () => {
    const { root } = fixtureRoot()
    const out = JSON.parse(vaultFileBody("armonia-test", "insights/gate-fidelity.md", root))
    expect(out.ok).toBe(true)
    expect(out.content).toContain("[[STRATEGY]]")
  })
  test("path traversal is refused even via ..", () => {
    const { root } = fixtureRoot()
    writeFileSync(path.join(root, "secret.md"), "outside")
    const out = JSON.parse(vaultFileBody("armonia-test", "../secret.md", root))
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/^forbidden:/)
  })
  test("symlink escaping the mount is refused", () => {
    const { root, mount } = fixtureRoot()
    const outside = mkdtempSync(path.join(tmpdir(), "outside-"))
    writeFileSync(path.join(outside, "leak.md"), "leak")
    symlinkSync(path.join(outside, "leak.md"), path.join(mount, "leak.md"))
    const out = JSON.parse(vaultFileBody("armonia-test", "leak.md", root))
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/^forbidden:/)
  })
  test("symlinked MOUNT still reads its own files (attachVault symlinks local vaults)", () => {
    const { root, mount } = fixtureRoot()
    const root2 = mkdtempSync(path.join(tmpdir(), "vault-browser-root2-"))
    symlinkSync(mount, path.join(root2, "linked"))
    const out = JSON.parse(vaultFileBody("armonia-test", "STRATEGY.md", root2))
    expect(out.ok).toBe(true)
    expect(out.content).toContain("# Strategy")
  })
  test("binary → not_text; missing → not_found", () => {
    const { root } = fixtureRoot()
    expect(JSON.parse(vaultFileBody("armonia-test", "insights/pulse.bin", root)).error).toMatch(/^not_text:/)
    expect(JSON.parse(vaultFileBody("armonia-test", "nope.md", root)).error).toMatch(/^not_found:/)
  })
})
