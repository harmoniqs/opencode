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
//
// The graph renders on an IN-DOCUMENT canvas (brain-engine), not an iframe.
// The old /brain.html embed broke three separate ways at the frame boundary:
// document requests can't carry server auth (armed password ⇒ 401 ⇒ blank
// strip), a parent/child color-scheme mismatch composites the transparent
// frame opaque white (async webview theming ⇒ white box + full reload on
// every flip), and the page's own stylesheet ground + prototype chrome
// painted an unwanted first frame before script hid them. Native, there is
// no fetch, no second document, no handshake — the canvas is transparent
// from frame zero, events are direct calls, and a theme flip repaints
// without losing the atlas.

import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { amicoBrainRef, type AmicoBrainRef } from "@opencode-ai/ui/brain-ref"
import { createBrainEngine, type BrainEngine } from "@opencode-ai/ui/brain-engine"

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

  // the engine is created when the canvas mounts and destroyed with the row;
  // theme flips are direct, lossless repaints — no reload, no re-flush
  const [engine, setEngine] = createSignal<BrainEngine>()
  const currentScheme = () => (document.documentElement.dataset.colorScheme === "light" ? "light" : "dark")
  // refs run before layout (clientWidth/Height are 0 at creation), so seed the
  // engine with the strip's real height — the camera's close-up vs whole-network
  // branch keys on it — and re-measure once mounted
  onMount(() => engine()?.resize())
  const themeObserver = new MutationObserver(() => engine()?.setTheme(currentScheme()))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] })
  onCleanup(() => themeObserver.disconnect())
  onCleanup(() => engine()?.destroy())

  // amicode: hovering a tool row in the log glances at its node on the map
  // (emitted by packages/ui message-part via the amicode:brain-hover event)
  const onToolHover = (e: Event) => {
    const d = (e as CustomEvent).detail as { label?: string } | undefined
    if (d?.label) engine()?.highlight(d.label)
  }
  window.addEventListener("amicode:brain-hover", onToolHover)
  onCleanup(() => window.removeEventListener("amicode:brain-hover", onToolHover))

  const sent = new Set<string>()
  let initialFlush = true
  createEffect(() => {
    const evs = events()
    const brain = engine()
    if (!brain) return
    const replayCharts = initialFlush // charts already on the atlas restore silently
    for (const ev of evs) {
      if (sent.has(ev.id)) continue
      sent.add(ev.id)
      if (ev.kind === "touch") brain.touch({ label: ev.label, type: ev.type, consider: ev.consider, replay: ev.replay })
      else brain.chart(ev.title, replayCharts)
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
      <canvas
        ref={(el) =>
          setEngine(
            createBrainEngine(el, {
              scheme: currentScheme(),
              size: { width: 800, height: expanded() ? 224 : 72 },
            }),
          )
        }
        aria-hidden="true"
        class="pointer-events-none block h-full w-full"
      />
    </div>
  )
}
