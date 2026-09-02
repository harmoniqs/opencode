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
