import { marked, type Tokens } from "marked"
import remend from "remend"

export type Block = {
  raw: string
  src: string
  mode: "full" | "live"
}

function refs(text: string) {
  return /^\[[^\]]+\]:\s+\S+/m.test(text) || /^\[\^[^\]]+\]:\s+/m.test(text)
}

function open(raw: string) {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
  if (!match) return false
  const mark = match[1]
  if (!mark) return false
  const char = mark[0]
  const size = mark.length
  const last = raw.trimEnd().split("\n").at(-1)?.trim() ?? ""
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(last)
}

function heal(text: string) {
  return remend(text, { linkMode: "text-only" })
}

// marked-katex only tokenizes $$…$$ display math in two shapes: all on one line
// (its inline rule's body class [^\\\n] forbids newlines) or with the $$ alone
// on their own lines (its block rule needs ^$$\n … \n$$). LLMs routinely emit a
// third shape — `label: $$\n…\n$$`, opening mid-line with a multi-line body —
// which matches NEITHER, so the span falls through to markdown, which then eats
// the LaTeX backslash-escapes (\; → ;, \! → !, \text → text) and renders a raw,
// mangled `$$ … $$`. Normalize every complete display-math span onto its own
// block lines so the block rule always matches. Fenced/inline code is skipped
// so LaTeX shown as code stays literal; an unclosed trailing `$$` (mid-stream)
// has no match and is left untouched until its closer arrives.
export function normalizeDisplayMath(text: string): string {
  const codePattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g
  return text
    .split(codePattern)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/\$\$([\s\S]*?)\$\$/g, (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`),
    )
    .join("")
}

export function stream(text: string, live: boolean) {
  if (!live) return [{ raw: text, src: text, mode: "full" }] satisfies Block[]
  const src = heal(text)
  if (refs(text)) return [{ raw: text, src, mode: "live" }] satisfies Block[]
  const tokens = marked.lexer(text)
  const tail = tokens.findLastIndex((token) => token.type !== "space")
  if (tail < 0) return [{ raw: text, src, mode: "live" }] satisfies Block[]
  const last = tokens[tail]
  if (!last || last.type !== "code") return [{ raw: text, src, mode: "live" }] satisfies Block[]
  const code = last as Tokens.Code
  if (!open(code.raw)) return [{ raw: text, src, mode: "live" }] satisfies Block[]
  const head = tokens
    .slice(0, tail)
    .map((token) => token.raw)
    .join("")
  if (!head) return [{ raw: code.raw, src: code.raw, mode: "live" }] satisfies Block[]
  return [
    { raw: head, src: heal(head), mode: "live" },
    { raw: code.raw, src: code.raw, mode: "live" },
  ] satisfies Block[]
}
