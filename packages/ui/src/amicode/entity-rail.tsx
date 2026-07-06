import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { hasUserReplyAfter } from "./ask"
import { registerAmicodeAskBridge } from "./ask-bridge"
import { registerAmicodeUiBridge } from "./ui-bridge"
import {
  type ProblemView,
  type RunStatusView,
  mergeChips,
  parseProblemResponse,
  parseRunStatusResponse,
  railState,
  runChipText,
} from "./problem"

// AMICODE problem-header rail (spec B). One compact sticky row per session
// view, bound to the ACTIVE problem workspace via GET /amicode/problem —
// AMICO · <name> ▾ │ <entity chips> │ <pending chips> │ <live run chip>.
// Session gate: renders only when the session contains ≥ 1 amicode_* tool
// part (fresh + non-amicode sessions stay stock; the active pointer is global
// but the rail is session-scoped — no empty chrome). The app supplies
// transport (fetchProblem/fetchRunStatus, per-active-server auth) + ring-2
// actions; this component owns parsing, refetch triggers, run polling, and
// failure states. It also hosts the ask bridge (existing) and the ui bridge
// (receipt clicks → entity view). Refetch triggers, scoped per spec: the
// completed-part counter below; "section open" has no analog for an
// always-visible rail (dialogs fetch on open, app side); server switch is
// handled per-call because fetchProblem resolves the active connection on
// every invocation.

interface RailPartState {
  status?: string
  output?: string
}

interface RailPart {
  type?: string
  tool?: string
  state?: RailPartState
}

const RUN_POLL_MS = 2500

export function AmicodeEntityRail(props: {
  messages: readonly { id: string; role?: string }[]
  partsFor: (messageID: string) => readonly RailPart[] | undefined
  fetchProblem: () => Promise<unknown>
  fetchRunStatus: () => Promise<unknown>
  fetchRunSeries?: (run: string, lab?: string) => Promise<unknown>
  onOpenEntity: (kind: string, seq?: number) => void
  onOpenSwitcher: () => void
  onAsk?: (text: string) => void
  retryLabel: string
  unavailableLabel: string
}) {
  if (props.onAsk) {
    const dispose = registerAmicodeAskBridge({
      send: (text) => props.onAsk?.(text),
      hasUserReplyAfter: (messageID) => hasUserReplyAfter(props.messages, messageID),
    })
    onCleanup(dispose)
  }
  const disposeUiBridge = registerAmicodeUiBridge({
    openEntity: (kind, seq) => props.onOpenEntity(kind, seq),
    openSwitcher: () => props.onOpenSwitcher(),
    fetchRunSeries: props.fetchRunSeries,
  })
  onCleanup(disposeUiBridge)

  // Session gate + refetch key: completed amicode parts bump the counter → refetch.
  const amicodeParts = createMemo(() => {
    let any = 0
    let completed = 0
    for (const message of props.messages) {
      for (const part of props.partsFor(message.id) ?? []) {
        if (part?.type !== "tool" || typeof part.tool !== "string") continue
        if (!part.tool.startsWith("amicode_")) continue
        any++
        if (part.state?.status === "completed") completed++
      }
    }
    return { any, completed }
  })

  const [problemRaw, { refetch }] = createResource(
    () => (amicodeParts().any > 0 ? amicodeParts().completed + 1 : undefined),
    () => props.fetchProblem(),
  )
  const [lastGood, setLastGood] = createSignal<ProblemView | undefined>(undefined)
  const current = createMemo<ProblemView | undefined>(() => {
    if (problemRaw.error) return { ok: false, entities: {}, scoreStages: [], events: [], runs: [], error: "fetch failed" }
    const raw = problemRaw.latest
    if (raw === undefined) return undefined
    return parseProblemResponse(raw)
  })
  createEffect(() => {
    const view = current()
    if (view?.ok) setLastGood(view)
  })
  const state = createMemo(() => railState(current(), lastGood()))

  // Run chip live state: poll run-status while any referenced run is unfinished.
  // Feeds ONLY the run chip — never other chips, never a problem refetch.
  const [runStatuses, setRunStatuses] = createSignal<RunStatusView[]>([])
  let timer: ReturnType<typeof setInterval> | undefined
  const stopPolling = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }
  createEffect(() => {
    const snapshot = state()
    const hasRuns = snapshot.kind === "ready" && snapshot.view.runs.length > 0
    const unfinished =
      hasRuns && !runStatuses().length
        ? true
        : runStatuses().some((status) => status.status === "solving")
    if (hasRuns && unfinished && timer === undefined) {
      timer = setInterval(async () => {
        const statuses = parseRunStatusResponse(await props.fetchRunStatus().catch(() => undefined))
        setRunStatuses(statuses)
        if (statuses.length > 0 && statuses.every((status) => status.status !== "solving")) stopPolling()
      }, RUN_POLL_MS)
    }
    if (!hasRuns) stopPolling()
  })
  onCleanup(stopPolling)

  const chips = createMemo(() => {
    const snapshot = state()
    if (snapshot.kind !== "ready") return []
    return mergeChips(snapshot.view.entities, snapshot.view.scoreStages)
  })
  const runText = createMemo(() => runChipText(runStatuses()))
  const problemName = createMemo(() => {
    const snapshot = state()
    if (snapshot.kind !== "ready") return undefined
    return snapshot.view.name ?? snapshot.view.slug
  })

  return (
    <Show when={amicodeParts().any > 0}>
      <div
        data-component="amicode-entity-rail"
        style={{
          "display": "flex",
          "flex-wrap": "wrap",
          "align-items": "center",
          "gap": "6px 10px",
          "min-width": "0",
          "max-height": "76px",
          "overflow-y": "auto",
          "border": "1px solid var(--v2-border-border-base)",
          "border-left": "3px solid var(--v2-icon-icon-accent)",
          "border-radius": "6px",
          "background": "var(--v2-background-bg-layer-01)",
          "padding": "6px 10px",
          "font-size": "11px",
          "line-height": "16px",
          "white-space": "nowrap",
        }}
      >
        <span
          style={{
            "font-weight": "700",
            "letter-spacing": "0.08em",
            "color": "var(--v2-text-text-accent)",
            "flex-shrink": "0",
          }}
        >
          AMICO
        </span>
        <Show
          when={state().kind !== "unavailable"}
          fallback={
            <span style={{ color: "var(--v2-text-text-muted)", display: "inline-flex", gap: "6px" }}>
              {props.unavailableLabel}
              <button
                type="button"
                data-slot="amicode-rail-retry"
                style={{
                  "color": "var(--v2-text-text-base)",
                  "text-decoration": "underline",
                  "background": "none",
                  "border": "none",
                  "padding": "0",
                  "font": "inherit",
                  "cursor": "pointer",
                }}
                onClick={() => void refetch()}
              >
                {props.retryLabel}
              </button>
            </span>
          }
        >
          <Show when={problemName()}>
            {(name) => (
              <button
                type="button"
                data-slot="amicode-rail-problem"
                style={{
                  "font-weight": "600",
                  "color": "var(--v2-text-text-base)",
                  "background": "none",
                  "border": "none",
                  "padding": "0",
                  "font-size": "inherit",
                  "cursor": "pointer",
                  "flex-shrink": "0",
                }}
                onClick={() => props.onOpenSwitcher()}
              >
                {name()} ▾
              </button>
            )}
          </Show>
          <For each={chips()}>
            {(chip) => (
              <Show
                when={!chip.pending}
                fallback={
                  <span
                    data-slot="amicode-rail-chip"
                    data-stage={chip.kind}
                    data-pending="true"
                    style={{
                      "display": "inline-flex",
                      "align-items": "baseline",
                      "gap": "4px",
                      "flex-shrink": "0",
                      "color": "var(--v2-text-text-faint)",
                    }}
                  >
                    <span style={{ "font-weight": "600" }}>{chip.label}</span>
                    <span>—</span>
                  </span>
                }
              >
                <button
                  type="button"
                  data-slot="amicode-rail-chip"
                  data-stage={chip.kind}
                  style={{
                    "display": "inline-flex",
                    "align-items": "baseline",
                    "gap": "4px",
                    "flex-shrink": "0",
                    "background": "none",
                    "border": "none",
                    "padding": "0",
                    "font": "inherit",
                    "cursor": "pointer",
                  }}
                  onClick={() => props.onOpenEntity(chip.kind)}
                >
                  <span style={{ color: "var(--v2-text-text-muted)", "font-weight": "600" }}>{chip.label}</span>
                  <span
                    style={{
                      "color": "var(--v2-text-text-base)",
                      "font-family": "var(--font-family-mono, ui-monospace, monospace)",
                    }}
                  >
                    {chip.kind === "run" ? (runText() ?? chip.text ?? "recorded") : (chip.text ?? "recorded ✓")}
                  </span>
                </button>
              </Show>
            )}
          </For>
        </Show>
      </div>
    </Show>
  )
}
