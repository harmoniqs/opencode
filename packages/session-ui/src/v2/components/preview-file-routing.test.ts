import { describe, expect, test } from "bun:test"
import { isRenderable, RENDERABLE_EXTENSIONS } from "./markdown-utils"

/**
 * Tests for file-type routing, view-mode visibility, and file-type
 * classification (#925: "text" replaces "unsupported").
 */

// ---------------------------------------------------------------------------
// File type categorization for routing (#925: "text" catch-all)
// ---------------------------------------------------------------------------

type FileCategory = "markdown" | "image" | "pdf" | "text"

function getFileCategory(path: string): FileCategory {
  const dot = path.lastIndexOf(".")
  if (dot <= 0) return "text" // extensionless → text
  const ext = path.slice(dot).toLowerCase()
  if ((RENDERABLE_EXTENSIONS.markdown as readonly string[]).includes(ext)) return "markdown"
  if ((RENDERABLE_EXTENSIONS.images as readonly string[]).includes(ext)) return "image"
  if ((RENDERABLE_EXTENSIONS.pdf as readonly string[]).includes(ext)) return "pdf"
  return "text"
}

function shouldShowModeToggle(path: string): boolean {
  return getFileCategory(path) === "markdown"
}

// ---------------------------------------------------------------------------
// File type signal — async classification after file.read() (#925)
// ---------------------------------------------------------------------------

type FileType = "text" | "binary" | "error" | "too-large" | null

const MAX_FILE_SIZE = 1_000_000

function classifyFileType(
  readResult: { type: string; content: string; length?: number } | null,
  readError: boolean,
): FileType {
  if (readError) return "error"
  if (!readResult) return null
  if (readResult.type !== "text") return "binary"
  const size = readResult.length ?? readResult.content.length
  if (size > MAX_FILE_SIZE) return "too-large"
  return "text"
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

  test("classifies code/config extensions as text", () => {
    expect(getFileCategory("app.ts")).toBe("text")
    expect(getFileCategory("style.css")).toBe("text")
    expect(getFileCategory("data.json")).toBe("text")
    expect(getFileCategory("script.py")).toBe("text")
    expect(getFileCategory("page.html")).toBe("text")
  })

  test("classifies extensionless files as text", () => {
    expect(getFileCategory("Makefile")).toBe("text")
    expect(getFileCategory("Dockerfile")).toBe("text")
    expect(getFileCategory("LICENSE")).toBe("text")
    expect(getFileCategory("src/Makefile")).toBe("text")
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

  test("hides for text files", () => {
    expect(shouldShowModeToggle("app.ts")).toBe(false)
    expect(shouldShowModeToggle("Makefile")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// File type signal — classifyFileType (#925)
// ---------------------------------------------------------------------------

describe("classifyFileType", () => {
  test("returns null when no result yet (loading)", () => {
    expect(classifyFileType(null, false)).toBeNull()
  })

  test("returns 'text' for normal text content under 1 MB", () => {
    expect(classifyFileType({ type: "text", content: "hello world", length: 11 }, false)).toBe("text")
  })

  test("returns 'text' when length field is absent (uses content.length)", () => {
    expect(classifyFileType({ type: "text", content: "short" }, false)).toBe("text")
  })

  test("returns 'binary' when type is not text", () => {
    expect(classifyFileType({ type: "binary", content: "" }, false)).toBe("binary")
    expect(classifyFileType({ type: "base64", content: "AA==" }, false)).toBe("binary")
  })

  test("returns 'error' when read failed", () => {
    expect(classifyFileType(null, true)).toBe("error")
    // error takes precedence even if a result is somehow present
    expect(classifyFileType({ type: "text", content: "" }, true)).toBe("error")
  })

  test("returns 'too-large' for text content over 1 MB", () => {
    expect(classifyFileType({ type: "text", content: "", length: 1_000_001 }, false)).toBe("too-large")
  })

  test("returns 'text' for text content at exactly 1 MB", () => {
    expect(classifyFileType({ type: "text", content: "", length: 1_000_000 }, false)).toBe("text")
  })
})

// ---------------------------------------------------------------------------
// No-project fallback: isRenderable filters touchedFiles (unchanged)
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
