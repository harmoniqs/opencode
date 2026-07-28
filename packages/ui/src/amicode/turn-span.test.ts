import { describe, expect, test } from "bun:test"
import { amicoSpan, isAmicoTool, spanMarkAt } from "./turn-span"

/** Reads a row layout as a boolean mask. `A` = one of Amico's own rows, `.` = anything else. */
const mask = (s: string) => [...s].map((c) => c === "A")

describe("isAmicoTool", () => {
  test("amicode_* tools are Amico's rows", () => {
    expect(isAmicoTool("amicode_recommend")).toBe(true)
    expect(isAmicoTool("amicode_solve")).toBe(true)
  })

  test("a skill is one of Amico's rows — skills are its own repertoire", () => {
    expect(isAmicoTool("skill")).toBe(true)
  })

  test("ordinary tools are not", () => {
    for (const t of ["bash", "read", "grep", "webfetch", "task"]) expect(isAmicoTool(t)).toBe(false)
  })

  test("a tool merely CONTAINING the prefix does not count", () => {
    expect(isAmicoTool("run_amicode_thing")).toBe(false)
  })
})

describe("amicoSpan", () => {
  test("spans the PROSE between two chips, not just the chips", () => {
    // The case that invalidated the spec's original "consecutive rows" wording: real
    // transcripts interleave chips with Amico narrating its own work, so a span that
    // only covered adjacent chips would never cover more than one row.
    expect(amicoSpan(mask(".A.A."))).toEqual({ start: 1, end: 3 })
  })

  test("leading and trailing non-Amico rows stay outside", () => {
    expect(amicoSpan(mask(".A."))).toEqual({ start: 1, end: 1 })
    expect(amicoSpan(mask("..AA.."))).toEqual({ start: 2, end: 3 })
  })

  test("ordinary tool rows inside the span are still inside it", () => {
    // Deliberate: the rail brackets a stretch of Amico activity, not a filtered subset.
    // A bash call between two receipts happened DURING Amico's work.
    expect(amicoSpan(mask("A..A"))).toEqual({ start: 0, end: 3 })
  })

  test("a single Amico row spans only itself", () => {
    expect(amicoSpan(mask("A"))).toEqual({ start: 0, end: 0 })
    expect(amicoSpan(mask("...A..."))).toEqual({ start: 3, end: 3 })
  })

  test("no Amico rows at all → no span, so the caller renders exactly as before", () => {
    expect(amicoSpan(mask("...."))).toBeUndefined()
  })

  test("empty input → no span", () => {
    expect(amicoSpan([])).toBeUndefined()
  })

  test("the whole turn being Amico's is a span over everything", () => {
    expect(amicoSpan(mask("AAA"))).toEqual({ start: 0, end: 2 })
  })
})

describe("spanMarkAt", () => {
  /** The whole mask's marks in order, with `-` for rows outside the span. */
  const marks = (s: string) => {
    const rows = mask(s)
    const span = amicoSpan(rows)
    return rows.map((_, i) => spanMarkAt(i, span) ?? "-").join(",")
  }

  test("a multi-row span is start … mid … end", () => {
    expect(marks(".A.A.")).toBe("-,start,mid,end,-")
  })

  test("adjacent chips need no mid", () => {
    expect(marks("AA")).toBe("start,end")
  })

  test("a one-row span is 'only', never 'start'", () => {
    // The reason this is not a boolean: CSS has to distinguish a lone chip from a span's head.
    expect(marks(".A.")).toBe("-,only,-")
  })

  test("rows outside the span get no mark", () => {
    expect(marks("..A..")).toBe("-,-,only,-,-")
    expect(marks("....")).toBe("-,-,-,-")
  })

  test("no span → every row unmarked, whatever the index", () => {
    expect(spanMarkAt(0, undefined)).toBeUndefined()
    expect(spanMarkAt(99, undefined)).toBeUndefined()
  })
})
