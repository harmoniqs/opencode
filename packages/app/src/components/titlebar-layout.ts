export const TITLEBAR_CONTROL_IDS = ["sessions", "status", "side-panel", "profile", "settings"] as const

export type TitlebarControlId = (typeof TITLEBAR_CONTROL_IDS)[number]

export interface TitlebarLayout {
  left: TitlebarControlId[]
  right: TitlebarControlId[]
}

export const defaultTitlebarLayout: TitlebarLayout = {
  left: [],
  right: ["sessions", "status", "side-panel", "profile", "settings"],
}

export function validateTitlebarLayout(value: unknown): TitlebarLayout {
  if (!value || typeof value !== "object") return defaultTitlebarLayout
  const candidate = value as Record<string, unknown>
  if (!Array.isArray(candidate.left) || !Array.isArray(candidate.right)) return defaultTitlebarLayout
  const all = [...candidate.left, ...candidate.right]
  if (all.length !== TITLEBAR_CONTROL_IDS.length) return defaultTitlebarLayout
  const set = new Set(all)
  if (set.size !== TITLEBAR_CONTROL_IDS.length) return defaultTitlebarLayout
  for (const id of TITLEBAR_CONTROL_IDS) {
    if (!set.has(id)) return defaultTitlebarLayout
  }
  return { left: candidate.left as TitlebarControlId[], right: candidate.right as TitlebarControlId[] }
}

const SESSION_SCOPED: ReadonlySet<TitlebarControlId> = new Set(["sessions", "status", "side-panel"])

export function mountPointId(id: TitlebarControlId): string {
  return `opencode-titlebar-${id}`
}

export function isSessionScoped(id: TitlebarControlId): boolean {
  return SESSION_SCOPED.has(id)
}

/** Live mount-point lookup — always queries the current DOM, never caches a
 *  stale reference. Session-scoped controls render as portal targets; the
 *  tracker returns the live element (or null if the div is absent). */
export function createMountPointTracker() {
  return {
    element(id: TitlebarControlId): HTMLElement | null {
      if (!SESSION_SCOPED.has(id)) return null
      return document.getElementById(mountPointId(id))
    },
  }
}

export function createEditModeState() {
  let _active = false
  return {
    active: () => _active,
    enter: () => {
      _active = true
    },
    exit: () => {
      _active = false
    },
    reset: (write: (layout: TitlebarLayout) => void) => {
      write(defaultTitlebarLayout)
      _active = false
    },
  }
}

export function reorderWithinSlot(
  layout: TitlebarLayout,
  slot: "left" | "right",
  fromIndex: number,
  toIndex: number,
): TitlebarLayout {
  if (fromIndex === toIndex) return layout
  const items = [...layout[slot]]
  const [moved] = items.splice(fromIndex, 1)
  items.splice(toIndex, 0, moved!)
  return { ...layout, [slot]: items }
}

export function moveToSlot(
  layout: TitlebarLayout,
  controlId: TitlebarControlId,
  toSlot: "left" | "right",
  toIndex: number,
): TitlebarLayout {
  const fromSlot = layout.left.includes(controlId) ? "left" : "right"
  if (fromSlot === toSlot) return layout
  const fromItems = layout[fromSlot].filter((id) => id !== controlId)
  const toItems = [...layout[toSlot]]
  toItems.splice(toIndex, 0, controlId)
  return { left: fromSlot === "left" ? fromItems : toItems, right: fromSlot === "right" ? fromItems : toItems }
}

/** Label for the per-control context menu action that moves a control
 *  to the opposite slot.  `currentSlot` is the slot the control is in now. */
export function controlSlotLabel(currentSlot: "left" | "right"): string {
  return currentSlot === "right" ? "Move to left of tabs" : "Move to right of tabs"
}

/** Reconcile a drop onto an empty-slot drop zone (a plain `useDroppable`,
 *  not a sortable).
 *
 *  The `OptimisticSortingPlugin` requires both groups to have at least one
 *  `useSortable` item, so when a slot is empty its drop zone is a plain
 *  `Droppable` whose `id` equals the slot name.  The plugin ignores it
 *  (the item snaps back).  This function handles the commit: look up the
 *  control from `sourceGroup[sourceIndex]` and move it to `targetSlot` at
 *  index 0.  Returns the original layout ref on no-op. */
export function reconcileDropOnEmptySlot(
  layout: TitlebarLayout,
  sourceGroup: string | undefined,
  sourceIndex: number,
  targetSlot: "left" | "right",
): TitlebarLayout {
  const from = (sourceGroup ?? "right") as "left" | "right"
  if (from === targetSlot) return layout
  const controlId = layout[from][sourceIndex]
  if (!controlId) return layout
  return moveToSlot(layout, controlId, targetSlot, 0)
}

/** Reconcile a drag-end event into a layout update.
 *
 *  @dnd-kit's `OptimisticSortingPlugin` mutates `source.group` and
 *  `source.index` during drag, so by `dragend` they reflect the destination.
 *  This function maps that information to the right layout operation:
 *
 *  - Same group, different index → `reorderWithinSlot`
 *  - Different group → `moveToSlot`
 *  - Same group, same index → no-op (returns the original layout ref)
 *
 *  `initialGroup` / `group` may be `undefined` — treat as `"right"` (the
 *  default slot). */
export function reconcileDragEnd(
  layout: TitlebarLayout,
  initialGroup: string | undefined,
  initialIndex: number,
  group: string | undefined,
  index: number,
): TitlebarLayout {
  const from = (initialGroup ?? "right") as "left" | "right"
  const to = (group ?? "right") as "left" | "right"
  if (from === to) return reorderWithinSlot(layout, from, initialIndex, index)
  const controlId = layout[from][initialIndex]
  if (!controlId) return layout
  return moveToSlot(layout, controlId, to, index)
}
