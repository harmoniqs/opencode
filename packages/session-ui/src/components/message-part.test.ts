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

  test("paragraph breaks are no longer boundaries — one card until a section transition", () => {
    const text = "First paragraph.\n\nSecond is being writ"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([])
    expect(tail).toBe(text)
  })

  test("multiple settled paragraphs stay in one chunk", () => {
    const text = "One.\n\nTwo.\n\nThree is being writ"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([])
    expect(tail).toBe(text)
  })

  test("a heading opens a new chunk", () => {
    const text = "First para.\n\n## Section\n\nbody being writ"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["First para.\n\n"])
    expect(tail).toBe("## Section\n\nbody being writ")
  })

  test("a horizontal rule opens a new chunk", () => {
    const text = "First para.\n\n---\n\nSecond para being writ"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["First para.\n\n"])
    expect(tail).toBe("---\n\nSecond para being writ")
  })

  test("a blank line inside a code fence is not a boundary", () => {
    const text = "Intro.\n\n```py\na = 1\n\nb = 2\n```\n\nAfter the fence starts"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([])
    expect(tail).toBe(text)
  })

  test("a fence stays in its card; the heading after it opens the next one", () => {
    const text = "Intro.\n\n```py\na = 1\n\nb = 2\n```\n\n## Next\n\nmore"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual(["Intro.\n\n```py\na = 1\n\nb = 2\n```\n\n"])
    expect(tail).toBe("## Next\n\nmore")
  })

  test("lists stay in the card — no split before a list or between its items", () => {
    const text = "Steps:\n\n1. one\n\n2. two\n\n> quoted\n\nNext paragraph beg"
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([])
    expect(tail).toBe(text)
  })

  test("the size cap lands an overgrown heading-less chunk", () => {
    const first = "x".repeat(650)
    const text = `${first}\n\nnext paragraph is being writ`
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([`${first}\n\n`])
    expect(tail).toBe("next paragraph is being writ")
  })

  test("the size cap never splits between list items", () => {
    const item = "1. " + "x".repeat(650)
    const text = `${item}\n\n2. two\n\n3. three`
    const { chunks, tail } = splitSettledChunks(text)
    expect(chunks).toEqual([])
    expect(tail).toBe(text)
  })

  test("trailing blank lines do not settle the tail", () => {
    const text = "Done paragraph.\n\n"
    expect(settledChunkBoundary(text)).toBe(0)
  })
})
