import { describe, expect, test } from "bun:test"
import { isRenderable, RENDERABLE_EXTENSIONS } from "./markdown-utils"
import * as fs from "node:fs"
import * as path from "node:path"

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
// File type signal — async classification after file.read() (#925, #934)
// ---------------------------------------------------------------------------

type FileType = "text" | "binary" | "error" | "too-large" | null

const MAX_FILE_SIZE = 1_000_000

/**
 * Classify a file.read() result. When the category is image/pdf and the server
 * returns "binary", this is a RENDERABLE binary — return "text" (the pass-through
 * signal) so the category-based renderer handles it.
 */
function classifyFileType(
  readResult: { type: string; content: string; length?: number; encoding?: string; mimeType?: string } | null,
  readError: boolean,
  category?: FileCategory,
): FileType {
  if (readError) return "error"
  if (!readResult) return null
  if (readResult.type !== "text") {
    // Image/PDF binaries are rendered by the category branch, not the binary guard
    if (category === "image" || category === "pdf") return "text"
    return "binary"
  }
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

  test("returns 'binary' when type is not text (generic file)", () => {
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

  test("returns 'text' (not 'binary') for image binary — renderable (#934)", () => {
    const result = { type: "binary", content: "iVBOR...", encoding: "base64", mimeType: "image/png" }
    expect(classifyFileType(result, false, "image")).toBe("text")
  })

  test("returns 'text' (not 'binary') for PDF binary — renderable (#934)", () => {
    const result = { type: "binary", content: "JVBER...", encoding: "base64", mimeType: "application/pdf" }
    expect(classifyFileType(result, false, "pdf")).toBe("text")
  })

  test("still returns 'binary' for non-renderable binary even with category", () => {
    const result = { type: "binary", content: "", encoding: "base64", mimeType: "application/octet-stream" }
    expect(classifyFileType(result, false, "text")).toBe("binary")
  })

  test("error still takes precedence over renderable category", () => {
    expect(classifyFileType(null, true, "image")).toBe("error")
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

// ---------------------------------------------------------------------------
// Toolbar layout structural assertions (#934)
// ---------------------------------------------------------------------------

describe("toolbar layout (#934)", () => {
  const previewTabSrc = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/src/components/session/session-preview-tab.tsx"),
    "utf8",
  )
  const fileViewSrc = fs.readFileSync(
    path.resolve(__dirname, "../../../../app/src/components/session/preview-file-view.tsx"),
    "utf8",
  )

  test("zoom controls live in PreviewFileView, not SessionPreviewTab", () => {
    // SessionPreviewTab must NOT render the zoom buttons/input (aria-label)
    expect(previewTabSrc).not.toContain("Zoom out")
    expect(previewTabSrc).not.toContain("Zoom in")
    // But it must define and pass zoom/zoomIn/zoomOut as props
    expect(previewTabSrc).toContain("zoom={zoom}")

    // PreviewFileView MUST render the zoom widget
    expect(fileViewSrc).toContain("Zoom out")
    expect(fileViewSrc).toContain("Zoom in")
  })

  test("save status dot lives in SessionPreviewTab next to filename", () => {
    // The parent should render the save dot (aria-label pattern)
    expect(previewTabSrc).toMatch(/aria-label.*Sav(ing|ed)/)

    // PreviewFileView should NOT render the save dot anymore
    expect(fileViewSrc).not.toMatch(/aria-label.*Sav(ing|ed)"/)
  })

  test("PreviewFileView accepts onSaveStatusChange prop", () => {
    expect(fileViewSrc).toContain("onSaveStatusChange")
  })

  test("SessionPreviewTab passes zoomIn and zoomOut to PreviewFileView", () => {
    expect(previewTabSrc).toContain("zoomIn={zoomIn}")
    expect(previewTabSrc).toContain("zoomOut={zoomOut}")
  })

  test("image zoom uses direct CSS sizing, not transform: scale (#934)", () => {
    // Extract the image Match block (from category() === "image" to its closing </Match>)
    const imageMatchStart = fileViewSrc.indexOf('category() === "image"')
    const imageMatchEnd = fileViewSrc.indexOf("</Match>", imageMatchStart)
    const imageBlock = fileViewSrc.slice(imageMatchStart, imageMatchEnd)

    // Must NOT use transform: scale on the image wrapper
    expect(imageBlock).not.toContain("transform:")
    expect(imageBlock).not.toContain("origin-top-left")
  })

  test("image element overrides Tailwind preflight max-width and flex-shrink (#934)", () => {
    const imageMatchStart = fileViewSrc.indexOf('category() === "image"')
    const imageMatchEnd = fileViewSrc.indexOf("</Match>", imageMatchStart)
    const imageBlock = fileViewSrc.slice(imageMatchStart, imageMatchEnd)

    // base.css sets max-width: 100% on all img — max-w-none defeats it
    expect(imageBlock).toContain("max-w-none")
    // flex parent would shrink the img back — shrink-0 prevents it
    expect(imageBlock).toContain("shrink-0")
  })

  test("PDF renders a placeholder with open-in-editor action, not an iframe (#934)", () => {
    const pdfMatchStart = fileViewSrc.indexOf('category() === "pdf"')
    const pdfMatchEnd = fileViewSrc.indexOf("</Match>", pdfMatchStart)
    const pdfBlock = fileViewSrc.slice(pdfMatchStart, pdfMatchEnd)

    // Must NOT try to render a PDF inline (Chromium PDF viewer unavailable in VS Code webviews)
    expect(pdfBlock).not.toContain("<iframe")
    expect(pdfBlock).not.toContain("<embed")
    // Must have an open-in-editor action
    expect(pdfBlock).toContain("open-file")
  })

  test("zoom floor is category-aware: 100% for image/pdf, 50% for markdown/text (#934)", () => {
    // The parent (SessionPreviewTab) keeps the global floor at 50%
    expect(previewTabSrc).toContain("Math.max(z - 10, 50)")
    // PreviewFileView applies a higher floor for image/pdf in its zoom-out handler
    expect(fileViewSrc).toContain("zoomFloor")
  })

})
