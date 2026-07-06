import { For, Show, createMemo } from "solid-js"
import katex from "katex"
import { entityLabel, receiptText } from "./receipt"
import { type ProblemView, editPromptText, entityRows, historyRows } from "./problem"

// AMICODE ring-2 entity view (spec B): dialog BODY opened from a rail chip or
// diff receipt — current fields (pretty table + per-field "Edit in chat"
// draft handoff), event history for this entity ("which turn changed this"),
// and tier treatment on Run entities. READ-ONLY + edit-in-chat only: all
// writes route through the agent's tools (ring 0), so entity state and
// conversation never fork. Presentation-only over ./problem.ts helpers; the
// app owns fetching and wraps this in its Dialog.

// Known-platform Hamiltonians, rendered via the fork's existing katex (same
// dep marked.tsx uses). Unknown platform → no math block.
const HAMILTONIAN_LATEX: Record<string, string> = {
  transmon:
    "\\hat H = \\omega \\hat a^\\dagger \\hat a + \\tfrac{\\delta}{2}\\hat a^\\dagger \\hat a^\\dagger \\hat a \\hat a + u(t)(\\hat a + \\hat a^\\dagger)",
  rydberg:
    "\\hat H = \\tfrac{\\Omega(t)}{2}\\sum_i \\sigma_x^{(i)} - \\Delta(t)\\sum_i \\hat n_i + \\sum_{i<j} \\tfrac{C_6}{r_{ij}^6}\\hat n_i \\hat n_j",
}

export function AmicodeEntityView(props: {
  view: ProblemView | undefined // undefined → loading skeleton
  kind: string
  anchorSeq?: number
  onDraftPrompt: (text: string) => void
  onRetry: () => void
  retryLabel: string
  editLabel: string
}) {
  const entity = createMemo(() => props.view?.entities[props.kind] ?? {})
  const rows = createMemo(() => entityRows(entity()))
  const history = createMemo(() => (props.view ? historyRows(props.view.events, props.kind) : []))
  const anchored = createMemo(() =>
    props.anchorSeq !== undefined && history().some((event) => event.seq === props.anchorSeq)
      ? props.anchorSeq
      : undefined,
  )
  const runTier = createMemo(() => {
    if (props.kind !== "run" || !props.view) return undefined
    const refs = props.view.runs
    return refs.length > 0 ? (refs[refs.length - 1].tier ?? "vetted") : undefined
  })
  const hamiltonian = createMemo(() => {
    if (props.kind !== "system") return undefined
    const platform = entity().platform
    if (typeof platform !== "string") return undefined
    const latex = HAMILTONIAN_LATEX[platform]
    if (!latex) return undefined
    return katex.renderToString(latex, { throwOnError: false })
  })

  return (
    <div
      class="flex flex-col gap-3 py-2 pl-4 pr-3"
      data-component="amicode-entity-view"
      data-kind={props.kind}
      style={{ "border-left": "3px solid var(--v2-icon-icon-accent)" }}
    >
      <Show
        when={props.view}
        fallback={
          <div class="h-8 rounded-md animate-pulse" style={{ background: "var(--v2-background-bg-layer-02)" }} aria-hidden />
        }
      >
        {(view) => (
          <Show
            when={view().ok}
            fallback={
              <div class="flex items-center gap-2 w-full">
                <div class="size-1.5 rounded-full shrink-0" style={{ background: "var(--v2-state-bg-danger)" }} />
                <span class="text-14-regular flex-1 truncate" style={{ color: "var(--v2-text-text-muted)" }}>
                  {view().error}
                </span>
                <button
                  type="button"
                  class="text-12-regular underline shrink-0"
                  style={{ color: "var(--v2-text-text-base)" }}
                  data-slot="amicode-entity-retry"
                  onClick={props.onRetry}
                >
                  {props.retryLabel}
                </button>
              </div>
            }
          >
            <Show when={runTier()}>
              {(tier) => (
                <div class="flex items-center gap-2">
                  <span
                    class="text-11-regular px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide"
                    data-slot="amicode-entity-tier"
                    data-tier={tier()}
                    style={
                      tier() === "free"
                        ? { background: "var(--v2-state-bg-warning)", color: "var(--v2-state-fg-warning)" }
                        : { background: "var(--v2-background-bg-layer-02)", color: "var(--v2-text-text-muted)" }
                    }
                  >
                    {tier() === "free" ? "free · unvetted" : tier()}
                  </span>
                </div>
              )}
            </Show>
            <Show when={hamiltonian()}>
              {(html) => (
                <div
                  class="text-14-regular overflow-x-auto py-1"
                  style={{ color: "var(--v2-text-text-base)" }}
                  data-slot="amicode-entity-hamiltonian"
                  innerHTML={html()}
                />
              )}
            </Show>
            <Show
              when={rows().length > 0}
              fallback={
                <div class="text-14-regular" style={{ color: "var(--v2-text-text-muted)" }}>
                  —
                </div>
              }
            >
              <div class="flex flex-col" data-slot="amicode-entity-fields">
                <For each={rows()}>
                  {(row) => (
                    <div class="group flex items-baseline gap-3 py-1 min-w-0">
                      <span
                        class="text-11-regular w-32 shrink-0 truncate uppercase tracking-wide"
                        style={{ color: "var(--v2-text-text-muted)" }}
                      >
                        {row.key}
                      </span>
                      <span
                        class="text-14-regular flex-1 break-words font-mono"
                        style={{ color: "var(--v2-text-text-base)" }}
                      >
                        {row.value}
                      </span>
                      <button
                        type="button"
                        class="text-12-regular shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        style={{ color: "var(--v2-text-text-accent)" }}
                        data-slot="amicode-entity-edit"
                        title={props.editLabel}
                        onClick={() => props.onDraftPrompt(editPromptText(props.kind, row.key, row.value))}
                      >
                        ✎
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={history().length > 0}>
              <div class="flex flex-col gap-1.5" data-slot="amicode-entity-history">
                <span class="text-11-regular uppercase tracking-wide" style={{ color: "var(--v2-text-text-faint)" }}>
                  History
                </span>
                <div
                  class="flex flex-col gap-1.5 pl-3 ml-1"
                  style={{ "border-left": "1px solid var(--v2-border-border-muted)" }}
                >
                  <For each={history()}>
                    {(event) => (
                      <div
                        class="flex flex-col gap-0.5 min-w-0 rounded-[4px] px-1.5 py-1"
                        data-slot="amicode-entity-event"
                        data-anchored={anchored() === event.seq ? "true" : undefined}
                        style={
                          anchored() === event.seq ? { background: "var(--v2-background-bg-layer-02)" } : undefined
                        }
                        ref={(el) => {
                          if (anchored() === event.seq) queueMicrotask(() => el.scrollIntoView({ block: "nearest" }))
                        }}
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <span
                            class="text-11-regular font-mono px-1 rounded shrink-0"
                            style={{ background: "var(--v2-background-bg-layer-02)", color: "var(--v2-text-text-muted)" }}
                          >
                            #{event.seq}
                          </span>
                          <Show when={event.source?.tool ?? event.source?.stage}>
                            {(source) => (
                              <span
                                class="text-11-regular shrink-0 font-mono"
                                style={{ color: "var(--v2-text-text-muted)" }}
                              >
                                {source()}
                              </span>
                            )}
                          </Show>
                          <Show when={event.ts}>
                            <span
                              class="text-11-regular shrink-0 ml-auto"
                              style={{ color: "var(--v2-text-text-faint)" }}
                            >
                              {event.ts}
                            </span>
                          </Show>
                        </div>
                        <span class="text-12-regular break-words" style={{ color: "var(--v2-text-text-base)" }}>
                          {receiptText({
                            problem: "",
                            entity: event.entity,
                            action: event.action,
                            diff: (event.diff ?? {}) as Record<string, { from: unknown; to: unknown }>,
                          })}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        )}
      </Show>
    </div>
  )
}
