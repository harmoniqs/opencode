export function readPartText(accum: Record<string, string> | undefined, part: { id: string; text?: string }): string {
  return (accum?.[part.id] ?? part.text ?? "").trim()
}

/* Streaming prose lands in whole CHUNKS (Kate 2026-08-25: no typing reveal,
   but no waiting for the entire reply either). Each chunk renders as its own
   prose-fragment card, so boundaries are SECTION transitions, not paragraph
   breaks (Aaron 2026-09-03: per-paragraph cards were too fine-grained). A
   chunk boundary is a blank line that is
     · OUTSIDE a code fence — splitting inside one corrupts the markdown,
     · followed by a heading or horizontal rule — a real section transition —
       or the accumulated chunk has outgrown the size cap (otherwise a
       heading-less reply would withhold everything until completion),
     · and never between two lines that CONTINUE the same construct (list
       item after list item, quote after quote) — splitting those restarts
       ordered-list numbering and swells the gap between fragments that
       render as separate lists.
   Text past the last boundary is still being composed and stays withheld
   until the next boundary or completion. */

const FENCE = /^\s{0,3}(```|~~~)/
const SECTION_START = /^\s{0,3}#{1,6}\s|\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/
const CONTINUATION = /^\s{0,3}([-*+]\s|\d{1,3}[.)]\s|>)|^\s{4,}\S/
/** Fallback cap (chars): a heading-less chunk this large still lands, so
 *  streaming stays alive and cards stay section-sized rather than run-on. */
const CHUNK_CAP = 600

/** Every settled chunk boundary of a streaming text, in order. Each value is
 *  the char index where the NEXT chunk begins. Monotonic as the text grows.
 *  A boundary is invalid when the next line CONTINUES a construct the
 *  previous line already started (list item after list item, quote after
 *  quote): splitting there restarts ordered-list numbering across fragments. */
function chunkBoundaries(text: string): number[] {
  const lines = text.split("\n")
  const boundaries: number[] = []
  let inFence = false
  let offset = 0
  let chunkStart = 0
  let prevNonBlank: string | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE.test(line)) inFence = !inFence
    offset += line.length + 1
    if (line.trim() !== "") prevNonBlank = line
    if (inFence || line.trim() !== "") continue
    // blank line: the boundary candidate sits at the next non-blank line
    let j = i + 1
    let candidate = offset
    while (j < lines.length && lines[j].trim() === "") {
      candidate += lines[j].length + 1
      j++
    }
    if (j >= lines.length) break // trailing blanks — the tail is still composing
    const sectionStart = SECTION_START.test(lines[j])
    const overCap = candidate - chunkStart >= CHUNK_CAP
    if (!sectionStart && !overCap) continue
    if (
      !sectionStart &&
      CONTINUATION.test(lines[j]) &&
      prevNonBlank !== undefined &&
      CONTINUATION.test(prevNonBlank)
    )
      continue
    boundaries.push(candidate)
    offset = candidate
    chunkStart = candidate
    i = j - 1
  }
  return boundaries
}

/** Index just past the last settled chunk boundary (0 if nothing settled). */
export function settledChunkBoundary(text: string): number {
  const boundaries = chunkBoundaries(text)
  return boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0
}

/** The settled prefix split into renderable chunks, plus the withheld tail. */
export function splitSettledChunks(text: string): { chunks: string[]; tail: string } {
  const boundaries = chunkBoundaries(text)
  const chunks: string[] = []
  let start = 0
  for (const boundary of boundaries) {
    const chunk = text.slice(start, boundary)
    if (chunk.trim() !== "") chunks.push(chunk)
    start = boundary
  }
  return { chunks, tail: text.slice(start) }
}
