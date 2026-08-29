export function readPartText(accum: Record<string, string> | undefined, part: { id: string; text?: string }): string {
  return (accum?.[part.id] ?? part.text ?? "").trim()
}

/* Streaming prose lands in whole SECTIONS (heading-anchored segmentation).
   A chunk boundary fires at every markdown heading (`# `, `## `, `### `, etc.)
   that is OUTSIDE a code fence. Each section = heading + everything until the
   next heading of any rank. The intro (text before the first heading) is its
   own section. Text past the last boundary is still being composed and stays
   withheld until the next heading appears or the message completes.

   This replaces the old blank-line splitting which produced orphan heading
   cards, empty cards from `---`, and isolated math blocks. */

const FENCE = /^\s{0,3}(```|~~~)/
const HEADING = /^#{1,6}\s/

/** Every settled chunk boundary of a streaming text, in order. Each value is
 *  the char index where the heading line begins. A boundary fires at each
 *  heading outside a code fence, EXCEPT the first heading when it's at the
 *  very start of the text (that heading opens the first section, not a split
 *  point). The last section is always the tail (still composing). */
function chunkBoundaries(text: string): number[] {
  const lines = text.split("\n")
  const boundaries: number[] = []
  let inFence = false
  let offset = 0
  let foundFirstContent = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE.test(line)) inFence = !inFence
    if (!inFence && HEADING.test(line) && foundFirstContent) {
      boundaries.push(offset)
    }
    if (line.trim() !== "") foundFirstContent = true
    offset += line.length + 1
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
