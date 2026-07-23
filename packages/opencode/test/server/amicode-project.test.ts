import { describe, expect, test } from "bun:test"
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  slugify,
  planCreate,
  classifyFsError,
  createProjectAt,
  createProject,
  defaultParentDir,
  listProjectDirs,
  listProjects,
} from "@/server/amicode/project"

describe("slugify (server, mirrors app projectNameToSlug)", () => {
  test("normalizes to a safe folder basename", () => {
    expect(slugify("My CZ Gate")).toBe("my-cz-gate")
    expect(slugify("Bell (state) #2!")).toBe("bell-state-2")
    expect(slugify("  ")).toBe("")
  })
  test("cannot produce a path traversal", () => {
    expect(slugify("../../etc")).toBe("etc")
    expect(slugify("a/../b")).toBe("ab")
  })
})

describe("planCreate", () => {
  test("rejects an empty name and a provided-but-relative parent", () => {
    expect(planCreate(JSON.stringify({ name: "  ", parentDir: "/abs" }))).toMatchObject({ ok: false, error: "empty-name" })
    expect(planCreate(JSON.stringify({ name: "X", parentDir: "rel/ative" }))).toMatchObject({ ok: false, error: "bad-parent" })
    expect(planCreate("not json")).toMatchObject({ ok: false, error: "other" })
  })
  test("no parent → the server default (~/AmicodeProjects)", () => {
    expect(planCreate(JSON.stringify({ name: "X" }))).toEqual({
      target: path.join(defaultParentDir(), "x"),
      slug: "x",
    })
  })
  test("joins an absolute parent with the slug", () => {
    expect(planCreate(JSON.stringify({ name: "My Gate", parentDir: "/home/kate/p" }))).toEqual({
      target: "/home/kate/p/my-gate",
      slug: "my-gate",
    })
  })
})

describe("classifyFsError", () => {
  test("maps codes to inline kinds", () => {
    expect(classifyFsError({ code: "EEXIST" })).toBe("collision")
    expect(classifyFsError({ code: "EACCES" })).toBe("unwritable")
    expect(classifyFsError({ code: "EIO" })).toBe("other")
    expect(classifyFsError(undefined)).toBe("other")
  })
})

describe("createProjectAt (injected deps — no real fs/git)", () => {
  test("collision when the target already exists", () => {
    const r = createProjectAt("/p/x", "x", { exists: () => true })
    expect(r).toMatchObject({ ok: false, error: "collision" })
  })
  test("created + git initialized on the happy path", () => {
    let made = ""
    const r = createProjectAt("/p/x", "x", { exists: () => false, mkdir: (p) => void (made = p), gitInit: () => true })
    expect(made).toBe("/p/x")
    expect(r).toEqual({ ok: true, path: "/p/x", slug: "x", gitInitialized: true })
  })
  test("created WITHOUT git when git init fails or git is absent (best-effort, AC4)", () => {
    const r = createProjectAt("/p/x", "x", {
      exists: () => false,
      mkdir: () => {},
      gitInit: () => {
        throw new Error("git: command not found")
      },
    })
    expect(r).toEqual({ ok: true, path: "/p/x", slug: "x", gitInitialized: false })
  })
  test("unwritable when mkdir throws EACCES — no project created", () => {
    const r = createProjectAt("/p/x", "x", {
      exists: () => false,
      mkdir: () => {
        const e = new Error("denied") as Error & { code?: string }
        e.code = "EACCES"
        throw e
      },
    })
    expect(r).toMatchObject({ ok: false, error: "unwritable" })
  })
})

describe("createProject (end-to-end against a real temp dir)", () => {
  test("creates a real directory and best-effort git-inits it", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "amicode-proj-"))
    const out = JSON.parse(createProject(JSON.stringify({ name: "Rydberg MIS", parentDir: parent })))
    expect(out.ok).toBe(true)
    expect(out.slug).toBe("rydberg-mis")
    expect(existsSync(path.join(parent, "rydberg-mis"))).toBe(true)
    // second create at the same name collides
    const dup = JSON.parse(createProject(JSON.stringify({ name: "Rydberg MIS", parentDir: parent })))
    expect(dup).toMatchObject({ ok: false, error: "collision" })
  })
})

describe("listProjectDirs (injected deps)", () => {
  test("returns [] when the parent doesn't exist yet (before the first create)", () => {
    expect(listProjectDirs("/nope", { exists: () => false })).toEqual([])
  })
  test("keeps only directories, drops dotfiles and files, name-sorted, absolute paths", () => {
    const entries = [
      { name: "kate-test-3", isDirectory: true },
      { name: "kate-test", isDirectory: true },
      { name: ".DS_Store", isDirectory: false },
      { name: ".hidden-dir", isDirectory: true },
      { name: "notes.md", isDirectory: false },
      { name: "kate-test-2", isDirectory: true },
    ]
    expect(listProjectDirs("/home/kate/AmicodeProjects", { exists: () => true, readEntries: () => entries })).toEqual([
      { slug: "kate-test", path: "/home/kate/AmicodeProjects/kate-test" },
      { slug: "kate-test-2", path: "/home/kate/AmicodeProjects/kate-test-2" },
      { slug: "kate-test-3", path: "/home/kate/AmicodeProjects/kate-test-3" },
    ])
  })
})

describe("listProjectDirs / listProjects (real temp dir)", () => {
  test("enumerates the folders a user created — surfaces a created-but-never-opened folder", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "amicode-list-"))
    mkdirSync(path.join(parent, "kate-test-2"))
    mkdirSync(path.join(parent, "kate-test-3"))
    writeFileSync(path.join(parent, "loose-file.txt"), "x")
    const dirs = listProjectDirs(parent)
    expect(dirs.map((d) => d.slug)).toEqual(["kate-test-2", "kate-test-3"])

    const body = JSON.parse(listProjects(parent))
    expect(body.ok).toBe(true)
    expect(body.parentDir).toBe(parent)
    expect(body.projects.map((p: { slug: string }) => p.slug)).toEqual(["kate-test-2", "kate-test-3"])
  })
  test("listProjects degrades to an empty list rather than throwing", () => {
    // defaultParentDir may not exist in CI; listProjects must still return ok:true.
    const body = JSON.parse(listProjects())
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.projects)).toBe(true)
    expect(body.parentDir).toBe(defaultParentDir())
  })
})
