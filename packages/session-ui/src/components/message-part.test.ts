import { describe, expect, test } from "bun:test"
import { readPartText, settledChunkBoundary, splitSettledChunks } from "./message-part-text"

describe("readPartText", () => {
  test("returns empty string when accum is undefined and part text is undefined", () => {
    expect(readPartText(undefined, { id: "part_1" })).toBe("")
  })

  test("returns trimmed part text when accum is undefined", () => {
    expect(readPartText(undefined, { id: "part_1", text: "  hello  " })).toBe("hello")
  })

  test("prefers accum value over part text when accum has a hit", () => {
    expect(readPartText({ part_1: "  from accum  " }, { id: "part_1", text: "from part" })).toBe("from accum")
  })

  test("falls back to part text when accum misses", () => {
    expect(readPartText({ other_part: "ignored" }, { id: "part_1", text: "  from part  " })).toBe("from part")
  })

  test("returns empty string for whitespace-only text", () => {
    expect(readPartText(undefined, { id: "part_1", text: "   \n\t  " })).toBe("")
  })

  test("trims leading and trailing whitespace", () => {
    expect(readPartText(undefined, { id: "part_1", text: "\n  body  \n" })).toBe("body")
  })
})

describe("splitSettledChunks — heading-anchored segmentation", () => {

  test("no headings → single chunk (whole text) on completion", () => {
    const text = "Just a paragraph.\n\nAnother paragraph.\n\nNo headings here."
    const { chunks, tail } = splitSettledChunks(text)
    // No heading means no boundary — everything stays in the tail while streaming
    expect(chunks).toEqual([])
    expect(tail).toBe(text)
  })

  test("heading splits text into sections", () => {
    const text = "Intro paragraph.\n\n## Section One\n\nBody of section one.\n\n## Section Two\n\nBody of two."
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([
      "Intro paragraph.\n\n",
      "## Section One\n\nBody of section one.\n\n",
    ])
    expect(tail).toBe("## Section Two\n\nBody of two.")
  })

  test("heading at the very start creates no empty intro chunk", () => {
    const text = "## First\n\nBody one.\n\n## Second\n\nBody two."
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["## First\n\nBody one.\n\n"])
    expect(tail).toBe("## Second\n\nBody two.")
  })

  test("### sub-headings are also boundaries", () => {
    const text = "## Main\n\nIntro.\n\n### Sub\n\nDetails.\n\n### Another Sub\n\nMore."
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([
      "## Main\n\nIntro.\n\n",
      "### Sub\n\nDetails.\n\n",
    ])
    expect(tail).toBe("### Another Sub\n\nMore.")
  })

  test("heading inside a code fence is not a boundary", () => {
    const text = "## Real Section\n\n```md\n## Not a heading\n\nJust code\n```\n\n## Next Section\n\nBody."
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([
      "## Real Section\n\n```md\n## Not a heading\n\nJust code\n```\n\n",
    ])
    expect(tail).toBe("## Next Section\n\nBody.")
  })

  test("--- horizontal rules do not create boundaries or empty cards", () => {
    const text = "## Section\n\nParagraph one.\n\n---\n\nParagraph two.\n\n## Next\n\nBody."
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([
      "## Section\n\nParagraph one.\n\n---\n\nParagraph two.\n\n",
    ])
    expect(tail).toBe("## Next\n\nBody.")
  })

  test("display math stays with its section", () => {
    const text = "## Math Section\n\nThe fidelity is:\n\n$$F = |\\langle\\psi|\\phi\\rangle|^2$$\n\nWhich means...\n\n## Conclusion\n\nDone."
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([
      "## Math Section\n\nThe fidelity is:\n\n$$F = |\\langle\\psi|\\phi\\rangle|^2$$\n\nWhich means...\n\n",
    ])
    expect(tail).toBe("## Conclusion\n\nDone.")
  })

  test("trailing content with no following heading stays as tail (streaming)", () => {
    const text = "## Section\n\nThis is still being written"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([])
    expect(tail).toBe("## Section\n\nThis is still being written")
  })

  test("settledChunkBoundary returns 0 when no heading boundary exists", () => {
    expect(settledChunkBoundary("Just text, no headings")).toBe(0)
    expect(settledChunkBoundary("Still streaming...")).toBe(0)
  })

  test("settledChunkBoundary returns offset of last boundary", () => {
    const text = "Intro.\n\n## One\n\nBody.\n\n## Two\n\nTail."
    const boundary = settledChunkBoundary(text)
    // Should point to where "## Two" starts
    expect(text.slice(boundary)).toBe("## Two\n\nTail.")
  })

  test("whitespace-only chunks are never emitted", () => {
    const text = "## A\n\nContent.\n\n\n\n## B\n\nMore."
    const { chunks } = splitSettledChunks(text)
    expect(chunks.every(c => c.trim() !== "")).toBe(true)
  })

  test("single # heading is a boundary", () => {
    const text = "# Title\n\nIntro.\n\n## Section\n\nBody."
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["# Title\n\nIntro.\n\n"])
    expect(tail).toBe("## Section\n\nBody.")
  })
})
