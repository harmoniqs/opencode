// amicode: derive the chat-wide Brain background's event stream from a
// session's live sync state. Successor to brain-strip.tsx's inline `events`
// memo — the same mapping (tool call → brain-graph reference via
// amicoBrainRef; a chart marker after each completed assistant turn that
// committed ≥2 touches), now feeding the full-bleed <BrainAtmosphere/>
// instead of a timeline row. The stream is cumulative and diffed by id
// inside the component, so completed turns replay into the atlas silently
// and the busy turn animates live.

import { createMemo, type Accessor } from "solid-js"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { amicoBrainRef } from "@opencode-ai/ui/brain-ref"
import type { BrainAtmosphereEvent } from "@opencode-ai/ui/brain-atmosphere"
import { useSync } from "@/context/sync"

/** Pure, session-scoped derivation — the strip's `events` logic lifted out so
 *  it is unit-testable headless and shared by the chat-wide mount. Touches
 *  land in message order; completed turns carry `replay: true` (the busy
 *  turn stays live); ids never repeat. */
export function deriveBrainEvents(
  messages: Message[],
  getParts: (messageID: string) => Part[],
): BrainAtmosphereEvent[] {
  const turnTitle = (parentID: string | undefined) => {
    const parent = parentID ? messages.find((m) => m.id === parentID) : undefined
    if (!parent) return ""
    for (const p of getParts(parent.id)) {
      if (p.type === "text" && typeof p.text === "string" && p.text.trim()) return p.text.trim().slice(0, 28)
    }
    return ""
  }

  const seen = new Set<string>()
  const out: BrainAtmosphereEvent[] = []
  for (const m of messages) {
    if (m.role !== "assistant") continue
    const done = typeof m.time?.completed === "number"
    let commits = 0
    for (const p of getParts(m.id)) {
      if (p.type !== "tool") continue
      const ref = amicoBrainRef(p.tool, p.state.input ?? {})
      if (!ref) continue
      if (seen.has(p.id)) continue
      seen.add(p.id)
      if (!ref.consider) commits++
      out.push({ kind: "touch", replay: done, id: p.id, label: ref.label, type: ref.type, consider: ref.consider })
    }
    if (done && commits >= 2) {
      const id = `chart-${m.id}`
      if (!seen.has(id)) {
        seen.add(id)
        out.push({ kind: "chart", id, title: turnTitle(m.parentID) })
      }
    }
  }
  return out
}

/** The live feed for a Chat window's Brain: the active session's cumulative
 *  event stream out of the sync store — empty on the landing (no session). */
export function createBrainEvents(sessionID: Accessor<string | undefined>) {
  const sync = useSync()
  const events = createMemo<BrainAtmosphereEvent[]>(() => {
    const id = sessionID()
    if (!id) return []
    return deriveBrainEvents(sync.data.message[id] ?? [], (messageID) => sync.data.part[messageID] ?? [])
  })
  return { events }
}
