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
