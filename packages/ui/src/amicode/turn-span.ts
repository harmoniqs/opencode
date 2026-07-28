// AMICODE: which rendered rows fall inside Amico's stretch of a turn — the span the
// transcript spine brackets (message-part.tsx draws it, amicode.css styles it).
// Spec: spec-20260728-104232-amicode-working-indicator-harmonic-wave §4.
//
// Fork convention (thinking.ts / wave-geometry.ts / receipt-runs.ts): the decision is pure and
// DOM-free so it can be unit-tested; the component only stamps what this returns.
//
// The span runs from the FIRST of Amico's rows to the LAST, inclusive of everything between —
// including Amico's own prose, and including ordinary tool rows. That inclusiveness is the
// point, and it corrects the spec's original wording of "consecutive Amico-chip rows": real
// transcripts read `prose, Model, prose, Skill, prose, Recommend`, so a span that only covered
// adjacent chips would never cover more than one row and the spine would be pointless. The
// prose between chips is Amico narrating the work it is doing, so bracketing it is honest.
//
// Takes a boolean mask rather than the caller's group objects, which keeps this module free of
// PartGroup and makes every case above a one-line test.

/** True when a rendered row is one of Amico's own. */
export function isAmicoTool(tool: string): boolean {
  return tool.startsWith("amicode_") || tool === "skill"
}

/** First to last of Amico's rows, inclusive; undefined when the turn has none. */
export function amicoSpan(isAmicoRow: ReadonlyArray<boolean>): { start: number; end: number } | undefined {
  const start = isAmicoRow.indexOf(true)
  if (start === -1) return undefined
  return { start, end: isAmicoRow.lastIndexOf(true) }
}

/** Per-row marker for the span's CSS. The four values let the spine round or inset its ends;
 *  a plain boolean could not distinguish a one-row span from the middle of a long one. */
export type SpanMark = "start" | "mid" | "end" | "only"

/** The marker for row `i`, or undefined when it sits outside the span. */
export function spanMarkAt(i: number, span: { start: number; end: number } | undefined): SpanMark | undefined {
  if (!span || i < span.start || i > span.end) return undefined
  if (span.start === span.end) return "only"
  if (i === span.start) return "start"
  if (i === span.end) return "end"
  return "mid"
}
