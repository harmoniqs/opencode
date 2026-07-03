import { For, Show, createMemo } from "solid-js"
import { RAIL_STAGES, type RailStage, chipTextFromSummary, railStage } from "./stage"

// AMICODE Layer-3 entity rail: one compact sticky row per session view showing
// the LATEST System / Formulation / Run state, derived client-side from the
// session's amicode_* tool parts. Renders nothing until the session contains
// at least one amicode_* tool part (keeps non-amicode sessions stock).
// Mounted from the session timeline's sticky header (see AMICODE-PATCHES.md).

interface RailPartState {
  status?: string
  output?: string
}

interface RailPart {
  type?: string
  tool?: string
  state?: RailPartState
}

export function AmicodeEntityRail(props: {
  messages: readonly { id: string }[]
  partsFor: (messageID: string) => readonly RailPart[] | undefined
}) {
  const derived = createMemo(() => {
    const latest: Partial<Record<RailStage, { text?: string; status?: string }>> = {}
    let any = false
    // Message ids are ULIDs → lexicographic sort = chronological order.
    const ordered = [...props.messages].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (const message of ordered) {
      for (const part of props.partsFor(message.id) ?? []) {
        if (part?.type !== "tool" || typeof part.tool !== "string") continue
        if (!part.tool.startsWith("amicode_")) continue
        any = true
        const stage = railStage(part.tool)
        if (!stage) continue
        latest[stage] = {
          text: chipTextFromSummary(part.state?.output),
          status: part.state?.status,
        }
      }
    }
    return { any, latest }
  })

  const chipValue = (stage: RailStage) => {
    const entity = derived().latest[stage]
    if (!entity) return undefined
    if (entity.text) return entity.text
    if (entity.status === "pending" || entity.status === "running") return "running…"
    if (entity.status === "completed") return "updated ✓"
    return entity.status
  }

  return (
    <Show when={derived().any}>
      <div
        data-component="amicode-entity-rail"
        style={{
          "display": "flex",
          "align-items": "center",
          "gap": "10px",
          "min-width": "0",
          "overflow-x": "auto",
          "border": "1px solid var(--v2-border-border-base)",
          "border-left": "3px solid var(--v2-icon-icon-accent)",
          "border-radius": "6px",
          "background": "var(--v2-background-bg-layer-01)",
          "padding": "4px 10px",
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
          AMICODE
        </span>
        <For each={RAIL_STAGES}>
          {(stage) => (
            <span
              data-slot="amicode-rail-chip"
              data-stage={stage}
              style={{ display: "inline-flex", "align-items": "baseline", gap: "4px", "flex-shrink": "0" }}
            >
              <span style={{ color: "var(--v2-text-text-muted)", "font-weight": "600" }}>{stage}</span>
              <Show
                when={chipValue(stage)}
                fallback={<span style={{ color: "var(--v2-text-text-faint)" }}>—</span>}
              >
                {(value) => (
                  <span
                    style={{
                      "color": "var(--v2-text-text-base)",
                      "font-family": "var(--font-family-mono, ui-monospace, monospace)",
                    }}
                  >
                    {value()}
                  </span>
                )}
              </Show>
            </span>
          )}
        </For>
      </div>
    </Show>
  )
}
