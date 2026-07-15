import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { WidgetFrame, type WidgetHostCallbacks } from "./widget-frame"
import { WidgetConfigForm } from "./widget-config-form"
import { formModel, type DashboardEntry, type DashboardState, type WidgetInfo } from "./widget-schema"
import type { Density } from "./widget-tokens"

// AMICODE (widget kernel): the dashboard — replaces the hardcoded
// AmicodeHomeCards strip. Renders the state's visible entries as sandboxed
// WidgetFrames: hero widgets in the top auto-fit grid, tiles in the auto-fit
// row below. "Customize" (in the chrome strip) flips edit mode. In edit mode
// the cards STAY VISIBLE — a light scrim + dashed ring signal "you're
// arranging, not using" — and each card gets ONE compact control pill in its
// top-right corner: ↑↓ reorder within its row, ⚙ config, fork (built-ins),
// × hide. A banner up top orients; a tray at the bottom re-adds hidden
// widgets. Every change calls props.onSave immediately (the app POSTs and
// feeds merged state back down). Reorder is button-based, not drag (declared
// spec deviation), so the corner pill can safely overlay the iframe: clicks
// land host-side above the frame; only a click-DRAG through a frame is eaten.

type Bucket = "hero" | "tile"

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
  /** controlled edit mode (spec T3.1: `customize` lives in the chrome strip);
   *  omit both to keep the grid's internal toggle */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
}) {
  const [internalEditing, setInternalEditing] = createSignal(false)
  const controlled = () => props.editing !== undefined
  const editing = () => (controlled() ? props.editing === true : internalEditing())
  const setEditing = (v: boolean) => {
    if (controlled()) props.onEditingChange?.(v)
    else setInternalEditing(v)
  }
  const [configOpen, setConfigOpen] = createSignal<string | undefined>(undefined)
  const [empties, setEmpties] = createSignal<Record<string, boolean>>({})
  // per-card ⋯ menu (customize rethink, Kate 2026-07-15): at most one open,
  // keyed by entry. Editing is initiated FROM a card, not a standing button.
  const [menuOpen, setMenuOpen] = createSignal<string | undefined>(undefined)

  const infoFor = (id: string) => props.widgets.find((w) => w.id === id)
  const bucketOf = (id: string): Bucket => (infoFor(id)?.size === "hero" ? "hero" : "tile")
  const visible = createMemo(() => props.dashboard.widget.filter((e) => !e.hidden))
  const hidden = createMemo(() => props.dashboard.widget.filter((e) => e.hidden))
  const heroes = createMemo(() => visible().filter((e) => bucketOf(e.id) === "hero"))
  const tiles = createMemo(() => visible().filter((e) => bucketOf(e.id) === "tile"))

  const save = (mutate: (entries: DashboardEntry[]) => DashboardEntry[]) => {
    // spread first: reserved top-level keys (views, scope — spec T3.6) survive
    props.onSave({ ...props.dashboard, version: 1, widget: mutate(props.dashboard.widget.map((e) => ({ ...e }))) })
  }
  const setHidden = (key: string, value: boolean) =>
    save((entries) => entries.map((e) => (e.key === key ? { ...e, hidden: value } : e)))
  const setConfig = (key: string, field: string, value: unknown) =>
    save((entries) => entries.map((e) => (e.key === key ? { ...e, config: { ...e.config, [field]: value } } : e)))
  const move = (key: string, dir: -1 | 1) =>
    save((entries) => {
      const target = entries.find((x) => x.key === key)
      if (!target) return entries
      const group = entries.filter((e) => !e.hidden && bucketOf(e.id) === bucketOf(target.id))
      const gi = group.findIndex((e) => e.key === key)
      const swapWith = group[gi + dir]
      if (gi < 0 || !swapWith) return entries
      const i = entries.findIndex((e) => e.key === key)
      const j = entries.findIndex((e) => e.key === swapWith.key)
      const next = [...entries]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  // position within the visible row (used to disable ↑ on first / ↓ on last)
  const posInRow = (key: string, id: string) => {
    const group = visible().filter((e) => bucketOf(e.id) === bucketOf(id))
    return { idx: group.findIndex((e) => e.key === key), len: group.length }
  }

  const PillButton = (p: { label: string; title: string; onClick: () => void; disabled?: boolean; class?: string }) => (
    <button type="button" title={p.title} disabled={p.disabled} class={p.class} onClick={p.onClick}>
      {p.label}
    </button>
  )

  // the floating corner control cluster — one grouped pill, not five loose boxes
  const ControlPill = (p: { entry: DashboardEntry; w: WidgetInfo }) => {
    const pos = createMemo(() => posInRow(p.entry.key, p.w.id))
    const hasConfig = createMemo(() => Object.keys(p.w.config).length > 0)
    return (
      <div class="amc-wg-pill">
        <PillButton label="↑" title="Move earlier" disabled={pos().idx <= 0} onClick={() => move(p.entry.key, -1)} />
        <PillButton
          label="↓"
          title="Move later"
          disabled={pos().idx < 0 || pos().idx >= pos().len - 1}
          onClick={() => move(p.entry.key, 1)}
        />
        <Show when={hasConfig() || p.w.builtin}>
          <span class="amc-wg-sep" />
        </Show>
        <Show when={hasConfig()}>
          <PillButton
            label="⚙"
            title="Configure"
            onClick={() => setConfigOpen(configOpen() === p.entry.key ? undefined : p.entry.key)}
          />
        </Show>
        <Show when={p.w.builtin}>
          <PillButton
            label="fork"
            class="amc-wg-fork"
            title="Duplicate into ~/.amico/widgets as your own editable copy"
            onClick={() => props.onFork(p.w.id)}
          />
        </Show>
        <span class="amc-wg-sep" />
        <PillButton
          label="×"
          class="amc-wg-danger"
          title="Remove from dashboard"
          onClick={() => setHidden(p.entry.key, true)}
        />
      </div>
    )
  }

  // The card's own ⋯ menu — direct actions on the card in hand, plus the two
  // grid-level entries (add / arrange) that open the full edit mode. Reuses the
  // exact operations the edit-mode ControlPill calls.
  const CardMenu = (p: { entry: DashboardEntry; w: WidgetInfo }) => {
    let root: HTMLDivElement | undefined
    const open = () => menuOpen() === p.entry.key
    const pos = createMemo(() => posInRow(p.entry.key, p.w.id))
    const hasConfig = createMemo(() => Object.keys(p.w.config).length > 0)
    const onDocPointer = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) setMenuOpen(undefined)
    }
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(undefined)
    }
    createEffect(() => {
      if (!open()) return
      document.addEventListener("pointerdown", onDocPointer, true)
      document.addEventListener("keydown", onDocKey, true)
      onCleanup(() => {
        document.removeEventListener("pointerdown", onDocPointer, true)
        document.removeEventListener("keydown", onDocKey, true)
      })
    })
    const close = () => setMenuOpen(undefined)
    return (
      <div ref={root} class="amc-wg-menuroot">
        <button
          type="button"
          class="amc-wg-more"
          title={`${p.w.name} — options`}
          aria-haspopup="menu"
          aria-expanded={open()}
          onClick={() => setMenuOpen(open() ? undefined : p.entry.key)}
        >
          ⋯
        </button>
        <Show when={open()}>
          <div class="amc-wg-menu" role="menu" aria-label={`${p.w.name} options`}>
            <button type="button" role="menuitem" disabled={pos().idx <= 0} onClick={() => move(p.entry.key, -1)}>
              ↑ Move up
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={pos().idx < 0 || pos().idx >= pos().len - 1}
              onClick={() => move(p.entry.key, 1)}
            >
              ↓ Move down
            </button>
            <Show when={hasConfig()}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setEditing(true)
                  setConfigOpen(p.entry.key)
                  close()
                }}
              >
                ⚙ Configure
              </button>
            </Show>
            <button
              type="button"
              role="menuitem"
              class="amc-wg-danger"
              title="Hides the widget — bring it back via Add widget"
              onClick={() => {
                setHidden(p.entry.key, true)
                close()
              }}
            >
              × Remove
            </button>
            <div class="amc-wg-menusep" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditing(true)
                close()
              }}
            >
              ✎ Arrange dashboard…
            </button>
          </div>
        </Show>
      </div>
    )
  }

  const Cell = (p: { entry: DashboardEntry }) => {
    const info = createMemo(() => infoFor(p.entry.id))
    const empty = createMemo(() => empties()[p.entry.key] === true)
    // a cell shows a labeled placeholder (rather than the frame) when it has
    // nothing to render but must stay reachable in edit mode
    const asPlaceholder = createMemo(() => editing() && (!info() || empty()))

    // when NOT editing, a cell with nothing to render (missing widget or an
    // empty-state) collapses out of the grid entirely — otherwise it would
    // hold an empty column track. The frame (when present) stays MOUNTED under
    // display:none so its amc:empty signal keeps flowing and the cell can
    // re-appear if the widget later has content (hidden frames have no layout,
    // so emptiness is never inferred from height — it's an explicit signal).
    const collapsed = createMemo(() => !editing() && (!info() || empty()))

    return (
      <div
        data-component="amicode-widget-cell"
        data-widget={p.entry.id}
        data-editing={editing() ? "true" : "false"}
        style={{ display: collapsed() ? "none" : undefined }}
      >
        <Show
          when={info()}
          fallback={
            // unknown id (not-yet-synced user widget): reachable only in edit mode
            <Show when={editing()}>
              <div class="amc-wg-placeholder">
                <span style={{ flex: "1" }}>{p.entry.id} — not installed</span>
                <div class="amc-wg-pill" style={{ position: "static", "box-shadow": "none" }}>
                  <PillButton
                    label="×"
                    class="amc-wg-danger"
                    title="Remove from dashboard"
                    onClick={() => setHidden(p.entry.key, true)}
                  />
                </div>
              </div>
            </Show>
          }
        >
          {(w) => (
            <>
              <Show when={asPlaceholder()}>
                <div class="amc-wg-framewrap">
                  <div class="amc-wg-placeholder">
                    <span style={{ flex: "1" }}>
                      {w().name} <span class="amc-wg-empty">· nothing to show right now</span>
                    </span>
                  </div>
                  <ControlPill entry={p.entry} w={w()} />
                </div>
              </Show>

              <Show when={!asPlaceholder()}>
                <div class="amc-wg-framewrap">
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
                  <Show when={editing()}>
                    <div class="amc-wg-scrim" />
                    <div class="amc-wg-name">{w().name}</div>
                    <ControlPill entry={p.entry} w={w()} />
                  </Show>
                  <Show when={!editing()}>
                    <CardMenu entry={p.entry} w={w()} />
                  </Show>
                </div>
              </Show>

              <Show when={editing() && configOpen() === p.entry.key}>
                <div style={{ "margin-top": "6px" }}>
                  <WidgetConfigForm
                    fields={formModel(w().config, p.entry.config)}
                    onChange={(field, value) => setConfig(p.entry.key, field, value)}
                  />
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>
    )
  }

  return (
    <div data-component="amicode-widget-grid" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
      {/* No standing customize button (rethink, Kate 2026-07-15): editing is
          initiated from any card's ⋯ menu; the edit bar's Done closes it. */}

      <Show when={editing()}>
        <div data-component="amicode-widget-editbar">
          <span>
            <b>Customizing your dashboard</b> — use each card's corner controls to reorder <b>↑↓</b>, configure{" "}
            <b>⚙</b>, or remove <b>×</b>. Changes save as you go.
          </span>
          <button
            type="button"
            class="amc-wg-editdone"
            onClick={() => {
              setEditing(false)
              setConfigOpen(undefined)
            }}
          >
            Done
          </button>
        </div>
      </Show>

      <Show when={heroes().length > 0}>
        {/* panel-first (spec T3.4): 2-up when the canvas allows, stacked below */}
        <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
          <For each={heroes()}>{(entry) => <Cell entry={entry} />}</For>
        </div>
      </Show>

      <Show when={tiles().length > 0}>
        <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
          <For each={tiles()}>{(entry) => <Cell entry={entry} />}</For>
        </div>
      </Show>

      {/* add-back tray — edit mode only, only when something is hidden */}
      <Show when={editing() && hidden().length > 0}>
        <div
          data-component="amicode-widget-tray"
          style={{
            padding: "8px 10px",
            border: "1px dashed var(--v2-border-border-base)",
            "border-radius": "8px",
          }}
        >
          <span class="amc-wg-traylabel">add a widget</span>
          <For each={hidden()}>
            {(entry) => (
              <button type="button" class="amc-wg-add" onClick={() => setHidden(entry.key, false)}>
                + {infoFor(entry.id)?.name ?? entry.id}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
