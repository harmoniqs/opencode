import { createMemo, createSignal, For, Show, type JSX } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { applyLedgerKeyDown, type LedgerResourceRow, type LedgerView } from "./lineage-ledger-view"
import "./lineage-ledger-panel.css"

export type LineageLedgerPanelProps = {
  // The already-projected, capability-gated view model. The panel renders THIS
  // and nothing else — it receives no tool metadata and no filesystem-observer
  // input, so it cannot infer ownership (amicode#1082 AC1).
  view: () => LedgerView
  filter: () => string
  onFilterChange: (value: string) => void
  // Advances the resource page cursor across a large root ledger (AC6).
  onLoadMore?: () => void
  title?: JSX.Element
}

/**
 * Files Changed, rendered as the unified lineage ledger (amicode#1082): one
 * canonical-resource row per resource with expandable receipt + assessment
 * history, a dedicated Unknown Mutation Receipts group, an explicit capability
 * label, and full keyboard operation across both themes.
 */
export function LineageLedgerPanel(props: LineageLedgerPanelProps) {
  const view = createMemo(() => props.view())
  const capability = () => view().capability
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set())
  const rowRefs = new Map<string, HTMLButtonElement>()

  const isExpanded = (id: string) => expanded().has(id)
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const collapse = (id: string) =>
    setExpanded((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })

  const query = () => props.filter().trim().toLowerCase()
  const resources = createMemo(() => {
    const value = query()
    if (!value) return view().resources
    return view().resources.filter(
      (row) => row.displayPath.toLowerCase().includes(value) || row.aliases.some((alias) => alias.toLowerCase().includes(value)),
    )
  })

  const onRowKeyDown = (event: KeyboardEvent, row: LedgerResourceRow) => {
    const action = applyLedgerKeyDown(event, { focusKind: "row", id: row.id, expanded: isExpanded(row.id) })
    if (action.type === "toggle") toggle(action.id)
    if (action.type === "collapse") {
      collapse(action.id)
      rowRefs.get(action.refocus)?.focus()
    }
  }

  const historyID = (id: string) => `lineage-ledger-history-${id}`

  return (
    <div data-component="lineage-ledger">
      <div data-slot="lineage-ledger-capability" role="status" data-mode={capability().mode}>
        <span data-slot="lineage-ledger-capability-label" class="text-12-medium text-text-base">
          {capability().label}
        </span>
        <span data-slot="lineage-ledger-capability-description" class="text-12-medium text-text-muted">
          {capability().description}
        </span>
      </div>

      <Show when={props.title}>{props.title}</Show>

      <input
        data-slot="lineage-ledger-filter"
        class="text-12-medium text-text-base"
        type="text"
        value={props.filter()}
        placeholder="Filter changed resources"
        aria-label="Filter changed resources"
        onInput={(event) => props.onFilterChange(event.currentTarget.value)}
      />

      <div data-slot="lineage-ledger-resources" role="list">
        <For each={resources()}>
          {(row) => (
            <div data-slot="lineage-ledger-resource" role="listitem" data-status={row.status.kind}>
              <button
                type="button"
                data-slot="lineage-ledger-resource-row"
                ref={(element) => rowRefs.set(row.id, element)}
                aria-expanded={isExpanded(row.id)}
                aria-controls={historyID(row.id)}
                onKeyDown={(event) => onRowKeyDown(event, row)}
                onClick={() => toggle(row.id)}
              >
                <Icon name={isExpanded(row.id) ? "chevron-down" : "chevron-right"} size="small" />
                <span class="filetree-iconpair size-4">
                  <FileIcon node={{ path: row.displayPath, type: "file" }} class="size-4" />
                </span>
                <span data-slot="lineage-ledger-path" class="text-12-medium text-text-base truncate">
                  {row.displayPath}
                </span>
                <Show when={row.aliases.length}>
                  <span data-slot="lineage-ledger-aliases" class="text-12-medium text-text-faint truncate">
                    {`was ${row.aliases.join(", ")}`}
                  </span>
                </Show>
                <span
                  data-slot="lineage-ledger-status"
                  data-status={row.status.kind}
                  data-tone={row.status.tone}
                  aria-label={row.status.accessibleName}
                >
                  <Icon name={row.status.icon} size="small" />
                  <span class="text-12-medium">{row.status.label}</span>
                </span>
                <span data-slot="lineage-ledger-count" class="text-12-medium text-text-faint">
                  {`${row.receiptCount} receipt${row.receiptCount === 1 ? "" : "s"}`}
                </span>
                <Show when={row.origins.length}>
                  <span data-slot="lineage-ledger-origins" class="text-12-medium text-text-faint">
                    {row.origins.join(", ")}
                  </span>
                </Show>
                <Show when={row.sources.length}>
                  <span data-slot="lineage-ledger-sources" class="text-12-medium text-text-faint">
                    {`from ${row.sources.join(", ")}`}
                  </span>
                </Show>
              </button>

              <Show when={isExpanded(row.id)}>
                <div id={historyID(row.id)} data-slot="lineage-ledger-history" role="region" aria-label={`History for ${row.displayPath}`}>
                  <For each={row.history}>
                    {(entry) => (
                      <div data-slot="lineage-ledger-history-entry">
                        <div data-slot="lineage-ledger-receipt" class="text-12-medium text-text-base">
                          {`#${entry.sequence} ${entry.operation ?? "operation"} → ${entry.outcome ?? "unknown"}`}
                          <Show when={entry.resource && entry.resource !== row.displayPath}>
                            <span class="text-text-faint">{` (${entry.resource})`}</span>
                          </Show>
                        </div>
                        <For each={entry.assessments}>
                          {(assessment) => (
                            <div data-slot="lineage-ledger-assessment" class="text-12-medium text-text-muted">
                              {`rev ${assessment.revision}: ${assessment.netState ?? "unknown"} · evidence ${assessment.evidenceState ?? "unavailable"}`}
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      <Show when={view().unknown.length}>
        <section data-slot="lineage-ledger-unknown" role="list" aria-label="Unknown Mutation Receipts">
          <div data-slot="lineage-ledger-unknown-heading" class="text-12-medium text-text-muted">
            {"Unknown Mutation Receipts"}
          </div>
          <For each={view().unknown}>
            {(item) => (
              <div data-slot="lineage-ledger-unknown-item" role="listitem" class="text-12-medium text-text-base">
                <Icon name="glasses" size="small" />
                <span>{`#${item.sequence} ${item.operation ?? "operation"} → ${item.outcome ?? "opaque"}`}</span>
                <Show when={item.origin}>
                  <span class="text-text-faint">{item.origin}</span>
                </Show>
              </div>
            )}
          </For>
        </section>
      </Show>

      <Show when={view().page.nextCursor !== undefined}>
        <button data-slot="lineage-ledger-more" type="button" class="text-12-medium text-text-base" onClick={() => props.onLoadMore?.()}>
          {"Show more"}
        </button>
      </Show>
    </div>
  )
}
