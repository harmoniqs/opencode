import { describe, expect, test } from "bun:test"
import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import { stream, normalizeDisplayMath } from "./markdown-stream"

describe("markdown stream", () => {
  test("heals incomplete emphasis while streaming", () => {
    expect(stream("hello **world", true)).toEqual([{ raw: "hello **world", src: "hello **world**", mode: "live" }])
    expect(stream("say `code", true)).toEqual([{ raw: "say `code", src: "say `code`", mode: "live" }])
  })

  test("keeps incomplete links non-clickable until they finish", () => {
    expect(stream("see [docs](https://example.com/gu", true)).toEqual([
      { raw: "see [docs](https://example.com/gu", src: "see docs", mode: "live" },
    ])
  })

  test("splits an unfinished trailing code fence from stable content", () => {
    expect(stream("before\n\n```ts\nconst x = 1", true)).toEqual([
      { raw: "before\n\n", src: "before\n\n", mode: "live" },
      { raw: "```ts\nconst x = 1", src: "```ts\nconst x = 1", mode: "live" },
    ])
  })

  test("keeps reference-style markdown as one block", () => {
    expect(stream("[docs][1]\n\n[1]: https://example.com", true)).toEqual([
      {
        raw: "[docs][1]\n\n[1]: https://example.com",
        src: "[docs][1]\n\n[1]: https://example.com",
        mode: "live",
      },
    ])
  })
})

describe("normalizeDisplayMath", () => {
  const katexMarked = marked.use(markedKatex({ throwOnError: false, nonStandard: true }))
  const renders = async (src: string) => (await katexMarked.parse(normalizeDisplayMath(src))).includes("katex")

  test("moves mid-line-opened, multi-line display math onto its own block lines", () => {
    // The exact shape LLMs emit and marked-katex silently drops (matches neither
    // the newline-free inline rule nor the ^$$-alone block rule).
    expect(normalizeDisplayMath("label: $$\n\\rho = 1\n$$")).toBe("label: \n\n$$\n\\rho = 1\n$$\n\n")
    expect(normalizeDisplayMath("a: $$ x\n= y $$ b")).toBe("a: \n\n$$\nx\n= y\n$$\n\n b")
  })

  test("the normalized output actually renders where the raw form does not", async () => {
    // Regression guard for the raw-$$-with-stripped-backslashes bug.
    expect(await katexMarked.parse("label: $$\n\\rho \\;=\\; 1\n$$")).not.toContain("katex") // raw form fails
    expect(await renders("label: $$\n\\rho \\;=\\; 1\n$$")).toBe(true)
    expect(await renders("a: $$ x\n= y $$")).toBe(true)
  })

  test("does not regress one-line inline or single-dollar math", async () => {
    expect(await renders("value $$ x = 1 $$ here")).toBe(true)
    expect(await renders("value $\\alpha$ here")).toBe(true)
  })

  test("leaves $$ inside fenced or inline code untouched", () => {
    expect(normalizeDisplayMath("```\n$$ not math $$\n```")).toBe("```\n$$ not math $$\n```")
    expect(normalizeDisplayMath("use `$$ x $$` inline")).toBe("use `$$ x $$` inline")
  })

  test("leaves an unclosed trailing $$ (mid-stream) untouched", () => {
    expect(normalizeDisplayMath("label: $$\n\\rho = 1")).toBe("label: $$\n\\rho = 1")
  })
})
