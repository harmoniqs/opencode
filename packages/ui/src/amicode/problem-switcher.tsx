import { For, Show, createMemo } from "solid-js"
import type { ProblemsView } from "./problem"

// AMICODE ring-2 problem switcher (spec B): dialog BODY opened from the rail's
// problem name. Lists in-flight design workspaces (NOT the catalog — that is
// promoted pulse artifacts, Phase 3) with the active one marked. The UI is
// WRITE-FREE: "Open" and "New problem" are startPrompt SUBMIT handoffs — the
// agent calls amicode_problem, which moves the active pointer (all writes
// through ring 0). Presentation-only; the app owns fetching + the Dialog.

export function AmicodeProblemSwitcher(props: {
  view: ProblemsView | undefined // undefined → loading skeleton
  onStartPrompt: (text: string) => void
  onRetry: () => void
  retryLabel: string
  openLabel: string
  newLabel: string
}) {
  const sorted = createMemo(() => {
    const problems = props.view?.problems ?? []
    return [...problems.filter((p) => p.status !== "archived"), ...problems.filter((p) => p.status === "archived")]
  })

  return (
    <div class="flex flex-col gap-2 pl-6 pr-2.5 pb-3" data-component="amicode-problem-switcher">
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
                  data-slot="amicode-switcher-retry"
                  onClick={props.onRetry}
                >
                  {props.retryLabel}
                </button>
              </div>
            }
          >
            <For each={sorted()}>
              {(problem) => (
                <div
                  classList={{
                    "flex items-center gap-2 w-full min-w-0": true,
                    "opacity-50": problem.status === "archived",
                  }}
                  data-slot="amicode-switcher-row"
                  data-active={view().active === problem.slug ? "true" : undefined}
                >
                  <div
                    classList={{
                      "size-1.5 rounded-full shrink-0": true,
                      "bg-icon-accent-base": view().active === problem.slug,
                      "bg-icon-base": view().active !== problem.slug,
                    }}
                  />
                  <span class="text-14-regular text-text-base truncate">{problem.name}</span>
                  <Show when={view().active === problem.slug}>
                    <span class="text-11-regular text-text-weak shrink-0">active</span>
                  </Show>
                  <span class="text-11-regular text-text-weaker shrink-0">{problem.status}</span>
                  <div class="flex-1" />
                  <span class="text-12-regular text-text-weak shrink-0">{problem.entityKinds.length} entities</span>
                  <Show when={problem.recorded}>
                    <span class="text-11-regular text-text-weaker shrink-0">{problem.recorded}</span>
                  </Show>
                  <button
                    type="button"
                    class="text-12-regular text-text-base underline shrink-0"
                    data-slot="amicode-switcher-open"
                    onClick={() => props.onStartPrompt(`Open the problem "${problem.name}"`)}
                  >
                    {props.openLabel}
                  </button>
                </div>
              )}
            </For>
            <button
              type="button"
              class="text-12-regular text-text-base underline self-start"
              data-slot="amicode-switcher-new"
              onClick={() => props.onStartPrompt("Start a new problem: ")}
            >
              {props.newLabel}
            </button>
          </Show>
        )}
      </Show>
    </div>
  )
}
