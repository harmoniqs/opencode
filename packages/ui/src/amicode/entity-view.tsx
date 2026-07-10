import { For, Show, createMemo } from "solid-js"
import { AmicoMark } from "./spinner"
import { receiptParts } from "./receipt"
import { type ProblemView, editPromptText, entityRows, fieldGroup, formatTs, historyRows, humanizeKey } from "./problem"
import { SystemComposite } from "./system-view"
import { FormulationView } from "./formulation-view"

// AMICODE ring-2 entity view (spec B): dialog BODY opened from a rail chip or
// diff receipt — current fields (pretty table + per-field "Edit in chat"
// draft handoff), event history for this entity ("which turn changed this"),
// and tier treatment on Run entities. READ-ONLY + edit-in-chat only: all
// writes route through the agent's tools (ring 0), so entity state and
// conversation never fork. Presentation-only over ./problem.ts helpers; the
// app owns fetching and wraps this in its Dialog.
//
// Redesign: raw wire keys lead with a human label (params.drive_max → "Drive
// max") and keep the technical name underneath; nested groups get a subhead;
// the field you arrived from (anchorSeq's diff) is marked; the ✎ affordance is
// always faintly present, not hover-only; and a footer states the read-only /
// edit-in-chat contract so the absence of Save buttons reads as intent. Styling
// is in ./amicode.css; data-slot hooks are preserved for the e2e suite.

// (System Hamiltonian LaTeX now lives in ./system-view.tsx's SystemComposite.)

type DiffPiece = { key: string; from?: string; to?: string }

// One event's change list, keys humanized, rendered as discrete pieces. Empty
// diff → the bare action (e.g. "Created").
function eventPieces(
  entity: string,
  action: string,
  diff?: Record<string, { from: unknown; to: unknown }>,
): DiffPiece[] {
  const { changes } = receiptParts({ problem: "", entity, action, diff: diff ?? {} })
  return changes.map((change) =>
    change.kind === "elision"
      ? { key: "…" }
      : change.kind === "set"
        ? { key: humanizeKey(change.key), to: change.to }
        : { key: humanizeKey(change.key), from: change.from, to: change.to },
  )
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
  const changedKeys = createMemo(() => {
    const seq = anchored()
    const set = new Set<string>()
    if (seq === undefined) return set
    const event = history().find((candidate) => candidate.seq === seq)
    if (event?.diff)
      for (const key of Object.keys(event.diff)) {
        set.add(key)
        const bare = key.split(".").pop()
        if (bare) set.add(bare)
      }
    return set
  })
  const isChanged = (key: string) => {
    const set = changedKeys()
    return set.has(key) || set.has(key.split(".").pop() ?? key)
  }
  // Rows with a group-header flag when a nested group first appears (entityRows
  // flattens each object's children contiguously, so a group is one run).
  const fieldRows = createMemo(() => {
    let prevGroup: string | undefined
    return rows().map((row) => {
      const group = fieldGroup(row.key)
      const showGroupHeader = group !== undefined && group !== prevGroup
      prevGroup = group
      return {
        key: row.key,
        value: row.value,
        name: humanizeKey(row.key),
        groupLabel: group ? humanizeKey(group) : undefined,
        showGroupHeader,
      }
    })
  })
  const latestTs = createMemo(() => history()[0]?.ts)
  const runTier = createMemo(() => {
    if (props.kind !== "run" || !props.view) return undefined
    const refs = props.view.runs
    return refs.length > 0 ? (refs[refs.length - 1].tier ?? "vetted") : undefined
  })

  return (
    <div class="flex flex-col" data-component="amicode-entity-view" data-kind={props.kind}>
      <Show
        when={props.view}
        fallback={
          <div aria-hidden>
            <div class="amc-sk w40" />
            <div class="amc-sk" />
            <div class="amc-sk" />
            <div class="amc-sk w60" />
          </div>
        }
      >
        {(view) => (
          <Show
            when={view().ok}
            fallback={
              <div class="amc-ev-error">
                <span class="dot" />
                <span class="msg">{view().error}</span>
                <button type="button" class="amc-ev-retry" data-slot="amicode-entity-retry" onClick={props.onRetry}>
                  {props.retryLabel}
                </button>
              </div>
            }
          >
            <Show when={runTier() || latestTs()}>
              <div class="amc-ev-meta">
                <Show when={runTier()}>
                  {(tier) => (
                    <span class="amc-tier" data-slot="amicode-entity-tier" data-tier={tier()}>
                      {tier() === "free" ? "free · unvetted" : tier()}
                    </span>
                  )}
                </Show>
                <Show when={latestTs()}>{(ts) => <span>Updated {formatTs(ts())}</span>}</Show>
              </div>
            </Show>

            <Show when={props.kind === "system"}>
              <SystemComposite entity={entity()} />
            </Show>
            <Show when={props.kind === "formulation"}>
              <FormulationView entity={entity()} />
            </Show>

            <Show
              when={props.kind !== "system" && props.kind !== "formulation" && fieldRows().length > 0}
              fallback={
                props.kind === "system" || props.kind === "formulation" ? null : (
                  <div class="amc-ev-empty">No fields recorded yet.</div>
                )
              }
            >
              <div class="amc-ev-sec">Details</div>
              <div class="flex flex-col" data-slot="amicode-entity-fields">
                <For each={fieldRows()}>
                  {(row) => (
                    <>
                      <Show when={row.showGroupHeader}>
                        <div class="amc-ev-group">{row.groupLabel}</div>
                      </Show>
                      <div class="amc-field">
                        <span class="amc-fk">
                          <span class="name">{row.name}</span>
                          <span class="raw">{row.key}</span>
                        </span>
                        <span class="amc-fv" classList={{ changed: isChanged(row.key) }}>
                          {row.value}
                        </span>
                        <button
                          type="button"
                          class="amc-edit"
                          data-slot="amicode-entity-edit"
                          title={props.editLabel}
                          aria-label={`${props.editLabel}: ${row.name}`}
                          onClick={() => props.onDraftPrompt(editPromptText(props.kind, row.key, row.value))}
                        >
                          <span aria-hidden="true">✎</span>
                          <span class="amc-edit-label">{props.editLabel}</span>
                        </button>
                      </div>
                    </>
                  )}
                </For>
              </div>
            </Show>

            <Show when={history().length > 0}>
              <div class="amc-ev-sec">History</div>
              <div class="amc-timeline" data-slot="amicode-entity-history">
                <For each={history()}>
                  {(event) => (
                    <div
                      class="amc-event"
                      data-slot="amicode-entity-event"
                      data-anchored={anchored() === event.seq ? "true" : undefined}
                      ref={(el) => {
                        if (anchored() === event.seq) queueMicrotask(() => el.scrollIntoView({ block: "nearest" }))
                      }}
                    >
                      <div class="erow">
                        <span class="seq">#{event.seq}</span>
                        <Show when={event.source?.tool ?? event.source?.stage}>
                          {(source) => <span class="src">{source()}</span>}
                        </Show>
                        <Show when={event.ts}>{(ts) => <span class="when">{formatTs(ts())}</span>}</Show>
                      </div>
                      <div class="summary">
                        <Show
                          when={eventPieces(event.entity, event.action, event.diff).length > 0}
                          fallback={<span>{event.action ? humanizeKey(event.action) : "—"}</span>}
                        >
                          <For each={eventPieces(event.entity, event.action, event.diff)}>
                            {(piece, index) => (
                              <>
                                <Show when={index() > 0}>
                                  <span class="arw" aria-hidden="true">
                                    ·
                                  </span>
                                </Show>
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
                              </>
                            )}
                          </For>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class="amc-ev-foot">
              <AmicoMark />
              <span>
                Read-only. <b>Changes are made by asking AMICO in chat</b> — ✎ drafts the message for you.
              </span>
            </div>
          </Show>
        )}
      </Show>
    </div>
  )
}
