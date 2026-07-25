// AMICODE: <BrainAtmosphere/> — the amico brain as a first-class background
// layer. The inline timeline strip promoted to the room (ADR 0002): mount it
// as the first child of a `position: relative isolate` pane, and it fills the
// pane, ignores the pointer, and paints on a transparent ground so the host
// surface shows through. Content stacks above it.
//
// The component owns the environment plumbing around the engine:
//   - ResizeObserver → engine.resize (canvas bitmap + camera fit)
//   - data-color-scheme MutationObserver → setTheme (lossless live theme flips)
//   - document visibility + intersection → hard pause (no hidden burn)
//   - "amicode:brain-hover" glances from the log (message-part) → highlight
//
// Events arrive as a cumulative array (the session's touches in message
// order); the component diffs by id — the strip's `sent` semantics — and the
// FIRST flush restores charts silently (a mounted mid-session brain replays
// the atlas instantly and quietly). Reduced-motion is the engine's own
// concern (it watches prefers-reduced-motion live). The host's session-busy
// signal arrives as `active` and routes to engine.setActive — full musical
// tempo while a turn works, ~8fps breathing at rest (#62).

import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { createBrainEngine, type BrainEngine, type BrainScheme } from "./brain-engine"
// styles: ./brain-atmosphere.css, registered in src/styles/index.css layer(components)

export type BrainAtmosphereEvent =
  | { kind: "touch"; id: string; replay: boolean; label: string; type?: string; consider?: boolean }
  | { kind: "chart"; id: string; title: string }

/** synchronous first-paint gate: a zero-area or fully-out-of-viewport pane is
 *  offscreen until the IntersectionObserver's async first observation lands */
function isOffscreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return true
  const vw = window.innerWidth || document.documentElement.clientWidth
  const vh = window.innerHeight || document.documentElement.clientHeight
  return r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw
}

function currentScheme(): BrainScheme {
  return document.documentElement.dataset.colorScheme === "light" ? "light" : "dark"
}

export function BrainAtmosphere(props: {
  /** cumulative session event stream, diffed by id */
  events?: BrainAtmosphereEvent[]
  /** session-busy signal → engine.setActive (adaptive heartbeat) */
  active?: boolean
  class?: string
}) {
  let host!: HTMLDivElement
  let canvas!: HTMLCanvasElement
  const [engine, setEngine] = createSignal<BrainEngine>()
  const sent = new Set<string>()
  let initialFlush = true

  onMount(() => {
    const eng = createBrainEngine(canvas, { scheme: currentScheme() })
    setEngine(eng)
    eng.resize(host.clientWidth, host.clientHeight)

    const ro = new ResizeObserver(() => eng.resize(host.clientWidth, host.clientHeight))
    ro.observe(host)
    onCleanup(() => ro.disconnect())

    // live theme flips are lossless: the palette swaps, the atlas persists
    const mo = new MutationObserver(() => eng.setTheme(currentScheme()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] })
    onCleanup(() => mo.disconnect())

    // hard pause: hidden webview or a pane scrolled/collapsed out of view —
    // either alone must stop the frames. Seed `offscreen` from a synchronous
    // rect read so an element mounted already scrolled-away never burns the
    // frames the engine's wake started, before the IntersectionObserver
    // delivers its first (async) observation.
    let docHidden = document.visibilityState === "hidden"
    let offscreen = isOffscreen(host)
    const applyVisibility = () => (docHidden || offscreen ? eng.pause() : eng.resume())
    const onVis = () => {
      docHidden = document.visibilityState === "hidden"
      applyVisibility()
    }
    document.addEventListener("visibilitychange", onVis)
    onCleanup(() => document.removeEventListener("visibilitychange", onVis))
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) offscreen = !entry.isIntersecting
      applyVisibility()
    })
    io.observe(host)
    onCleanup(() => io.disconnect())
    applyVisibility()

    // hovering a tool row in the log glances at its node on the map
    const onToolHover = (e: Event) => {
      const d = (e as CustomEvent).detail as { label?: string } | undefined
      if (d?.label) eng.highlight(d.label)
    }
    window.addEventListener("amicode:brain-hover", onToolHover)
    onCleanup(() => window.removeEventListener("amicode:brain-hover", onToolHover))

    // canvas 2D does not invalidate on webfont load; JuliaMono ships
    // font-display: swap, so node labels rasterized before it arrives freeze
    // in fallback monospace under the reduced-motion rest halt. A no-arg
    // resize() re-measures and repaints once the face is ready.
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(() => eng.resize()).catch(() => {})
    }

    onCleanup(() => eng.destroy())
  })

  // the heartbeat: session busy ⇒ full musical tempo; idle ⇒ ~8fps breathing
  createEffect(() => {
    const eng = engine()
    if (eng) eng.setActive(props.active ?? false)
  })

  createEffect(() => {
    const eng = engine()
    const evs = props.events ?? []
    if (!eng) return
    const replayCharts = initialFlush // charts already on the atlas restore silently
    let flushed = false
    for (const ev of evs) {
      if (sent.has(ev.id)) continue
      sent.add(ev.id)
      flushed = true
      if (ev.kind === "touch") eng.touch({ label: ev.label, type: ev.type, consider: ev.consider, replay: ev.replay })
      else eng.chart(ev.title, replayCharts)
    }
    // never spend the silent-replay flag on a no-op flush: a fresh/mid-session
    // mount whose events arrive a tick after the engine must still restore its
    // historical atlas quietly, not animate it
    if (flushed) initialFlush = false
  })

  return (
    <div data-component="brain-atmosphere" class={props.class} aria-hidden="true" ref={host}>
      <canvas ref={canvas} />
    </div>
  )
}
