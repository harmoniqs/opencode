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

describe("splitSettledChunks", () => {

  test("no boundary while a single paragraph streams", () => {
    const text = "The first paragraph is still being"
    expect(settledChunkBoundary(text)).toBe(0)
    expect(splitSettledChunks(text)).toEqual({ chunks: [], tail: text })
  })

  test("a paragraph settles once the next one has started", () => {
    const text = "First paragraph.\n\nSecond is being writ"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["First paragraph.\n\n"])
    expect(tail).toBe("Second is being writ")
  })

  test("multiple settled paragraphs split at every boundary", () => {
    const text = "One.\n\nTwo.\n\nThree is being writ"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["One.\n\n", "Two.\n\n"])
    expect(tail).toBe("Three is being writ")
  })

  test("a blank line inside a code fence is not a boundary", () => {
    const text = "Intro.\n\n```py\na = 1\n\nb = 2\n```\n\nAfter the fence starts"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["Intro.\n\n", "```py\na = 1\n\nb = 2\n```\n\n"])
    expect(tail).toBe("After the fence starts")
  })

  test("a label followed by a list keeps everything in one chunk, never splits between items", () => {
    const text = "Steps:\n\n1. one\n\n2. two\n\n> quoted\n\nNext paragraph beg"
    const { chunks, tail } = splitSettledChunks(text)
    // "Steps:" is a short label — stays glued; list items stay together via continuation guard
    expect(chunks).toEqual(["Steps:\n\n1. one\n\n2. two\n\n> quoted\n\n"])
    expect(tail).toBe("Next paragraph beg")
  })

  test("trailing blank lines do not settle the tail", () => {
    const text = "Done paragraph.\n\n"
    expect(settledChunkBoundary(text)).toBe(0)
  })

  test("a short label (<40 chars ending with colon) stays with the following content", () => {
    const text = "Results:\n\n- item 1\n- item 2\n\nNext paragraph"
    const { chunks, tail } = splitSettledChunks(text)
    // "Results:" is a label — stays glued to its content, no split after it
    expect(chunks).toEqual(["Results:\n\n- item 1\n- item 2\n\n"])
    expect(tail).toBe("Next paragraph")
  })

  test("a short label followed by a paragraph stays in one chunk", () => {
    const text = "Summary:\n\nThis is the summary text.\n\nAnother section begins"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["Summary:\n\nThis is the summary text.\n\n"])
    expect(tail).toBe("Another section begins")
  })

  test("a long line (>40 chars) ending with colon still splits normally", () => {
    const text = "This is a complete sentence that happens to end with a colon:\n\nNext content"
    const { chunks, tail } = splitSettledChunks(text)
    // 62 chars — too long to be a label, splits normally
    expect(chunks).toEqual(["This is a complete sentence that happens to end with a colon:\n\n"])
    expect(tail).toBe("Next content")
  })

  test("whitespace-only chunks are never emitted", () => {
    // Even if boundaries produce a whitespace segment, it should be filtered
    const text = "Before.\n\n   \n\nAfter begins"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks.every(c => c.trim() !== "")).toBe(true)
  })
})
