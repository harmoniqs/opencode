import { describe, expect, test } from "bun:test"
import {
  parseBreadcrumbSegments,
  searchRenderableFiles,
  type BreadcrumbSegment,
} from "./preview-search-utils"

/**
 * Tests for breadcrumb parsing and file search (Slice 3 of #912).
 */

// ---------------------------------------------------------------------------
// parseBreadcrumbSegments — extract clickable segments from a path
// ---------------------------------------------------------------------------

describe("parseBreadcrumbSegments", () => {
  test("root path returns single root segment", () => {
    const segments = parseBreadcrumbSegments("")
    expect(segments).toHaveLength(1)
    expect(segments[0]).toEqual({ label: "~", path: "" })
  })

  test("single-level path returns root + one segment", () => {
    const segments = parseBreadcrumbSegments("src")
    expect(segments).toHaveLength(2)
    expect(segments[0]).toEqual({ label: "~", path: "" })
    expect(segments[1]).toEqual({ label: "src", path: "src" })
  })

  test("multi-level path returns all segments", () => {
    const segments = parseBreadcrumbSegments("src/components/session")
    expect(segments).toHaveLength(4)
    expect(segments[0]).toEqual({ label: "~", path: "" })
    expect(segments[1]).toEqual({ label: "src", path: "src" })
    expect(segments[2]).toEqual({ label: "components", path: "src/components" })
    expect(segments[3]).toEqual({ label: "session", path: "src/components/session" })
  })
})

// ---------------------------------------------------------------------------
// searchRenderableFiles — substring filter on renderable paths
// ---------------------------------------------------------------------------

describe("searchRenderableFiles", () => {
  const paths = [
    "README.md",
    "src/components/session/README.md",
    "docs/guide.md",
    "docs/images/diagram.png",
    "docs/api.md",
    "docs/paper.pdf",
  ]

  test("empty query returns empty array", () => {
    expect(searchRenderableFiles("", paths)).toEqual([])
  })

  test("matches substring case-insensitively", () => {
    const results = searchRenderableFiles("readme", paths)
    expect(results).toHaveLength(2)
    expect(results).toContain("README.md")
    expect(results).toContain("src/components/session/README.md")
  })

  test("matches against full relative path", () => {
    const results = searchRenderableFiles("components/session", paths)
    expect(results).toHaveLength(1)
    expect(results[0]).toBe("src/components/session/README.md")
  })

  test("matches file extension", () => {
    const results = searchRenderableFiles(".png", paths)
    expect(results).toHaveLength(1)
    expect(results[0]).toBe("docs/images/diagram.png")
  })

  test("matches pdf files", () => {
    const results = searchRenderableFiles("pdf", paths)
    expect(results).toHaveLength(1)
    expect(results[0]).toBe("docs/paper.pdf")
  })

  test("returns empty for no matches", () => {
    expect(searchRenderableFiles("nonexistent", paths)).toEqual([])
  })

  test("handles special regex characters in query safely", () => {
    // Should not throw
    expect(searchRenderableFiles("file(1)", paths)).toEqual([])
    expect(searchRenderableFiles("[test]", paths)).toEqual([])
  })
})
