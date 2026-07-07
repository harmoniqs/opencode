import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { fetchAmicodeRunSeries, openAmicodeEntity } from "./ui-bridge"
import {
  type RunSeries,
  type RunSeriesView,
  elapsedLabel,
  headlineMetric,
  parseRunSeriesResponse,
} from "./run-series"

export { parseRunSeriesResponse, type RunSeries, type RunSeriesView } from "./run-series"

// AMICODE (spec C): compact in-chat run window rendered where amicode_solve
// launched a run (run_dir known). Streams the objective-vs-iteration curve, the
// latest pulse trace, and a log tail from GET /amicode/run-series via the ui
// bridge; polls while solving; click opens the full Run entity. Transport lives
// in the app (rail registers fetchRunSeries) so this stays self-contained but
// context-free — no-op until the rail is mounted, exactly like the entity view.

const POLL_MS = 2500
const PLOT_W = 100
const PLOT_H = 34

// Descending log-objective curve (the classic convergence plot): map each f to
// log10(f), then min/max-scale into the viewBox. Non-scaling stroke keeps the
// line crisp under the non-uniform x-stretch.
function objectivePath(values: number[]): string | undefined {
  if (values.length < 2) return undefined
  const logs = values.map((f) => Math.log10(Math.max(f, 1e-12)))
  return linePath(logs)
}

function linePath(ys: number[]): string | undefined {
  if (ys.length < 2) return undefined
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const span = max - min || 1
  const step = PLOT_W / (ys.length - 1)
  return ys
    .map((y, i) => {
      const px = (i * step).toFixed(2)
      const py = (PLOT_H - 2 - ((y - min) / span) * (PLOT_H - 4)).toFixed(2)
      return `${i === 0 ? "M" : "L"}${px},${py}`
    })
    .join(" ")
}

function statusColor(status: string): string {
  if (status === "finished") return "var(--v2-state-fg-success)"
  if (status === "failed") return "var(--v2-state-fg-danger)"
  if (status === "stalled") return "var(--v2-state-fg-warning)" // wedged (OOM?) — not blue: must not read as live
  return "var(--v2-text-text-accent)" // solving
}

function Plot(props: { d: string | undefined }) {
  return (
    <Show
      when={props.d}
      fallback={
        <div style={{ height: `${PLOT_H}px`, display: "flex", "align-items": "center" }}>
          <span style={{ "font-size": "10px", color: "var(--v2-text-text-faint)" }}>gathering iterations…</span>
        </div>
      }
    >
      {(d) => (
        <svg
          width="100%"
          height={PLOT_H}
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          <path
            d={d()}
            fill="none"
            stroke="var(--v2-icon-icon-accent)"
            stroke-width="1.5"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      )}
    </Show>
  )
}

function Chip(props: { label: string; value: string; color?: string }) {
  return (
    <span style={{ display: "inline-flex", "align-items": "baseline", gap: "4px", "flex-shrink": "0" }}>
      <span style={{ color: "var(--v2-text-text-muted)" }}>{props.label}</span>
      <span
        style={{
          color: props.color ?? "var(--v2-text-text-base)",
          "font-family": "var(--font-family-mono, ui-monospace, monospace)",
        }}
      >
        {props.value}
      </span>
    </span>
  )
}

export function RunWindow(props: { run: string; lab?: string }) {
  const [view, setView] = createSignal<RunSeriesView | undefined>(undefined)
  const [mode, setMode] = createSignal<"objective" | "pulse">("objective")
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  const load = async () => {
    const pending = fetchAmicodeRunSeries(props.run, props.lab)
    if (!pending) return // no transport registered yet → keep last good
    const raw = await pending.catch(() => undefined)
    if (raw === undefined) return
    setView(parseRunSeriesResponse(raw))
  }

  onMount(() => void load())
  createEffect(() => {
    const v = view()
    const solving = v?.ok === true && v.run.status === "solving"
    if (solving && timer === undefined) timer = setInterval(() => void load(), POLL_MS)
    if (!solving) stop()
  })
  onCleanup(stop)

  const run = createMemo<RunSeries | undefined>(() => {
    const v = view()
    return v?.ok ? v.run : undefined
  })
  const plotPath = createMemo(() => {
    const r = run()
    if (!r) return undefined
    return mode() === "objective" ? objectivePath(r.series.map((p) => p.f)) : linePath(r.pulse?.values ?? [])
  })

  const ToggleButton = (p: { mode: "objective" | "pulse"; label: string; disabled?: boolean }) => (
    <button
      type="button"
      disabled={p.disabled}
      onClick={(e) => {
        e.stopPropagation()
        setMode(p.mode)
      }}
      style={{
        "font-size": "10px",
        padding: "1px 6px",
        "border-radius": "4px",
        border: "none",
        cursor: p.disabled ? "default" : "pointer",
        opacity: p.disabled ? "0.4" : "1",
        background: mode() === p.mode ? "var(--v2-background-bg-layer-03)" : "transparent",
        color: mode() === p.mode ? "var(--v2-text-text-base)" : "var(--v2-text-text-muted)",
      }}
    >
      {p.label}
    </button>
  )

  return (
    <div
      data-component="amicode-run-window"
      data-run={props.run}
      onClick={() => openAmicodeEntity("run")}
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "6px",
        "min-width": "0",
        border: "1px solid var(--v2-border-border-base)",
        "border-left": "3px solid var(--v2-icon-icon-accent)",
        "border-radius": "6px",
        background: "var(--v2-background-bg-layer-01)",
        padding: "8px 12px",
        "font-size": "12px",
        "line-height": "16px",
        cursor: "pointer",
      }}
    >
      {/* header: AMICO · Run · status · iter · metric · elapsed */}
      <div style={{ display: "flex", "align-items": "baseline", gap: "8px", "flex-wrap": "wrap", "min-width": "0" }}>
        <span style={{ "font-weight": "700", "letter-spacing": "0.08em", color: "var(--v2-text-text-accent)" }}>
          AMICO
        </span>
        <span style={{ color: "var(--v2-text-text-faint)" }}>·</span>
        <span style={{ "font-weight": "600", color: "var(--v2-text-text-base)" }}>Run</span>
        <Show
          when={run()}
          fallback={<span style={{ color: "var(--v2-text-text-muted)" }}>{view()?.ok === false ? "unavailable" : "loading…"}</span>}
        >
          {(r) => (
            <>
              <span style={{ "font-weight": "600", color: statusColor(r().status), "flex-shrink": "0" }}>
                {r().status}
              </span>
              <Show when={r().iteration !== null}>
                <Chip label="iter" value={String(r().iteration)} />
              </Show>
              {(() => {
                const m = headlineMetric(r())
                return <Chip label={m.label} value={m.value} />
              })()}
              <Show when={elapsedLabel(r().elapsedMs)}>{(t) => <Chip label="" value={t()} />}</Show>
            </>
          )}
        </Show>
        <span style={{ "margin-left": "auto", display: "inline-flex", gap: "2px", "flex-shrink": "0" }}>
          <ToggleButton mode="objective" label="F" />
          <ToggleButton mode="pulse" label="pulse" disabled={!run()?.pulse} />
        </span>
      </div>

      {/* plot */}
      <Plot d={plotPath()} />

      {/* log tail */}
      <Show when={(run()?.tail.length ?? 0) > 0}>
        <div
          style={{
            "font-family": "var(--font-family-mono, ui-monospace, monospace)",
            "font-size": "10px",
            "line-height": "14px",
            color: "var(--v2-text-text-muted)",
            "max-height": "58px",
            overflow: "hidden",
            "white-space": "pre-wrap",
            "word-break": "break-all",
          }}
        >
          <For each={run()!.tail.slice(-4)}>{(line) => <div>{line}</div>}</For>
        </div>
      </Show>
    </div>
  )
}
