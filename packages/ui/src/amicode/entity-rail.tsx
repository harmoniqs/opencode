import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { hasUserReplyAfter } from "./ask"
import { registerAmicodeAskBridge } from "./ask-bridge"
import { Icon } from "../components/icon"
import { registerAmicodeUiBridge, type AmicodeWidgetHost } from "./ui-bridge"
import {
  type ProblemView,
  type RunStatusView,
  mergeChips,
  parseProblemResponse,
  parseRunStatusResponse,
  railState,
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

// One line-icon per entity kind (glyphs live in the shared family — icon.tsx).
function chipIcon(kind: string) {
  switch (kind) {
    case "system":
      return "target"
    case "formulation":
      return "sliders"
    case "run":
      return "archive"
    case "pulse":
      return "activity"
    case "device_session":
      return "status"
    default:
      return "dot-grid"
  }
}

export function AmicodeEntityRail(props: {
  messages: readonly { id: string; role?: string }[]
  partsFor: (messageID: string) => readonly RailPart[] | undefined
  fetchProblem: () => Promise<unknown>
  fetchRunStatus: () => Promise<unknown>
  fetchRunSeries?: (run: string, lab?: string) => Promise<unknown>
  // Stage 2: transport for the in-chat widget preview (frame src + host
  // callbacks + pin). Optional so hosts that can't render widgets omit it.
  widgetHost?: AmicodeWidgetHost
  onOpenEntity: (kind: string, seq?: number) => void
  onAsk?: (text: string) => void
  // Bridge-agnostic: fired when the user clicks "Inspect Run". The app wires it
  // to the host (postAmicode → amicode.openInspector) and passes it only when
  // framed in Amicode, so the button stays hidden everywhere else.
  onInspectRun?: () => void
  retryLabel: string
  unavailableLabel: string
  // Inline entity views: the composer draft target for the ✎ affordance and the
  // edit label — the rail forwards both to the ui bridge for the in-chat view.
  onDraftPrompt?: (text: string) => void
  editLabel?: string
}) {
  if (props.onAsk) {
    const dispose = registerAmicodeAskBridge({
      send: (text) => props.onAsk?.(text),
      hasUserReplyAfter: (messageID) => hasUserReplyAfter(props.messages, messageID),
    })
    onCleanup(dispose)
  }
  // The ui bridge (openEntity + the in-transcript entity-view transport) is
  // registered below, once the live problem view, run statuses, and refetch it
  // exposes are all in scope.

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
    if (problemRaw.error)
      return { ok: false, entities: {}, scoreStages: [], events: [], runs: [], error: "fetch failed" }
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
      hasRuns && !runStatuses().length ? true : runStatuses().some((status) => status.status === "solving")
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

  // Register the ui bridge now that current()/runStatuses()/refetch exist. The
  // rail chips still open the current-version modal via openEntity; the added
  // transport lets the in-transcript receipt cards render the full entity view
  // inline (Kate 2026-07-24) without a second fetch path.
  const disposeUiBridge = registerAmicodeUiBridge({
    openEntity: (kind, seq) => props.onOpenEntity(kind, seq),
    fetchRunSeries: props.fetchRunSeries,
    widgetHost: props.widgetHost,
    problemView: () => current(),
    runStatus: () => runStatuses(),
    draftPrompt: props.onDraftPrompt,
    refetchProblem: () => void refetch(),
    retryLabel: props.retryLabel,
    editLabel: props.editLabel,
  })
  onCleanup(disposeUiBridge)

  const chips = createMemo(() => {
    const snapshot = state()
    if (snapshot.kind !== "ready") return []
    return mergeChips(snapshot.view.entities, snapshot.view.scoreStages)
  })
  // Whether there is a run to inspect — gates the "Inspect Run" button so it
  // appears alongside the live run chip, not before any solve has started.
  const hasRun = createMemo(() => {
    const snapshot = state()
    return snapshot.kind === "ready" && snapshot.view.runs.length > 0
  })

  return (
    <Show when={amicodeParts().any > 0}>
      <div data-component="amicode-entity-rail">
        <Show
          when={state().kind !== "unavailable"}
          fallback={
            <div class="amc-rail-chips">
              <span style={{ color: "var(--v2-text-text-muted)" }}>{props.unavailableLabel}</span>
              <button
                type="button"
                data-slot="amicode-rail-retry"
                style={{
                  color: "var(--v2-text-text-base)",
                  "text-decoration": "underline",
                  background: "none",
                  border: "none",
                  padding: "0",
                  font: "inherit",
                  cursor: "pointer",
                }}
                onClick={() => void refetch()}
              >
                {props.retryLabel}
              </button>
            </div>
          }
        >
          {/* Static entity chips (Kate 2026-07-24): label ONLY — no value, no
              chevron / + icon. A recorded (clickable) chip carries the soft-yellow
              fill as its affordance and opens its current version; a not-yet-
              recorded chip is inert with a dotted border. The problem name sits in
              the bottom-right corner as a thin, low-contrast watermark. */}
          <div class="amc-rail-chips">
            <For each={chips()}>
              {(chip) => (
                <Show
                  when={!chip.pending}
                  fallback={
                    <span
                      class="amc-rail-chip is-empty"
                      data-slot="amicode-rail-chip"
                      data-stage={chip.kind}
                      data-pending="true"
                    >
                      <Icon name={chipIcon(chip.kind)} size="small" />
                      {chip.label}
                    </span>
                  }
                >
                  <button
                    type="button"
                    class="amc-rail-chip"
                    data-slot="amicode-rail-chip"
                    data-stage={chip.kind}
                    aria-label={`Open current ${chip.label}`}
                    onClick={() => props.onOpenEntity(chip.kind)}
                  >
                    <Icon name={chipIcon(chip.kind)} size="small" />
                    {chip.label}
                  </button>
                </Show>
              )}
            </For>
            <Show when={props.onInspectRun && hasRun()}>
              <button
                type="button"
                data-slot="amicode-rail-inspect"
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  "flex-shrink": "0",
                  gap: "4px",
                  border: "1px solid var(--v2-border-border-base)",
                  "border-radius": "var(--radius-md)",
                  background: "none",
                  color: "var(--v2-text-text-accent)",
                  padding: "1px 8px",
                  font: "inherit",
                  "font-weight": "600",
                  cursor: "pointer",
                }}
                title="Open the Run Inspector panel"
                onClick={() => props.onInspectRun?.()}
              >
                Inspect Run
              </button>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  )
}
