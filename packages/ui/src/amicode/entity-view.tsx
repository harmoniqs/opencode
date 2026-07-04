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
    <div class="flex flex-col gap-3 pl-6 pr-2.5 pb-3" data-component="amicode-entity-view" data-kind={props.kind}>
      <Show
        when={props.view}
        fallback={<div class="h-8 rounded-md bg-surface-raised-base animate-pulse" aria-hidden />}
      >
        {(view) => (
          <Show
            when={view().ok}
            fallback={
              <div class="flex items-center gap-2 w-full">
                <div class="size-1.5 rounded-full shrink-0 bg-icon-critical-base" />
                <span class="text-14-regular text-text-weak flex-1 truncate">{view().error}</span>
                <button
                  type="button"
                  class="text-12-regular text-text-base underline shrink-0"
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
                    classList={{
                      "text-11-regular px-1.5 py-0.5 rounded-md shrink-0": true,
                      "bg-surface-warning-base text-text-warning-base": tier() === "free",
                      "bg-surface-base text-text-weak": tier() !== "free",
                    }}
                    data-slot="amicode-entity-tier"
                    data-tier={tier()}
                  >
                    {tier() === "free" ? "free · unvetted" : tier()}
                  </span>
                </div>
              )}
            </Show>
            <Show when={hamiltonian()}>
              {(html) => (
                <div
                  class="text-14-regular text-text-base overflow-x-auto"
                  data-slot="amicode-entity-hamiltonian"
                  innerHTML={html()}
                />
              )}
            </Show>
            <Show
              when={rows().length > 0}
              fallback={<div class="text-14-regular text-text-weak">—</div>}
            >
              <div class="flex flex-col" data-slot="amicode-entity-fields">
                <For each={rows()}>
                  {(row) => (
                    <div class="flex items-baseline gap-3 py-0.5 min-w-0">
                      <span class="text-12-regular text-text-weak w-32 shrink-0 truncate">{row.key}</span>
                      <span class="text-14-regular text-text-base flex-1 truncate font-mono">{row.value}</span>
                      <button
                        type="button"
                        class="text-12-regular text-text-weak underline shrink-0 opacity-70 hover:opacity-100"
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
              <div class="flex flex-col gap-1" data-slot="amicode-entity-history">
                <span class="text-11-regular text-text-weaker uppercase tracking-wide">History</span>
                <For each={history()}>
                  {(event) => (
                    <div
                      class="flex items-baseline gap-2 min-w-0"
                      data-slot="amicode-entity-event"
                      data-anchored={anchored() === event.seq ? "true" : undefined}
                      ref={(el) => {
                        if (anchored() === event.seq) queueMicrotask(() => el.scrollIntoView({ block: "nearest" }))
                      }}
                    >
                      <span class="text-11-regular text-text-weaker shrink-0">#{event.seq}</span>
                      <Show when={event.ts}>
                        <span class="text-11-regular text-text-weaker shrink-0">{event.ts}</span>
                      </Show>
                      <Show when={event.source?.tool ?? event.source?.stage}>
                        {(source) => <span class="text-11-regular text-text-weak shrink-0">{source()}</span>}
                      </Show>
                      <span class="text-12-regular text-text-base truncate">
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
            </Show>
          </Show>
        )}
      </Show>
    </div>
  )
}
