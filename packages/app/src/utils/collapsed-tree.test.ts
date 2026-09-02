import { describe, expect, test } from "bun:test"
import { buildCollapsedTree, filterCollapsedTree } from "./collapsed-tree"

describe("buildCollapsedTree", () => {
  test("returns empty array for empty input", () => {
    expect(buildCollapsedTree([])).toEqual([])
  })

  test("handles single file at root", () => {
    const rows = buildCollapsedTree(["readme.md"])
    expect(rows).toEqual([{ type: "file", label: "readme.md", path: "readme.md", depth: 0, guides: [] }])
  })

  test("handles files in a flat directory", () => {
    const rows = buildCollapsedTree(["src/a.ts", "src/b.ts"])
    expect(rows).toHaveLength(3) // 1 dir + 2 files
    expect(rows[0]).toMatchObject({ type: "dir", label: "src/", depth: 0 })
    expect(rows[1]).toMatchObject({ type: "file", label: "a.ts", path: "src/a.ts", depth: 1 })
    expect(rows[2]).toMatchObject({ type: "file", label: "b.ts", path: "src/b.ts", depth: 1 })
  })

  test("collapses single-child directory chains", () => {
    const rows = buildCollapsedTree(["src/v2/components/foo.tsx"])
    // Single-child chain collapses: src/v2/components becomes one dir row
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: "dir", label: "src/v2/components/", depth: 0 })
    expect(rows[1]).toMatchObject({ type: "file", label: "foo.tsx", depth: 1 })
  })

  test("abbreviates long collapsed chains with /.../", () => {
    const rows = buildCollapsedTree(["a/b/c/d/e/file.ts"])
    // Chain a/b/c/d/e has 5 segments > 3, so abbreviated
    expect(rows[0].label).toMatch(/^a\/\.\.\.\/e\/$/)
  })

  test("preserves guide lines for siblings", () => {
    const rows = buildCollapsedTree(["src/a.ts", "src/b.ts", "lib/c.ts"])
    // src/ and lib/ are sibling dirs — first dir's children should have guides
    const srcDir = rows.find((r) => r.label === "src/")
    expect(srcDir).toBeDefined()
    const libDir = rows.find((r) => r.label === "lib/")
    expect(libDir).toBeDefined()
  })

  test("sorts directories before files, both alphabetically", () => {
    const rows = buildCollapsedTree(["z.ts", "a/b.ts", "m.ts"])
    expect(rows[0]).toMatchObject({ type: "dir", label: "a/" })
    expect(rows[1]).toMatchObject({ type: "file", label: "b.ts" })
    expect(rows[2]).toMatchObject({ type: "file", label: "m.ts" })
    expect(rows[3]).toMatchObject({ type: "file", label: "z.ts" })
  })
})

describe("filterCollapsedTree", () => {
  const files = ["src/app.tsx", "src/utils/helper.ts", "lib/index.ts", "README.md"]

  test("returns all files for empty query", () => {
    expect(filterCollapsedTree(files, "")).toEqual(files)
    expect(filterCollapsedTree(files, "  ")).toEqual(files)
  })

  test("filters by substring match", () => {
    expect(filterCollapsedTree(files, "utils")).toEqual(["src/utils/helper.ts"])
  })

  test("is case-insensitive", () => {
    expect(filterCollapsedTree(files, "readme")).toEqual(["README.md"])
    expect(filterCollapsedTree(files, "README")).toEqual(["README.md"])
  })

  test("matches against full path", () => {
    expect(filterCollapsedTree(files, "src")).toEqual(["src/app.tsx", "src/utils/helper.ts"])
  })

  test("returns empty for no matches", () => {
    expect(filterCollapsedTree(files, "xyz")).toEqual([])
  })
})
