import { describe, expect, test } from "bun:test"
import {
  classifyCreateError,
  gitInitNeedsNotice,
  groupSessionsByProject,
  projectNameToSlug,
  resolveCreationTarget,
} from "./home-projects"

describe("projectNameToSlug", () => {
  test("lowercases, hyphenates whitespace/underscores, strips junk, trims", () => {
    expect(projectNameToSlug("My CZ Gate")).toBe("my-cz-gate")
    expect(projectNameToSlug("  Rydberg__MIS  ")).toBe("rydberg-mis")
    expect(projectNameToSlug("Bell (state) #2!")).toBe("bell-state-2")
    expect(projectNameToSlug("a---b")).toBe("a-b")
  })
  test("names that slugify to nothing return empty", () => {
    expect(projectNameToSlug("")).toBe("")
    expect(projectNameToSlug("   ")).toBe("")
    expect(projectNameToSlug("!!!")).toBe("")
  })
})

describe("resolveCreationTarget", () => {
  test("joins parent + slug, handling a trailing slash", () => {
    expect(resolveCreationTarget({ name: "My Gate", parentDir: "/home/kate/proj" })).toEqual({
      ok: true,
      slug: "my-gate",
      path: "/home/kate/proj/my-gate",
    })
    const trailing = resolveCreationTarget({ name: "My Gate", parentDir: "/home/kate/proj/" })
    expect(trailing.ok && trailing.path).toBe("/home/kate/proj/my-gate")
  })
  test("rejects a name that slugifies to nothing", () => {
    expect(resolveCreationTarget({ name: "  ", parentDir: "/x" })).toEqual({ ok: false, reason: "empty-name" })
  })
})

describe("classifyCreateError", () => {
  test("maps errno codes to inline error kinds", () => {
    expect(classifyCreateError({ code: "EEXIST" })).toBe("collision")
    expect(classifyCreateError({ code: "EACCES" })).toBe("unwritable")
    expect(classifyCreateError({ code: "EROFS" })).toBe("unwritable")
    expect(classifyCreateError({ code: "ENOENT" })).toBe("unwritable")
    expect(classifyCreateError({ code: "EIO" })).toBe("other")
    expect(classifyCreateError(undefined)).toBe("other")
  })
  test("falls back to message text when no code", () => {
    expect(classifyCreateError({ message: "file already exists" })).toBe("collision")
    expect(classifyCreateError({ message: "permission denied" })).toBe("unwritable")
    expect(classifyCreateError({ message: "kaboom" })).toBe("other")
  })
})

describe("gitInitNeedsNotice", () => {
  test("notice iff git init did not succeed", () => {
    expect(gitInitNeedsNotice({ ok: true })).toBe(false)
    expect(gitInitNeedsNotice({ ok: false })).toBe(true)
  })
})

describe("groupSessionsByProject", () => {
  const P = (worktree: string, name = worktree) => ({ worktree, name })
  const S = (id: string, directory: string) => ({ id, directory })
  const opts = (projects: ReturnType<typeof P>[], sessions: ReturnType<typeof S>[]) => ({
    projects,
    sessions,
    projectOf: (s: ReturnType<typeof S>) => projects.find((p) => p.worktree === s.directory),
    directoryOf: (s: ReturnType<typeof S>) => s.directory,
  })

  test("nests sessions under their project, preserving orders; empty projects still appear", () => {
    const a = P("/a")
    const b = P("/b")
    const { projectGroups, orphans } = groupSessionsByProject(
      opts([a, b], [S("s1", "/a"), S("s2", "/b"), S("s3", "/a")]),
    )
    expect(projectGroups.map((g) => g.project.worktree)).toEqual(["/a", "/b"])
    expect(projectGroups[0].sessions.map((s) => s.id)).toEqual(["s1", "s3"])
    expect(projectGroups[1].sessions.map((s) => s.id)).toEqual(["s2"])
    expect(orphans).toEqual([])
  })

  test("sessions with no registered project become orphans grouped by directory (never dropped)", () => {
    const a = P("/a")
    const { projectGroups, orphans } = groupSessionsByProject(
      opts([a], [S("s1", "/a"), S("ghost1", "/tmp/x"), S("ghost2", "/tmp/x"), S("ghost3", "/tmp/y")]),
    )
    expect(projectGroups[0].sessions.map((s) => s.id)).toEqual(["s1"])
    expect(orphans.map((o) => o.directory)).toEqual(["/tmp/x", "/tmp/y"])
    expect(orphans[0].sessions.map((s) => s.id)).toEqual(["ghost1", "ghost2"])
    // every session is reachable: nothing silently dropped
    const reachable = projectGroups.flatMap((g) => g.sessions).length + orphans.flatMap((o) => o.sessions).length
    expect(reachable).toBe(4)
  })

  test("a project with no sessions appears with an empty list", () => {
    const { projectGroups, orphans } = groupSessionsByProject(opts([P("/lonely")], []))
    expect(projectGroups).toHaveLength(1)
    expect(projectGroups[0].sessions).toEqual([])
    expect(orphans).toEqual([])
  })
})
