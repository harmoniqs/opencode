import { For, Match, Show, Switch, createMemo } from "solid-js"
import { amicodeStage } from "./stage"
import { parseAskInput } from "./ask"
import { AmicodeAskCard } from "./ask-card"
import { parseDiffSentinel, receiptParts } from "./receipt"
import { systemReceiptPieces } from "./facets"
import { compositeChip } from "./problem"
import { AmicoMark } from "./spinner"
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
//
// The card carries four states, differentiated in FORM, not just words: the
// H-mark is the spinner while working (running), settles under a green check
// when done with no diff, becomes a structured diff receipt when there is one,
// and turns its rail red on failure. It is a real <button> when it can open the
// entity (keyboard-reachable, focus ring) and a plain <div> otherwise. Styling
// lives in ./amicode.css; data-slot hooks are preserved for the e2e suite.

type DiffPiece = { key: string; from?: string; to?: string }

function Chip(props: { tool: string; status?: string; output?: string }) {
  const stage = createMemo(() => amicodeStage(props.tool))
  const running = () => props.status === "pending" || props.status === "running"
  const errored = () => props.status === "error" || props.status === "failed"
  const parts = createMemo(() => {
    if (props.status !== "completed") return undefined
    const sentinel = parseDiffSentinel(props.output)
    return sentinel ? { sentinel, receipt: receiptParts(sentinel) } : undefined
  })
  const clickable = () => !!parts()
  const diffPieces = createMemo<DiffPiece[]>(
    () =>
      parts()?.receipt.changes.map((change) =>
        change.kind === "elision"
          ? { key: "…" }
          : change.kind === "set"
            ? { key: change.key, to: change.to }
            : { key: change.key, from: change.from, to: change.to },
      ) ?? [],
  )
  // System entity: semantic composite receipt (spec §5) instead of JSON pieces.
  const systemReceipt = createMemo(() => {
    const p = parts()
    return p && p.sentinel.entity === "system" ? systemReceiptPieces(p.sentinel.diff) : undefined
  })
  const systemChip = createMemo(() => {
    const sr = systemReceipt()
    return sr?.kind === "chip" ? (compositeChip(sr.entity) ?? "updated") : undefined
  })
  const systemPieces = createMemo(() => {
    const sr = systemReceipt()
    return sr?.kind === "pieces" ? sr.pieces : undefined
  })
  const state = () =>
    errored() ? "error" : running() ? "running" : parts() ? "receipt" : props.status === "completed" ? "done" : "idle"
  const openLabel = () => `Open ${parts()?.receipt.label ?? stage()} details`
  const open = () => {
    const active = parts()
    if (active) openAmicodeEntity(active.sentinel.entity, active.sentinel.seq)
  }

  // Signature / body / trail are shared by the clickable (<button>) and inert
  // (<div>) shells. Split so the shell can be a real button only when there is
  // an entity to open — a bare <button> would inherit type="submit" and fire
  // the composer form; a plain onClick <div> would be invisible to the keyboard.
  const Sig = () => (
    <span class="amc-sig">
      <AmicoMark running={running()} />
      <span class="amc-wordmark">AMICO</span>
    </span>
  )
  const Body = () => (
    <Show
      when={parts()}
      fallback={
        <span class="amc-body">
          <span class="amc-label" data-slot="amicode-card-stage">
            {stage()}
          </span>
          <span class="amc-detail" data-slot="amicode-card-status">
            {running()
              ? "working…"
              : errored()
                ? "couldn’t complete"
                : props.status === "completed"
                  ? "updated"
                  : (props.status ?? "")}
          </span>
        </span>
      }
    >
      {(active) => (
        <span class="amc-body" data-slot="amicode-card-receipt">
          <span class="amc-label">{active().receipt.label}</span>
          <Show
            when={systemReceipt()}
            fallback={
              <For each={diffPieces()}>
                {(piece) => (
                  <span class="amc-diff">
                    <span class="k">{piece.key}</span>
                    <Show when={piece.from !== undefined}>
                      <span class="v from">{piece.from}</span>
                      <span class="arw" aria-hidden="true">
                        →
                      </span>
                    </Show>
                    <Show when={piece.to !== undefined}>
                      <span class="v">{piece.to}</span>
                    </Show>
                  </span>
                )}
              </For>
            }
          >
            <Show
              when={systemChip()}
              fallback={
                <For each={systemPieces()}>
                  {(p) => (
                    <span class="amc-diff" data-tone={p.tone}>
                      <span class="v">{p.text}</span>
                    </span>
                  )}
                </For>
              }
            >
              {(chip) => (
                <span class="amc-diff">
                  <span class="v">{chip()}</span>
                </span>
              )}
            </Show>
          </Show>
        </span>
      )}
    </Show>
  )
  const Trail = () => (
    <span class="amc-trail">
      <Switch>
        <Match when={state() === "done"}>
          <svg class="amc-tick" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </Match>
        <Match when={state() === "running"}>
          <span class="amc-livedot" aria-hidden="true" />
        </Match>
      </Switch>
      <Show when={clickable()}>
        <span class="amc-chev" aria-hidden="true">
          ›
        </span>
      </Show>
    </span>
  )

  return (
    <Show
      when={clickable()}
      fallback={
        <div data-component="amicode-card" data-tool={props.tool} data-state={state()} data-clickable="false">
          <Sig />
          <span class="amc-rule" aria-hidden="true" />
          <Body />
          <Trail />
        </div>
      }
    >
      <button
        type="button"
        data-component="amicode-card"
        data-tool={props.tool}
        data-state={state()}
        data-clickable="true"
        aria-label={openLabel()}
        onClick={open}
      >
        <Sig />
        <span class="amc-rule" aria-hidden="true" />
        <Body />
        <Trail />
      </button>
    </Show>
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
