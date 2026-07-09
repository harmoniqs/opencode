import { Match, Show, Switch, createMemo } from "solid-js"
import { amicodeStage } from "./stage"
import { parseAskInput } from "./ask"
import { AmicodeAskCard } from "./ask-card"
import { parseDiffSentinel, receiptText } from "./receipt"
import { openAmicodeEntity } from "./ui-bridge"
import { RunWindow } from "./run-window"

// spec C: when an amicode_solve recorded a run_dir, its sentinel carries the
// path (well under the 120-char truncation cap) — extract lab/run_id from the
// last two segments so the part renders a live run window instead of a chip.
function runRefFromOutput(output: unknown): { run: string; lab?: string } | undefined {
  const sentinel = parseDiffSentinel(output)
  if (!sentinel || sentinel.entity !== "run") return undefined
  for (const [key, entry] of Object.entries(sentinel.diff)) {
    if (!/run_dir$/.test(key)) continue
    const value = entry.to
    if (typeof value !== "string" || value.trim() === "" || value.endsWith("…")) continue
    const parts = value.replace(/\/+$/, "").split("/")
    const run = parts[parts.length - 1]
    const lab = parts[parts.length - 2]
    if (run) return { run, lab }
  }
  return undefined
}

// AMICODE Layer-2 renderer slot: one-line DIFF RECEIPT for amicode_* tool-call
// parts (parsed from the AMICODE_DIFF sentinel — spec B), falling back to the
// legacy status chip when no sentinel parses (old sessions keep rendering);
// amicode_ask still renders the interactive question card. The raw tool return
// is agent-directed text and is deliberately NOT rendered — durable state
// lives in the problem rail (./entity-rail.tsx). Receipt click opens the
// entity view through the ui-bridge (no-op until the rail registers it).

function Chip(props: { tool: string; status?: string; output?: string }) {
  const stage = createMemo(() => amicodeStage(props.tool))
  const running = () => props.status === "pending" || props.status === "running"
  const sentinel = createMemo(() => (props.status === "completed" ? parseDiffSentinel(props.output) : undefined))

  return (
    <div
      data-component="amicode-card"
      data-tool={props.tool}
      onClick={() => {
        const parsed = sentinel()
        if (parsed) openAmicodeEntity(parsed.entity, parsed.seq)
      }}
      style={{
        display: "flex",
        "align-items": "baseline",
        gap: "8px",
        "min-width": "0",
        border: "1px solid var(--v2-border-border-base)",
        "border-radius": "6px",
        background: "var(--v2-background-bg-layer-01)",
        padding: "4px 12px",
        "font-size": "12px",
        "line-height": "16px",
        cursor: sentinel() ? "pointer" : "default",
      }}
    >
      <span
        style={{
          "font-weight": "700",
          "letter-spacing": "0.08em",
          color: "var(--v2-text-text-accent)",
        }}
      >
        AMICO
      </span>
      <span style={{ color: "var(--v2-text-text-faint)" }}>·</span>
      <Show
        when={sentinel()}
        fallback={
          <>
            <span data-slot="amicode-card-stage" style={{ "font-weight": "600", color: "var(--v2-text-text-base)" }}>
              {stage()}
            </span>
            <span data-slot="amicode-card-status" style={{ color: "var(--v2-text-text-muted)" }}>
              {running() ? "running…" : props.status === "completed" ? "updated ✓" : (props.status ?? "")}
            </span>
          </>
        }
      >
        {(value) => (
          <span
            data-slot="amicode-card-receipt"
            style={{
              color: "var(--v2-text-text-base)",
              "min-width": "0",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
            }}
          >
            {receiptText(value())}
          </span>
        )}
      </Show>
    </div>
  )
}

export function AmicodeToolCard(props: {
  tool: string
  status?: string
  input?: Record<string, any>
  output?: string // passed by message-part.tsx's Dynamic (already wired)
  messageID?: string
  sessionID?: string
}) {
  const ask = createMemo(() => (props.tool === "amicode_ask" ? parseAskInput(props.input) : undefined))
  const runRef = createMemo(() => (props.tool === "amicode_solve" ? runRefFromOutput(props.output) : undefined))

  return (
    <Switch fallback={<Chip tool={props.tool} status={props.status} output={props.output} />}>
      <Match when={ask()}>
        {(value) => <AmicodeAskCard ask={value()} messageID={props.messageID} sessionID={props.sessionID} />}
      </Match>
      <Match when={runRef()}>{(ref) => <RunWindow run={ref().run} lab={ref().lab} />}</Match>
    </Switch>
  )
}
