// amicode: the amico brain as the chat's BACKGROUND (Kate, 2026-07-16 — the
// OCEAN treatment). One full-bleed, pointer-transparent layer behind the
// whole chat pane: with a session it streams the REAL thought (mode=live,
// the bridge lifted from the retired in-timeline brain-strip); without one
// it plays the ambient self-running traces (mode=inline). A scrim gradient
// keeps foreground content legible; chat components float above at z-1,
// frosted where they carry text over the animation.

import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { amicoBrainRef, type AmicoBrainRef } from "@opencode-ai/ui/brain-ref"

type BrainTouch = { id: string } & AmicoBrainRef
type BrainEvent = ({ kind: "touch"; replay: boolean } & BrainTouch) | { kind: "chart"; id: string; title: string }

const currentScheme = () => (document.documentElement.dataset.colorScheme === "light" ? "light" : "dark")

export function BrainBackdrop(props: { sessionID?: string }) {
  return (
    <div
      data-component="amico-brain-backdrop"
      aria-hidden="true"
      class="absolute inset-0 z-0 overflow-hidden pointer-events-none"
    >
      {/* keyed remount per session: a fresh brain restores that session's atlas */}
      <Show when={props.sessionID} keyed fallback={<AmbientFrame />}>
        {(sid) => <LiveFrame sessionID={sid} />}
      </Show>
      {/* in-session: ONE frosted column under the message flow (the OCEAN band,
          vertical) — chat components read on glass, the brain stays crisp in
          the margins; a single backdrop-filter element keeps it cheap */}
      <Show when={props.sessionID}>
        <div
          class="absolute inset-y-0 inset-x-4 md:inset-x-0 md:max-w-200 2xl:max-w-[1000px] md:mx-auto"
          style={{
            background: "color-mix(in srgb, var(--v2-background-bg-base) 32%, transparent)",
            "backdrop-filter": "blur(12px) saturate(1.05)",
            "-webkit-backdrop-filter": "blur(12px) saturate(1.05)",
          }}
        />
      </Show>
      {/* scrim: a vertical wash so the timeline column and composer stay
          legible — the brain reads clearest at the top, calmest at the foot */}
      <div
        class="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom," +
            " color-mix(in srgb, var(--v2-background-bg-base) 30%, transparent)," +
            " color-mix(in srgb, var(--v2-background-bg-base) 62%, transparent) 46%," +
            " color-mix(in srgb, var(--v2-background-bg-base) 84%, transparent))",
        }}
      />
    </div>
  )
}

/** Theme forwarding shared by both frames — a color-scheme mismatch between
 *  parent and child makes the browser paint the transparent frame opaque. */
function useThemeBridge(getFrame: () => HTMLIFrameElement | undefined, ready: () => boolean) {
  const post = (payload: Record<string, unknown>) =>
    getFrame()?.contentWindow?.postMessage({ source: "amico-brain", ...payload }, location.origin)
  const themeObserver = new MutationObserver(() => post({ kind: "theme", colorScheme: currentScheme() }))
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] })
  onCleanup(() => themeObserver.disconnect())
  createEffect(() => {
    if (ready()) post({ kind: "theme", colorScheme: currentScheme() })
  })
  return post
}

function useReadySignal() {
  const [ready, setReady] = createSignal(false)
  const onBrainMessage = (e: MessageEvent) => {
    if (e.origin !== location.origin) return
    const d = e.data as { source?: string; kind?: string } | undefined
    if (d?.source === "amico-brain" && d.kind === "ready") setReady(true)
  }
  window.addEventListener("message", onBrainMessage)
  onCleanup(() => window.removeEventListener("message", onBrainMessage))
  return ready
}

function AmbientFrame() {
  let frame: HTMLIFrameElement | undefined
  const ready = useReadySignal()
  useThemeBridge(() => frame, ready)
  return (
    <iframe
      ref={(el) => (frame = el)}
      src={`/brain.html?mode=inline&colorScheme=${currentScheme()}`}
      title="amico brain (ambient)"
      aria-hidden="true"
      class="pointer-events-none block h-full w-full border-0"
    />
  )
}

function LiveFrame(props: { sessionID: string }) {
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])
  const getParts = (msgId: string) => sync.data.part[msgId] ?? []

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

  let frame: HTMLIFrameElement | undefined
  const ready = useReadySignal()
  const post = useThemeBridge(() => frame, ready)

  // hovering a tool row in the log glances at its node on the map
  const onToolHover = (e: Event) => {
    const d = (e as CustomEvent).detail as { label?: string } | undefined
    if (d?.label && ready()) post({ kind: "highlight", label: d.label })
  }
  window.addEventListener("amicode:brain-hover", onToolHover)
  onCleanup(() => window.removeEventListener("amicode:brain-hover", onToolHover))

  const sent = new Set<string>()
  let initialFlush = true
  createEffect(
    on([events, ready], ([evs, isReady]) => {
      if (!isReady) return
      const replayCharts = initialFlush // charts already on the atlas restore silently
      for (const ev of evs) {
        if (sent.has(ev.id)) continue
        sent.add(ev.id)
        if (ev.kind === "touch")
          post({ kind: "touch", label: ev.label, type: ev.type, consider: ev.consider, replay: ev.replay })
        else post({ kind: "chart", title: ev.title, replay: replayCharts })
      }
      initialFlush = false
    }),
  )

  return (
    <iframe
      ref={(el) => (frame = el)}
      src={`/brain.html?mode=live&colorScheme=${currentScheme()}`}
      title="amico brain"
      aria-hidden="true"
      class="pointer-events-none block h-full w-full border-0"
    />
  )
}
