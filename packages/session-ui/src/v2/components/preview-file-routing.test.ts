import { describe, expect, test } from "bun:test"
import { isRenderable, RENDERABLE_EXTENSIONS } from "./markdown-utils"

/**
 * Tests for file-type routing and view-mode visibility (Slice 5 of #912).
 * Tests the rendering decisions: which file types get which viewer,
 * and whether the mode toggle should be visible.
 */

// ---------------------------------------------------------------------------
// File type categorization for routing
// ---------------------------------------------------------------------------

function getFileCategory(path: string): "markdown" | "image" | "pdf" | "unsupported" {
  const dot = path.lastIndexOf(".")
  if (dot <= 0) return "unsupported"
  const ext = path.slice(dot).toLowerCase()
  if ((RENDERABLE_EXTENSIONS.markdown as readonly string[]).includes(ext)) return "markdown"
  if ((RENDERABLE_EXTENSIONS.images as readonly string[]).includes(ext)) return "image"
  if ((RENDERABLE_EXTENSIONS.pdf as readonly string[]).includes(ext)) return "pdf"
  return "unsupported"
}

function shouldShowModeToggle(path: string): boolean {
  return getFileCategory(path) === "markdown"
}

// ---------------------------------------------------------------------------
// File type routing
// ---------------------------------------------------------------------------

describe("getFileCategory", () => {
  test("classifies .md as markdown", () => {
    expect(getFileCategory("README.md")).toBe("markdown")
    expect(getFileCategory("docs/guide.md")).toBe("markdown")
  })

  test("classifies .markdown as markdown", () => {
    expect(getFileCategory("notes.markdown")).toBe("markdown")
  })

  test("classifies image extensions as image", () => {
    expect(getFileCategory("photo.png")).toBe("image")
    expect(getFileCategory("logo.jpg")).toBe("image")
    expect(getFileCategory("icon.jpeg")).toBe("image")
    expect(getFileCategory("anim.gif")).toBe("image")
    expect(getFileCategory("vector.svg")).toBe("image")
    expect(getFileCategory("modern.webp")).toBe("image")
    expect(getFileCategory("favicon.ico")).toBe("image")
    expect(getFileCategory("bitmap.bmp")).toBe("image")
  })

  test("classifies .pdf as pdf", () => {
    expect(getFileCategory("paper.pdf")).toBe("pdf")
  })

  test("classifies other extensions as unsupported", () => {
    expect(getFileCategory("app.ts")).toBe("unsupported")
    expect(getFileCategory("style.css")).toBe("unsupported")
  })

  test("case-insensitive", () => {
    expect(getFileCategory("FILE.MD")).toBe("markdown")
    expect(getFileCategory("IMAGE.PNG")).toBe("image")
    expect(getFileCategory("DOC.PDF")).toBe("pdf")
  })
})

// ---------------------------------------------------------------------------
// Mode toggle visibility
// ---------------------------------------------------------------------------

describe("shouldShowModeToggle", () => {
  test("shows for markdown files", () => {
    expect(shouldShowModeToggle("README.md")).toBe(true)
    expect(shouldShowModeToggle("notes.markdown")).toBe(true)
  })

  test("hides for image files", () => {
    expect(shouldShowModeToggle("photo.png")).toBe(false)
    expect(shouldShowModeToggle("logo.jpg")).toBe(false)
  })

  test("hides for PDF files", () => {
    expect(shouldShowModeToggle("paper.pdf")).toBe(false)
  })

  test("hides for unsupported files", () => {
    expect(shouldShowModeToggle("app.ts")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// No-project fallback: isRenderable filters touchedFiles
// ---------------------------------------------------------------------------

describe("no-project fallback filtering", () => {
  test("filters touchedFiles to renderable only", () => {
    const touched = [
      "README.md",
      "src/app.ts",
      "docs/diagram.png",
      "style.css",
      "paper.pdf",
    ]
    const renderable = touched.filter(isRenderable)
    expect(renderable).toEqual(["README.md", "docs/diagram.png", "paper.pdf"])
  })

  test("handles empty touchedFiles", () => {
    const renderable = ([] as string[]).filter(isRenderable)
    expect(renderable).toEqual([])
  })
})
