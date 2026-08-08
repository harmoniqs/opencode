import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { resolveFileRef, resolveFileBody } from "@/server/amicode/file-resolve"
import { setBindHostname } from "@/server/amicode/connections"

// Two mounts so precedence (personal outranks team) is observable; a project
// dir stands in for the server's cwd.
function fixture() {
  // realpath: the resolver's containment guard returns REAL paths, and macOS
  // tmpdir is a /var → /private/var symlink — compare like with like.
  const vaultRoot = realpathSync(mkdtempSync(path.join(tmpdir(), "file-resolve-vaults-")))
  const personal = path.join(vaultRoot, "armonia-personal")
  const team = path.join(vaultRoot, "armonissima")
  for (const [dir, marker] of [
    [personal, 'kind = "personal"\nname = "armonia-personal"\n'],
    [team, 'kind = "team"\nname = "armonissima"\n'],
  ] as const) {
    mkdirSync(path.join(dir, "insights"), { recursive: true })
    mkdirSync(path.join(dir, "amicode", "problems"), { recursive: true })
    writeFileSync(path.join(dir, ".amico-vault.toml"), marker)
  }
  // same relpath in both mounts → personal must win
  writeFileSync(path.join(personal, "insights", "shared.md"), "# personal\n")
  writeFileSync(path.join(team, "insights", "shared.md"), "# team\n")
  writeFileSync(path.join(team, "insights", "team-only.md"), "# team only\n")
  writeFileSync(path.join(personal, "amicode", "problems", "x-gate-transmon.md"), "# card\n")
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "file-resolve-proj-")))
  mkdirSync(path.join(cwd, "src"), { recursive: true })
  writeFileSync(path.join(cwd, "src", "main.ts"), "x\n")
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), "file-resolve-home-")))
  writeFileSync(path.join(home, "todo.md"), "x\n")
  return { vaultRoot, personal, team, cwd, home }
}

const opts = (f: ReturnType<typeof fixture>) => ({ vaultRoot: f.vaultRoot, cwd: f.cwd, home: f.home })

// The suite runs with no listener bound (in-process = loopback-equivalent), so
// the browse gate is open by default; the gate test restores after.
afterEach(() => setBindHostname(undefined))

describe("resolveFileRef tiers", () => {
  test("absolute paths resolve directly, files and dirs", () => {
    const f = fixture()
    const file = resolveFileRef(path.join(f.personal, "insights", "shared.md"), opts(f))
    expect(file).toEqual({ path: path.join(f.personal, "insights", "shared.md"), mount: undefined, kind: "file" })
    const dir = resolveFileRef(f.cwd, opts(f))
    expect(dir?.kind).toBe("dir")
    expect(resolveFileRef(path.join(f.cwd, "nope.md"), opts(f))).toBeUndefined()
  })

  test("~ expands against the injected home", () => {
    const f = fixture()
    expect(resolveFileRef("~/todo.md", opts(f))?.path).toBe(path.join(f.home, "todo.md"))
    expect(resolveFileRef("~/nope.md", opts(f))).toBeUndefined()
  })

  test("mount-prefixed paths resolve under that mount (and nowhere else)", () => {
    const f = fixture()
    const hit = resolveFileRef("armonissima/insights/team-only.md", opts(f))
    expect(hit).toEqual({ path: path.join(f.team, "insights", "team-only.md"), mount: "armonissima", kind: "file" })
    // a directory pill, trailing slash and all
    expect(resolveFileRef("armonissima/insights/", opts(f))).toEqual({
      path: path.join(f.team, "insights"),
      mount: "armonissima",
      kind: "dir",
    })
    // explicit mount references do NOT fall through to other tiers
    expect(resolveFileRef("armonissima/no/such/file.md", opts(f))).toBeUndefined()
    // traversal out of the mount is refused
    expect(resolveFileRef("armonissima/../../etc/hostname", opts(f))).toBeUndefined()
  })

  test("relative paths first-hit across mounts in precedence order", () => {
    const f = fixture()
    expect(resolveFileRef("insights/shared.md", opts(f))).toEqual({
      path: path.join(f.personal, "insights", "shared.md"),
      mount: "armonia-personal",
      kind: "file",
    })
    // a miss in personal falls to team
    expect(resolveFileRef("insights/team-only.md", opts(f))?.mount).toBe("armonissima")
  })

  test("relative paths fall back to the mount's amicode/ state dir, then the project dir", () => {
    const f = fixture()
    expect(resolveFileRef("problems/x-gate-transmon.md", opts(f))).toEqual({
      path: path.join(f.personal, "amicode", "problems", "x-gate-transmon.md"),
      mount: "armonia-personal",
      kind: "file",
    })
    expect(resolveFileRef("src/main.ts", opts(f))).toEqual({
      path: path.join(f.cwd, "src", "main.ts"),
      mount: undefined,
      kind: "file",
    })
    expect(resolveFileRef("src/nope.ts", opts(f))).toBeUndefined()
  })

  test("bare filenames resolve only via the typed-prefix table", () => {
    const f = fixture()
    writeFileSync(path.join(f.personal, "insights", "insight-20260804-120000-mitten.md"), "# x\n")
    expect(resolveFileRef("insight-20260804-120000-mitten.md", opts(f))?.path).toBe(
      path.join(f.personal, "insights", "insight-20260804-120000-mitten.md"),
    )
    // a bare name with no typed prefix never links into the vault, even when
    // the file exists at a mount root
    writeFileSync(path.join(f.personal, "STRATEGY.md"), "# x\n")
    expect(resolveFileRef("STRATEGY.md", opts(f))).toBeUndefined()
    expect(resolveFileRef("result.toml", opts(f))).toBeUndefined()
  })

  test("non-paths are refused", () => {
    const f = fixture()
    expect(resolveFileRef("https://example.com/x.md", opts(f))).toBeUndefined()
    expect(resolveFileRef("mailto:a@b.c", opts(f))).toBeUndefined()
    expect(resolveFileRef("", opts(f))).toBeUndefined()
    expect(resolveFileRef("  ", opts(f))).toBeUndefined()
  })
})

describe("resolveFileBody (route contract)", () => {
  test("found / not-found shapes", () => {
    expect(JSON.parse(resolveFileBody("definitely-not-a-file-anywhere.xyz")).found).toBe(false)
    expect(JSON.parse(resolveFileBody(undefined)).error).toMatch(/^bad_request: path is required/)
  })
  test("an exposed bind refuses with the forbidden body", () => {
    setBindHostname("0.0.0.0")
    expect(JSON.parse(resolveFileBody("x.md")).error).toMatch(/^forbidden: file resolution/)
  })
})
