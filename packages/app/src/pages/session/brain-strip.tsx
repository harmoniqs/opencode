// amicode: the amico brain — a permanent timeline row (stable key, kept
// mounted) living in the conversation flow: right beneath the thinking
// shimmer while a turn works, after the last message at rest. Height changes
// ride the timeline's own row-measurement and bottom-lock machinery.
// One brain instance per session view: completed messages replay instantly
// into the atlas, the busy message's tool calls animate live, and each
// completed turn with ≥2 commits is charted as a named constellation
// ("plate N · <prompt excerpt>"). Auto-breathe: expands while thinking,
// lingers a beat after the ceremony, collapses to a 72px living slice —
// always visible, never hidden; click (or Enter/Space) overrides until the
// next turn reclaims auto. An open question dock forces the collapsed
// slice (amico is waiting on the user, not thinking).

import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { amicoBrainRef, type AmicoBrainRef } from "@opencode-ai/ui/brain-ref"

type BrainTouch = { id: string } & AmicoBrainRef
type BrainEvent = ({ kind: "touch"; replay: boolean } & BrainTouch) | { kind: "chart"; id: string; title: string }

export function BrainStrip(props: { sessionID?: string }) {
  // keyed remount per session: a fresh brain restores the new session's atlas
  return <Show when={props.sessionID} keyed>{(sid) => <BrainFrame sessionID={sid} />}</Show>
}

function BrainFrame(props: { sessionID: string }) {
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])
  const getParts = (msgId: string) => sync.data.part[msgId] ?? []
  const busy = createMemo(() => (sync.data.session_status[props.sessionID]?.type ?? "idle") !== "idle")

  const turnTitle = (parentID: string | undefined) => {
    const parent = parentID ? messages().find((m) => m.id === parentID) : undefined
    if (!parent) return ""
    for (const p of getParts(parent.id)) {
      if (p.type === "text" && typeof p.text === "string" && p.text.trim()) return p.text.trim().slice(0, 28)
    }
    return ""
  }

  // the session's event stream: touches in message order, plus a chart marker
  // after each completed assistant message that committed ≥2 touches
  const events = createMemo<BrainEvent[]>(() => {
    const out: BrainEvent[] = []
    for (const m of messages()) {
      if (m.role !== "assistant") continue
      const done = typeof m.time?.completed === "number"
      let commits = 0
      for (const p of getParts(m.id)) {
        if (p.type !== "tool") continue
        const ref = amicoBrainRef(p.tool, p.state.input ?? {})
        if (!ref) continue
        if (!ref.consider) commits++
        out.push({ kind: "touch", replay: done, id: p.id, ...ref })
      }
      if (done && commits >= 2) out.push({ kind: "chart", id: `chart-${m.id}`, title: turnTitle(m.parentID) })
    }
    return out
  })

  // an unresolved question means the dock is expanded into this region
  const questionOpen = createMemo(() =>
    messages().some(
      (m) =>
        m.role === "assistant" &&
        typeof m.time?.completed !== "number" &&
        getParts(m.id).some(
          (p) =>
            p.type === "tool" && p.tool === "question" && (p.state.status === "pending" || p.state.status === "running"),
        ),
    ),
  )

  // auto-breathe with manual override
  const [manual, setManual] = createSignal<boolean | null>(null)
  const [linger, setLinger] = createSignal(false)
  createEffect(
    on(busy, (b, prev) => {
      if (b) setManual(null) // a new turn reclaims auto
      if (prev && !b) {
        setLinger(true)
        const t = setTimeout(() => setLinger(false), 5000)
        onCleanup(() => clearTimeout(t))
      }
    }),
  )
  const expanded = () => !questionOpen() && (manual() ?? (busy() || linger()))

  const scheme = document.documentElement.dataset.colorScheme === "light" ? "light" : "dark"
  let frame: HTMLIFrameElement | undefined
  // live theme flips must reach the iframe: a color-scheme mismatch between
  // parent and child makes the browser paint the transparent frame opaque
  // white — so forward every change (and once on ready for the initial state)
  const currentScheme = () => (document.documentElement.dataset.colorScheme === "light" ? "light" : "dark")
  const themeObserver = new MutationObserver(() => post({ kind: "theme", colorScheme: currentScheme() }))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] })
  onCleanup(() => themeObserver.disconnect())
  createEffect(() => {
    if (ready()) post({ kind: "theme", colorScheme: currentScheme() })
  })
  const [ready, setReady] = createSignal(false)
  const sent = new Set<string>()
  let initialFlush = true
  const onBrainMessage = (e: MessageEvent) => {
    if (e.origin !== location.origin) return
    const d = e.data as { source?: string; kind?: string } | undefined
    if (d?.source === "amico-brain" && d.kind === "ready") setReady(true)
  }
  window.addEventListener("message", onBrainMessage)
  onCleanup(() => window.removeEventListener("message", onBrainMessage))
  // amicode: hovering a tool row in the log glances at its node on the map
  // (emitted by packages/ui message-part via the amicode:brain-hover event)
  const onToolHover = (e: Event) => {
    const d = (e as CustomEvent).detail as { label?: string } | undefined
    if (d?.label && ready()) post({ kind: "highlight", label: d.label })
  }
  window.addEventListener("amicode:brain-hover", onToolHover)
  onCleanup(() => window.removeEventListener("amicode:brain-hover", onToolHover))
  const post = (payload: Record<string, unknown>) =>
    frame?.contentWindow?.postMessage({ source: "amico-brain", ...payload }, location.origin)

  createEffect(() => {
    const evs = events()
    if (!ready()) return
    const replayCharts = initialFlush // charts already on the atlas restore silently
    for (const ev of evs) {
      if (sent.has(ev.id)) continue
      sent.add(ev.id)
      if (ev.kind === "touch") post({ kind: "touch", label: ev.label, type: ev.type, consider: ev.consider, replay: ev.replay })
      else post({ kind: "chart", title: ev.title, replay: replayCharts })
    }
    initialFlush = false
  })

  return (
    <div
      data-component="amico-brain-strip"
      role="button"
      tabIndex={0}
      aria-label="amico brain — the session's living map; press to expand or collapse"
      class="my-2 cursor-pointer overflow-hidden rounded-xl border transition-[height] motion-reduce:transition-none"
      style={{
        // a contained card (hairline + 12px radius + a surface one step off
        // the chat background): the crop reads as a frame, not a cut-off
        height: expanded() ? "224px" : "72px",
        "transition-duration": expanded() ? "300ms" : "200ms",
        // the same subtle surface the message/tool cards wear
        background: "var(--surface-base)",
        "border-color": "color-mix(in srgb, currentColor 8%, transparent)",
      }}
      onClick={() => setManual(!expanded())}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          setManual(!expanded())
        }
      }}
    >
      <iframe
        ref={(el) => (frame = el)}
        src={`/brain.html?mode=live&colorScheme=${scheme}`}
        title="amico brain"
        aria-hidden="true"
        class="pointer-events-none block h-full w-full border-0"
      />
    </div>
  )
}
