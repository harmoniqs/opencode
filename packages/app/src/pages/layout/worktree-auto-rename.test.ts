import { describe, expect, test, beforeEach } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ServerScope } from "@/utils/server-scope"
import {
  slugifyTitle,
  isDefaultTitle,
  markWorktreeCreated,
  wasCreatedByUs,
  markRenamed,
  wasRenamed,
  clearRenamed,
  _resetForTesting,
} from "./worktree-auto-rename"

const legacyLayout = readFileSync(join(import.meta.dir, "..", "layout.tsx"), "utf8")
const newLayout = readFileSync(join(import.meta.dir, "..", "layout-new.tsx"), "utf8")
const submitSource = readFileSync(
  join(import.meta.dir, "..", "..", "components", "prompt-input", "submit.ts"),
  "utf8",
)
const autoRenameSource = readFileSync(join(import.meta.dir, "worktree-auto-rename.ts"), "utf8")

beforeEach(() => _resetForTesting())

describe("worktree auto-rename", () => {
  describe("slugifyTitle", () => {
    test("converts a normal title to a slug", () => {
      expect(slugifyTitle("CZ gate optimization")).toBe("cz-gate-optimization")
    })

    test("truncates to 40 characters", () => {
      const long = "A Really Long Title That Should Definitely Be Truncated Here"
      const slug = slugifyTitle(long)
      expect(slug.length).toBeLessThanOrEqual(40)
      expect(slug).toBe("a-really-long-title-that-should-definite")
    })

    test("strips leading/trailing hyphens", () => {
      expect(slugifyTitle("  --hello world--  ")).toBe("hello-world")
    })

    test("returns empty string for whitespace-only input", () => {
      expect(slugifyTitle("  ")).toBe("")
    })

    test("collapses multiple non-alphanumeric characters into one hyphen", () => {
      expect(slugifyTitle("hello!!!world???test")).toBe("hello-world-test")
    })
  })

  describe("isDefaultTitle", () => {
    test("recognises the default session placeholder", () => {
      expect(isDefaultTitle("New session - 2026-09-13T14:57:50.510Z")).toBe(true)
      expect(isDefaultTitle("New session")).toBe(true)
    })

    test("rejects real titles", () => {
      expect(isDefaultTitle("CZ gate optimization")).toBe(false)
    })

    test("treats empty / undefined as default", () => {
      expect(isDefaultTitle("")).toBe(true)
      expect(isDefaultTitle(undefined)).toBe(true)
    })
  })

  describe("worktree tracking", () => {
    const scope = ServerScope.local
    const dir = `/tmp/worktree-auto-rename-${crypto.randomUUID()}`

    test("marks and checks a created worktree", () => {
      expect(wasCreatedByUs(scope, dir)).toBe(false)
      markWorktreeCreated(scope, dir)
      expect(wasCreatedByUs(scope, dir)).toBe(true)
    })

    test("does not recognise an untracked worktree", () => {
      expect(wasCreatedByUs(scope, "/some/other/path")).toBe(false)
    })

    test("prevents duplicate renames", () => {
      expect(wasRenamed(scope, dir)).toBe(false)
      markRenamed(scope, dir)
      expect(wasRenamed(scope, dir)).toBe(true)
    })

    test("clearRenamed allows retry", () => {
      markRenamed(scope, dir)
      expect(wasRenamed(scope, dir)).toBe(true)
      clearRenamed(scope, dir)
      expect(wasRenamed(scope, dir)).toBe(false)
    })
  })

  test("mounts the auto-rename hook from both layout roots", () => {
    expect(legacyLayout).toContain('import { useWorktreeAutoRename } from "./layout/worktree-auto-rename"')
    expect(legacyLayout).toContain("useWorktreeAutoRename()")
    expect(newLayout).toContain('import { useWorktreeAutoRename } from "./layout/worktree-auto-rename"')
    expect(newLayout).toContain("useWorktreeAutoRename()")
  })

  test("submit.ts marks newly-created worktrees for auto-rename tracking", () => {
    expect(submitSource).toContain('import { markWorktreeCreated } from "@/pages/layout/worktree-auto-rename"')
    expect(submitSource).toContain("markWorktreeCreated(")
  })

  test("auto-rename module listens for session.renamed events", () => {
    expect(autoRenameSource).toContain("session.renamed")
    expect(autoRenameSource).toContain("worktree.renamed")
  })
})
