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
//
// Landing mode (Kate 2026-07-25): `mode="constellation"` boots the latent
// constellation instead of the empty live stage — landing surfaces only;
// session mounts stay live and untouched. `ignite` flipping true runs the
// handoff dissolve (engine.ignite()). Live-tuning knobs are DEV-gated query
// params (the ?brainForceActive pattern): ?constellationSpeed=<sec/rev>
// ?constellationDensity=<nodeTarget> ?constellationTint=<0..1>
// ?constellationFog=<0..1> — absent/invalid params fall back to the design
// defaults, and prod builds never read them.

import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { createBrainEngine, type BrainEngine, type BrainMode, type BrainScheme } from "./brain-engine"
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
  /** "constellation" boots the landing's latent cloud (default "live") */
  mode?: BrainMode
  /** first prompt sent: flipping true runs the ignition handoff dissolve */
  ignite?: boolean
  /** host-measured UI-covered regions (px, host-relative) — live-thought
      flares avoid landing under glass. Called lazily: on resize and right
      before each event flush, so the rects are fresh when a flare lands. */
  occlusion?: () => Array<{ x: number; y: number; w: number; h: number }>
  class?: string
}) {
  let host!: HTMLDivElement
  let canvas!: HTMLCanvasElement
  const [engine, setEngine] = createSignal<BrainEngine>()
  const sent = new Set<string>()
  let initialFlush = true

  // dev-only hooks, all riding the same gate: import.meta.env.DEV keeps every
  // query knob out of the shipped (prod) build.
  const devParams =
    import.meta.env.DEV && typeof location !== "undefined" ? new URLSearchParams(location.search) : undefined
  // force-full-tempo (#63): `?brainForceActive` pins the Brain at full musical
  // tempo AND disables the perf governor, so a perf run — the headless proxy
  // or the reference-laptop gate — measures the un-eased worst case.
  const forceFullTempo = !!devParams?.has("brainForceActive")
  // constellation live-tuning knobs (Kate iterates at :5990); undefined fields
  // fall through to the engine's design defaults, which also clamps ranges
  const devNum = (key: string) => {
    const raw = devParams?.get(key)
    if (raw === null || raw === undefined || raw === "") return undefined
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }
  const constellationTuning = {
    speedSec: devNum("constellationSpeed"),
    density: devNum("constellationDensity"),
    tint: devNum("constellationTint"),
    fog: devNum("constellationFog"),
  }

  onMount(() => {
    const eng = createBrainEngine(canvas, {
      scheme: currentScheme(),
      governed: !forceFullTempo,
      mode: props.mode ?? "live",
      constellation: constellationTuning,
    })
    setEngine(eng)
    eng.resize(host.clientWidth, host.clientHeight)

    // dev-only: surface the live engine to the perf-trace harness, the manual
    // gate checklist, and the flare preview (window.__amicoBrainStats?.() /
    // __amicoBrainTouch?.({label, type})); absent in prod. The touch hook
    // outlives router redirects that strip ?-param knobs — drive it from the
    // console to preview live-thought flares without running a real turn.
    if (import.meta.env.DEV) {
      const devWindow = window as Window & {
        __amicoBrainStats?: () => unknown
        __amicoBrainTouch?: (ev: { label: string; type?: string; consider?: boolean; replay?: boolean }) => void
      }
      devWindow.__amicoBrainStats = () => eng.stats()
      devWindow.__amicoBrainTouch = (ev) => {
        if (props.occlusion) eng.occlude(props.occlusion()) // console demos land in real gutters too
        eng.touch(ev)
      }
      onCleanup(() => {
        if (devWindow.__amicoBrainStats) delete devWindow.__amicoBrainStats
        if (devWindow.__amicoBrainTouch) delete devWindow.__amicoBrainTouch
      })
    }

    const ro = new ResizeObserver(() => {
      eng.resize(host.clientWidth, host.clientHeight)
      if (props.occlusion) eng.occlude(props.occlusion())
    })
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
  // (the dev hook pins busy so a gated run never drops to the rest cadence)
  createEffect(() => {
    const eng = engine()
    if (eng) eng.setActive((props.active ?? false) || forceFullTempo)
  })

  // landing handoff: the first prompt send flips `ignite` — ease the rotation
  // to a stop and dissolve the latent web (a no-op on live-mode mounts)
  createEffect(() => {
    const eng = engine()
    if (eng && props.ignite) eng.ignite()
  })

  createEffect(() => {
    const eng = engine()
    const evs = props.events ?? []
    if (!eng) return
    const replayCharts = initialFlush // charts already on the atlas restore silently
    // fresh occlusion rects right before the flush — flares land in the
    // gutters the CURRENT layout actually leaves clear
    if (props.occlusion && evs.some((ev) => !sent.has(ev.id))) eng.occlude(props.occlusion())
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
