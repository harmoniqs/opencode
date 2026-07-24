import { For, Show, createMemo } from "solid-js"
import { AmicoMark } from "./spinner"
import {
  type ProblemView,
  type RunStatusView,
  calibrationVerdict,
  deviceVerdict,
  editPromptText,
  entityRows,
  fieldGroup,
  formatTs,
  historyRows,
  humanizeKey,
  runVerdict,
} from "./problem"
import { SystemComposite } from "./system-view"
import { FormulationView } from "./formulation-view"
import { RunVerdictView } from "./run-view"
import { DeviceView } from "./device-view"
import { CalibrationView } from "./calibration-view"

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
// (Event history removed 2026-07-23 — the change-log was meta-noise, not the
// decision-relevant physics; entity views surface current state only.)

export function AmicodeEntityView(props: {
  view: ProblemView | undefined // undefined → loading skeleton
  kind: string
  runStatus?: RunStatusView[] // live run-status (for the Run verdict); ignored otherwise
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
  const verdict = createMemo(() =>
    props.kind === "run" && props.view ? runVerdict(props.runStatus ?? [], props.view.runs) : null,
  )
  const deviceV = createMemo(() => (props.kind === "device_session" ? deviceVerdict(entity()) : null))
  const calibV = createMemo(() => (props.kind === "calibration" ? calibrationVerdict(entity(), Date.now()) : null))
  // A hero renders only when the kind has one AND it has content to show
  // (run/device/calibration return null when there's nothing worth surfacing,
  // so the raw field table takes over instead of showing an empty hero).
  const hasHero = createMemo(() => {
    switch (props.kind) {
      case "system":
      case "formulation":
        return true
      case "run":
        return verdict() !== null
      case "device_session":
        return deviceV() !== null
      case "calibration":
        return calibV() !== null
      default:
        return false
    }
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
            <Show when={latestTs()}>
              {(ts) => (
                <div class="amc-ev-meta">
                  <span>Updated {formatTs(ts())}</span>
                </div>
              )}
            </Show>

            <Show when={props.kind === "system"}>
              <SystemComposite entity={entity()} />
            </Show>
            <Show when={props.kind === "formulation"}>
              <FormulationView entity={entity()} />
            </Show>
            <Show when={props.kind === "run" && verdict()}>{(v) => <RunVerdictView verdict={v()} />}</Show>
            <Show when={props.kind === "device_session" && deviceV()}>{(v) => <DeviceView verdict={v()} />}</Show>
            <Show when={props.kind === "calibration" && calibV()}>{(v) => <CalibrationView verdict={v()} />}</Show>

            <Show when={!hasHero() && fieldRows().length === 0}>
              <div class="amc-ev-empty">No fields recorded yet.</div>
            </Show>

            {/* Raw field table only for kinds WITHOUT a hero (so their dialog
                isn't empty). Hero kinds surface their content directly — the
                "Show all fields" disclosure was removed (Kate 2026-07-23). */}
            <Show when={!hasHero() && fieldRows().length > 0}>
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
