import { For, Show, createMemo, createSignal } from "solid-js"
import { WidgetFrame, type WidgetHostCallbacks } from "./widget-frame"
import { WidgetConfigForm } from "./widget-config-form"
import { formModel, type DashboardEntry, type DashboardState, type WidgetInfo } from "./widget-schema"
import type { Density } from "./widget-tokens"

// AMICODE (widget kernel): the dashboard — replaces the hardcoded
// AmicodeHomeCards strip. Renders the state's visible entries as sandboxed
// WidgetFrames: hero widgets in the top 2-column grid, tiles in the auto-fit
// row (same layout as the old cards at defaults). "Customize" flips edit
// mode: ▲▼ reorder within a row, × hide, ⚙ generated config form, a tray of
// hidden widgets to re-add, Fork on built-ins. Every change calls
// props.onSave immediately — the app POSTs and feeds the merged state back
// down. Reorder v1 is buttons, not drag (declared spec deviation): controls
// sit in a strip above each cell, so iframes never need a drag shield.
// Empty-state cells (widget reported height 0) leave the flow entirely
// outside edit mode; in edit mode they show as labeled placeholders so a
// tile that currently renders nothing stays reachable.

export function WidgetGrid(props: {
  widgets: WidgetInfo[]
  dashboard: DashboardState
  frameSrcs: Record<string, string> // widget id → /amicode/widget-frame URL
  tokens: Record<string, string>
  density: Density
  context: Record<string, unknown>
  callbacks: WidgetHostCallbacks
  onSave: (state: DashboardState) => void
  onFork: (id: string) => void
}) {
  const [editing, setEditing] = createSignal(false)
  const [configOpen, setConfigOpen] = createSignal<string | undefined>(undefined)
  const [empties, setEmpties] = createSignal<Record<string, boolean>>({})

  const infoFor = (id: string) => props.widgets.find((w) => w.id === id)
  const visible = createMemo(() => props.dashboard.widget.filter((e) => !e.hidden))
  const hidden = createMemo(() => props.dashboard.widget.filter((e) => e.hidden))
  const heroes = createMemo(() => visible().filter((e) => infoFor(e.id)?.size === "hero"))
  const tiles = createMemo(() => visible().filter((e) => infoFor(e.id)?.size !== "hero"))

  const save = (mutate: (entries: DashboardEntry[]) => DashboardEntry[]) => {
    props.onSave({ version: 1, widget: mutate(props.dashboard.widget.map((e) => ({ ...e }))) })
  }
  const setHidden = (key: string, value: boolean) =>
    save((entries) => entries.map((e) => (e.key === key ? { ...e, hidden: value } : e)))
  const setConfig = (key: string, field: string, value: unknown) =>
    save((entries) => entries.map((e) => (e.key === key ? { ...e, config: { ...e.config, [field]: value } } : e)))
  const move = (key: string, dir: -1 | 1) =>
    save((entries) => {
      const group = entries.filter((e) => !e.hidden && infoFor(e.id)?.size === infoFor(entries.find((x) => x.key === key)!.id)?.size)
      const gi = group.findIndex((e) => e.key === key)
      const swapWith = group[gi + dir]
      if (gi < 0 || !swapWith) return entries
      const i = entries.findIndex((e) => e.key === key)
      const j = entries.findIndex((e) => e.key === swapWith.key)
      const next = [...entries]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const EditButton = (p: { label: string; title: string; onClick: () => void }) => (
    <button
      type="button"
      title={p.title}
      onClick={p.onClick}
      style={{
        border: "1px solid var(--v2-border-border-base)",
        "border-radius": "4px",
        background: "var(--v2-background-bg-layer-02)",
        color: "var(--v2-text-text-muted)",
        "font-size": "10px",
        padding: "1px 6px",
        cursor: "pointer",
      }}
    >
      {p.label}
    </button>
  )

  const Cell = (p: { entry: DashboardEntry }) => {
    const info = createMemo(() => infoFor(p.entry.id))
    const empty = createMemo(() => empties()[p.entry.key] === true)
    return (
      <Show
        when={info()}
        fallback={
          // unknown id (not-yet-synced user widget): quiet placeholder, kept in state
          <div
            style={{
              border: "1px dashed var(--v2-border-border-base)",
              "border-radius": "10px",
              padding: "10px 12px",
              "font-size": "11px",
              color: "var(--v2-text-text-faint)",
            }}
          >
            {p.entry.id} (missing)
            <Show when={editing()}>
              <span style={{ "margin-left": "8px" }}>
                <EditButton label="×" title="Remove from dashboard" onClick={() => setHidden(p.entry.key, true)} />
              </span>
            </Show>
          </div>
        }
      >
        {(w) => (
          <div
            data-component="amicode-widget-cell"
            data-widget={w().id}
            style={{ display: empty() && !editing() ? "none" : "flex", "flex-direction": "column", gap: "4px", "min-width": "0" }}
          >
            <Show when={editing()}>
              <div style={{ display: "flex", gap: "4px", "align-items": "center" }}>
                <span
                  style={{
                    "font-size": "10px",
                    color: "var(--v2-text-text-faint)",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                    flex: "1",
                  }}
                >
                  {w().name}
                  {empty() ? " (empty right now)" : ""}
                </span>
                <EditButton label="▲" title="Move earlier" onClick={() => move(p.entry.key, -1)} />
                <EditButton label="▼" title="Move later" onClick={() => move(p.entry.key, 1)} />
                <Show when={Object.keys(w().config).length > 0}>
                  <EditButton
                    label="⚙"
                    title="Configure"
                    onClick={() => setConfigOpen(configOpen() === p.entry.key ? undefined : p.entry.key)}
                  />
                </Show>
                <Show when={w().builtin}>
                  <EditButton label="Fork" title="Copy into ~/.amico/widgets as a template" onClick={() => props.onFork(w().id)} />
                </Show>
                <EditButton label="×" title="Hide" onClick={() => setHidden(p.entry.key, true)} />
              </div>
            </Show>
            <Show when={editing() && configOpen() === p.entry.key}>
              <WidgetConfigForm
                fields={formModel(w().config, p.entry.config)}
                onChange={(field, value) => setConfig(p.entry.key, field, value)}
              />
            </Show>
            <Show when={!(empty() && editing())}>
              <WidgetFrame
                widget={w()}
                frameSrc={props.frameSrcs[w().id]}
                config={p.entry.config}
                context={props.context}
                tokens={props.tokens}
                density={props.density}
                callbacks={props.callbacks}
                onEmpty={(e) => setEmpties((prev) => ({ ...prev, [p.entry.key]: e }))}
              />
            </Show>
          </div>
        )}
      </Show>
    )
  }

  return (
    <div data-component="amicode-widget-grid" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
      <div style={{ display: "flex", "justify-content": "flex-end" }}>
        <button
          type="button"
          data-slot="amicode-grid-customize"
          onClick={() => {
            setEditing(!editing())
            setConfigOpen(undefined)
          }}
          style={{
            border: "none",
            background: "transparent",
            color: editing() ? "var(--v2-text-text-accent)" : "var(--v2-text-text-faint)",
            "font-size": "11px",
            cursor: "pointer",
            padding: "0",
          }}
        >
          {editing() ? "done" : "customize"}
        </button>
      </div>

      <Show when={heroes().length > 0}>
        <div style={{ display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          <For each={heroes()}>{(entry) => <Cell entry={entry} />}</For>
        </div>
      </Show>

      <Show when={tiles().length > 0}>
        <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
          <For each={tiles()}>{(entry) => <Cell entry={entry} />}</For>
        </div>
      </Show>

      {/* hidden tray — edit mode only */}
      <Show when={editing() && hidden().length > 0}>
        <div
          style={{
            display: "flex",
            gap: "8px",
            "flex-wrap": "wrap",
            "align-items": "center",
            padding: "8px 10px",
            border: "1px dashed var(--v2-border-border-base)",
            "border-radius": "8px",
          }}
        >
          <span style={{ "font-size": "10px", color: "var(--v2-text-text-faint)" }}>hidden:</span>
          <For each={hidden()}>
            {(entry) => (
              <button
                type="button"
                onClick={() => setHidden(entry.key, false)}
                style={{
                  border: "1px solid var(--v2-border-border-base)",
                  "border-radius": "6px",
                  background: "var(--v2-background-bg-layer-02)",
                  color: "var(--v2-text-text-muted)",
                  "font-size": "11px",
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                + {infoFor(entry.id)?.name ?? entry.id}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
