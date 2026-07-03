import { createMemo } from "solid-js"
import { amicodeStage } from "./stage"

// AMICODE Layer-2 renderer slot: compact one-line chip for amicode_* tool-call
// parts. The raw tool return is agent-directed text (instructions for the
// MODEL, not the human), so it is deliberately NOT rendered here — the durable
// human-facing state lives in the entity rail (./entity-rail.tsx).
// The only touch to stock code is the dispatch branch in
// ../components/message-part.tsx (see AMICODE-PATCHES.md).

export function AmicodeToolCard(props: { tool: string; status?: string }) {
  const stage = createMemo(() => amicodeStage(props.tool))
  const running = () => props.status === "pending" || props.status === "running"

  return (
    <div
      data-component="amicode-card"
      data-tool={props.tool}
      style={{
        "display": "flex",
        "align-items": "baseline",
        "gap": "8px",
        "min-width": "0",
        "border": "1px solid var(--v2-border-border-base)",
        "border-left": "3px solid var(--v2-icon-icon-accent)",
        "border-radius": "6px",
        "background": "var(--v2-background-bg-layer-01)",
        "padding": "4px 12px",
        "font-size": "12px",
        "line-height": "16px",
      }}
    >
      <span
        style={{
          "font-weight": "700",
          "letter-spacing": "0.08em",
          "color": "var(--v2-text-text-accent)",
        }}
      >
        AMICODE
      </span>
      <span style={{ color: "var(--v2-text-text-faint)" }}>·</span>
      <span data-slot="amicode-card-stage" style={{ "font-weight": "600", "color": "var(--v2-text-text-base)" }}>
        {stage()}
      </span>
      <span data-slot="amicode-card-status" style={{ color: "var(--v2-text-text-muted)" }}>
        {running() ? "running…" : props.status === "completed" ? "updated ✓" : (props.status ?? "")}
      </span>
    </div>
  )
}
