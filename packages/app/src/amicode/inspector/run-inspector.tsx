import { For, Show, createMemo } from "solid-js"
import type { createInspectorBridge } from "./inspector-bridge"

type Props = { bridge: ReturnType<typeof createInspectorBridge> }

// Minimal pulse sparkline — renders correctly at 320px column width and responds
// to resize via viewBox (no fixed pixel width). Each drive is a polyline.
function PulseChart(props: { values: number[][]; bounds?: [number, number][] }) {
  const paths = createMemo(() => {
    const v = props.values
    if (v.length === 0 || v[0].length === 0) return []
    return v.map((drive, idx) => {
      const b = props.bounds?.[idx]
      const lo = b?.[0] ?? Math.min(...drive)
      const hi = b?.[1] ?? Math.max(...drive)
      const range = hi - lo || 1
      const pts = drive.map((val, i) => {
        const x = (i / (drive.length - 1)) * 100
        const y = 50 - ((val - lo) / range) * 40 - 5
        return `${x},${y}`
      })
      return { d: `M ${pts.join(" L ")}`, color: idx % 2 === 0 ? "var(--amico-accent, #eab308)" : "var(--amico-accent-2, #38bdf8)" }
    })
  })
  return (
    <svg viewBox="0 0 100 50" class="w-full h-[120px] bg-[var(--v2-background-bg-subtle)] rounded-md" preserveAspectRatio="none">
      <For each={paths()}>{(p) => <path d={p.d} fill="none" stroke={p.color} stroke-width={1.2} vector-effect="non-scaling-stroke" />}</For>
    </svg>
  )
}

export function RunInspector(props: Props) {
  const runs = () => Array.from(props.bridge.runs().entries())
  const active = createMemo(() => {
    const id = props.bridge.activeRunId()
    if (id && props.bridge.runs().has(id)) return { id, state: props.bridge.runs().get(id)! }
    const first = runs()[0]
    return first ? { id: first[0], state: first[1] } : undefined
  })
  const latestIter = createMemo(() => active()?.state.iterations.at(-1))
  const latestPulse = createMemo(() => active()?.state.pulses.at(-1))

  return (
    <div class="flex flex-col gap-3 p-3" data-component="run-inspector">
      <div class="flex items-center justify-between">
        <div class="text-12-medium">Run Inspector</div>
        <Show when={runs().length > 1}>
          <select
            class="text-12-regular border border-border-weaker-base rounded px-1 py-0.5 bg-background-base max-w-[140px] truncate"
            value={active()?.id ?? ""}
            onChange={(e) => props.bridge.setActiveRunId(e.currentTarget.value)}
          >
            <For each={runs()}>{([id, s]) => <option value={id}>{s.label ?? id}</option>}</For>
          </select>
        </Show>
      </div>

      <Show when={!active()} fallback={
        <div class="flex flex-col gap-3">
          <div class="text-11-regular text-text-weak truncate" title={active()!.id}>
            {active()!.state.label ?? active()!.id}
          </div>
          <Show when={active()!.state.pulseMeta}>
            {(meta) => (
              <div class="text-11-regular text-text-weak">
                {meta().drives} drive(s) · {meta().knots} knots · {meta().labels.join(", ")}
              </div>
            )}
          </Show>
          <Show when={latestPulse()}>{(p) => <PulseChart values={p().values} bounds={active()!.state.pulseMeta?.bounds} />}</Show>
          <Show when={!latestPulse() && active()!.state.pulseMeta}>
            <div class="text-11-regular text-text-weak">Waiting for pulse data…</div>
          </Show>
          <div class="grid grid-cols-3 gap-2 text-11-regular">
            <div>
              <div class="text-text-faint">iter</div>
              <div class="text-13-medium">{latestIter()?.iter ?? "—"}</div>
            </div>
            <div>
              <div class="text-text-faint">objective</div>
              <div class="font-mono text-11-regular">{latestIter() ? latestIter()!.objective.toExponential(2) : "—"}</div>
            </div>
            <div>
              <div class="text-text-faint">inf</div>
              <div class="font-mono text-11-regular">{latestIter() ? `${latestIter()!.inf_pr.toExponential(1)}/${latestIter()!.inf_du.toExponential(1)}` : "—"}</div>
            </div>
          </div>
          <Show when={active()!.state.completion}>
            {(c) => (
              <div class="rounded-md border border-border-weaker-base p-2 text-11-regular">
                <div class="text-text-faint">completion</div>
                <div>
                  {c().status} · F={c().fidelity.toFixed(5)} · {c().iterations} iters
                  <Show when={active()!.state.timing}> · {active()!.state.timing!.toFixed(1)}s</Show>
                </div>
              </div>
            )}
          </Show>
          <Show when={!active()!.state.completion && latestIter()}>
            <div class="text-11-regular text-text-weak">running · iter {latestIter()!.iter}</div>
          </Show>
        </div>
      }>
        <div class="text-12-regular text-text-weak py-8 text-center">No solve yet — launch one from the chat.</div>
      </Show>
    </div>
  )
}
