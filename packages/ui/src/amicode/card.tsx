import { Show, createMemo } from "solid-js"
import { amicodeStage } from "./stage"

// AMICODE Layer-2 renderer slot: distinct card for amicode_* tool-call parts.
// All presentation lives here; the only touch to stock code is the single
// dispatch branch in ../components/message-part.tsx (see AMICODE-PATCHES.md).
// Props are a structural subset of ToolProps (message-part.tsx) — kept local
// to avoid an import cycle with the dispatcher.

export function AmicodeToolCard(props: {
  tool: string
  input?: Record<string, any>
  output?: string
  status?: string
}) {
  const stage = createMemo(() => amicodeStage(props.tool))
  const running = createMemo(() => props.status === "pending" || props.status === "running")
  const body = createMemo(() => {
    if (typeof props.output === "string" && props.output.length > 0) return props.output
    const input = props.input
    if (input && Object.keys(input).length > 0) return JSON.stringify(input, null, 2)
    return ""
  })

  return (
    <div
      data-component="amicode-card"
      data-tool={props.tool}
      style={{
        "border": "1px solid var(--v2-border-border-base)",
        "border-left": "3px solid var(--v2-icon-icon-accent)",
        "border-radius": "6px",
        "background": "var(--v2-background-bg-layer-01)",
        "padding": "8px 12px",
        "display": "flex",
        "flex-direction": "column",
        "gap": "6px",
        "min-width": "0",
      }}
    >
      <div
        data-slot="amicode-card-header"
        style={{
          "display": "flex",
          "align-items": "baseline",
          "gap": "8px",
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
        <Show when={props.status}>
          <span
            data-slot="amicode-card-status"
            style={{ "margin-left": "auto", color: "var(--v2-text-text-muted)" }}
          >
            {running() ? "running…" : props.status}
          </span>
        </Show>
      </div>
      <Show when={body()}>
        <pre
          data-slot="amicode-card-body"
          style={{
            "margin": "0",
            "font-family": "var(--font-family-mono, ui-monospace, monospace)",
            "font-size": "12px",
            "line-height": "18px",
            "white-space": "pre-wrap",
            "word-break": "break-word",
            "overflow-x": "auto",
            "max-height": "320px",
            "overflow-y": "auto",
            "color": "var(--v2-text-text-base)",
          }}
        >
          {body()}
        </pre>
      </Show>
    </div>
  )
}
