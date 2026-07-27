import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { browseAllowed, mountBrowseRefusal, mountMeta, isTextFile, mountDir, vaultFileBody, vaultFilesBody } from "@/server/amicode/vault-browser"
import { setBindHostname } from "@/server/amicode/connections"

// The suite runs with no listener bound (bindHostname undefined = in-process,
// loopback-equivalent), so the browse gate is open by default; gate tests
// simulate exposed binds explicitly and restore after.
afterEach(() => setBindHostname(undefined))

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

describe("browse gates (proprietary vaults never serve off-box)", () => {
  test("loopback / in-process binds may browse; exposed binds may not", () => {
    expect(browseAllowed({})).toBe(true) // undefined bind = in-process
    setBindHostname("127.0.0.1")
    expect(browseAllowed({})).toBe(true)
    setBindHostname("0.0.0.0")
    expect(browseAllowed({})).toBe(false)
    setBindHostname("192.168.1.20")
    expect(browseAllowed({})).toBe(false)
  })
  test("AMICO_VAULT_BROWSER overrides in both directions", () => {
    setBindHostname("0.0.0.0")
    expect(browseAllowed({ AMICO_VAULT_BROWSER: "1" })).toBe(true)
    setBindHostname("127.0.0.1")
    expect(browseAllowed({ AMICO_VAULT_BROWSER: "0" })).toBe(false)
  })
  test("an exposed bind refuses both routes with the forbidden body", () => {
    const { root } = fixtureRoot()
    setBindHostname("0.0.0.0")
    expect(JSON.parse(vaultFilesBody("armonia-test", root)).error).toMatch(/^forbidden: vault browsing/)
    expect(JSON.parse(vaultFileBody("armonia-test", "STRATEGY.md", root)).error).toMatch(/^forbidden: vault browsing/)
  })
  test("browse = false in the marker darkens the mount for listing AND reads", () => {
    const { root, mount } = fixtureRoot()
    writeFileSync(path.join(mount, ".amico-vault.toml"), 'kind = "personal"\nname = "armonia-test"\nbrowse = false\n')
    expect(mountMeta(mount).browse).toBe(false)
    expect(JSON.parse(vaultFilesBody("armonia-test", root)).error).toMatch(/^forbidden: vault "armonia-test" opts out/)
    expect(JSON.parse(vaultFileBody("armonia-test", "STRATEGY.md", root)).error).toMatch(/^forbidden:/)
  })
})

describe("fail-closed by kind (Aaron 2026-07-27): shared vaults ship dark", () => {
  const marker = (mount: string, body: string) => writeFileSync(path.join(mount, ".amico-vault.toml"), body)
  test("team/project/engagement/unknown kinds refuse by default; browse = true is the opt-in", () => {
    const { root, mount } = fixtureRoot()
    for (const kind of ["team", "project", "engagement", "restricted", ""]) {
      marker(mount, `kind = "${kind}"\nname = "armonia-test"\n`)
      const out = JSON.parse(vaultFilesBody("armonia-test", root))
      expect(out.ok).toBe(false)
      expect(out.error).toMatch(/browsing is opt-in for shared vaults/)
    }
    marker(mount, 'kind = "team"\nname = "armonia-test"\nbrowse = true\n')
    expect(JSON.parse(vaultFilesBody("armonia-test", root)).ok).toBe(true)
  })
  test("personal and public stay browsable by default", () => {
    const { root, mount } = fixtureRoot()
    for (const kind of ["personal", "public"]) {
      marker(mount, `kind = "${kind}"\nname = "armonia-test"\n`)
      expect(JSON.parse(vaultFilesBody("armonia-test", root)).ok).toBe(true)
    }
  })
  test("AMICO_VAULT_BROWSER=public serves ONLY public mounts, markers ignored (hackathon boxes)", () => {
    const { mount } = fixtureRoot()
    const env = { AMICO_VAULT_BROWSER: "public" }
    marker(mount, 'kind = "team"\nname = "armonia-test"\nbrowse = true\n')
    expect(mountBrowseRefusal("armonia-test", mount, env)).toMatch(/serves public vaults only/)
    marker(mount, 'kind = "personal"\nname = "armonia-test"\n')
    expect(mountBrowseRefusal("armonia-test", mount, env)).toMatch(/serves public vaults only/)
    marker(mount, 'kind = "public"\nname = "armonia-test"\n')
    expect(mountBrowseRefusal("armonia-test", mount, env)).toBeUndefined()
    // and =public also opens the deployment gate (the boxes are exposed binds)
    setBindHostname("0.0.0.0")
    expect(browseAllowed(env)).toBe(true)
  })
})

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
  test("duplicate marker names: the dir actually named like the id wins", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vault-browser-root-"))
    for (const base of ["alpha", "dup"]) {
      mkdirSync(path.join(root, base))
      writeFileSync(path.join(root, base, ".amico-vault.toml"), 'kind = "personal"\nname = "dup"\n')
    }
    expect(mountDir("dup", root)).toBe(path.join(root, "dup"))
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
  test("a symlinked dir escaping the mount is not listed (no metadata leak)", () => {
    const { root, mount } = fixtureRoot()
    const outside = mkdtempSync(path.join(tmpdir(), "outside-"))
    writeFileSync(path.join(outside, "secret-notes.md"), "outside")
    symlinkSync(outside, path.join(mount, "escape"))
    const out = JSON.parse(vaultFilesBody("armonia-test", root))
    const paths = out.files.map((f: { path: string }) => f.path)
    expect(paths.some((p: string) => p.startsWith("escape/"))).toBe(false)
  })
  test("a symlink staying inside the mount is still listed", () => {
    const { root, mount } = fixtureRoot()
    symlinkSync(path.join(mount, "insights"), path.join(mount, "insights-link"))
    const out = JSON.parse(vaultFilesBody("armonia-test", root))
    const paths = out.files.map((f: { path: string }) => f.path)
    expect(paths).toContain("insights-link/gate-fidelity.md")
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
    const { mount } = fixtureRoot()
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
