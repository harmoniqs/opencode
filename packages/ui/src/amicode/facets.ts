// facets.ts — pure, dependency-free rendering helpers for the amicode entity
// visualization language (spec-20260709 §4). No SolidJS, no imports.

/** Array/object-aware compact renderer. Replaces the JSON.stringify branch that
 *  the old short()/shortValue() used, so a components[]/constraints[] value never
 *  becomes a raw blob. Scalars pass through; arrays → "N items" (+ head id/kind if
 *  present); objects → compact "k:v · k:v" (first few keys). Never throws. */
export function compactValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return "none"
    const head = value
      .slice(0, 3)
      .map((v) => (v && typeof v === "object" ? headLabel(v as Record<string, unknown>) : String(v)))
      .filter(Boolean)
      .join(", ")
    return value.length <= 3 ? head : `${value.length} items (${head}…)`
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 3)
      .map(([k, v]) => `${k}:${typeof v === "object" ? "…" : String(v)}`)
    return entries.join(" · ") || "{}"
  }
  return "—"
}

/** Best label for one object in an array: id → kind → between → first string field. */
function headLabel(o: Record<string, unknown>): string {
  for (const k of ["id", "kind", "between", "name"]) {
    const v = o[k]
    if (typeof v === "string" && v) return v
    if (Array.isArray(v) && v.length) return v.map(String).join("↔")
  }
  return "item"
}

export type FieldChange = { field: string; from: unknown; to: unknown }
export type SetDiff<T> = { added: T[]; removed: T[]; changed: { key: string; item: T; changes: FieldChange[] }[] }

/** Set delta by a UNIQUE key (keyFn MUST be unique within the set — for
 *  objectives/constraints use `kind:(label??index)`; kind alone collides). */
export function setDiff<T>(from: T[], to: T[], keyFn: (t: T, i: number) => string): SetDiff<T> {
  const fromMap = new Map(from.map((t, i) => [keyFn(t, i), t]))
  const toMap = new Map(to.map((t, i) => [keyFn(t, i), t]))
  const added = [...toMap].filter(([k]) => !fromMap.has(k)).map(([, t]) => t)
  const removed = [...fromMap].filter(([k]) => !toMap.has(k)).map(([, t]) => t)
  const changed: SetDiff<T>["changed"] = []
  for (const [k, toItem] of toMap) {
    const fromItem = fromMap.get(k)
    if (fromItem === undefined) continue
    const changes = flatFieldChanges(fromItem, toItem)
    if (changes.length) changed.push({ key: k, item: toItem, changes })
  }
  return { added, removed, changed }
}

/** One-level-deep field comparison (dotted keys for nested params). */
function flatFieldChanges(a: unknown, b: unknown, prefix = ""): FieldChange[] {
  const out: FieldChange[] = []
  const ao = (a ?? {}) as Record<string, unknown>
  const bo = (b ?? {}) as Record<string, unknown>
  for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    const av = ao[k],
      bv = bo[k]
    const field = prefix ? `${prefix}.${k}` : k
    if (av && bv && typeof av === "object" && typeof bv === "object" && !Array.isArray(av)) {
      out.push(...flatFieldChanges(av, bv, field))
    } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
      out.push({ field, from: av, to: bv })
    }
  }
  return out
}

export type Badge = { label: string; value: string; tone?: "neutral" | "active" }

const badgeStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined)

/** Mode facets → badges. Defensive over a loose record (serves both System
 *  drive/topology and Formulation trajectory/time/param/robustness/flags).
 *  Skips none-robustness, false flags, and the "fixed" time default. */
export function modeBadges(p: Record<string, unknown>): Badge[] {
  const out: Badge[] = []
  const tt = badgeStr(p.trajectory_type)
  if (tt) out.push({ label: "type", value: tt })
  const pm = badgeStr(p.parameterization)
  if (pm) out.push({ label: "pulse", value: pm.replace(/_/g, "-") })
  const tm = badgeStr(p.time_mode)
  if (tm && tm !== "fixed") out.push({ label: "time", value: tm.replace(/_/g, "-"), tone: "active" })
  const rob =
    p.robustness && typeof p.robustness === "object"
      ? badgeStr((p.robustness as Record<string, unknown>).kind)
      : undefined
  if (rob && rob !== "none") out.push({ label: "robust", value: rob, tone: "active" })
  if (p.free_phase === true) out.push({ label: "free-phase", value: "", tone: "active" })
  if (p.leakage === true) out.push({ label: "leakage", value: "", tone: "active" })
  // System modes share the badge language.
  const drive =
    p.drive && typeof p.drive === "object" ? badgeStr((p.drive as Record<string, unknown>).arch) : undefined
  if (drive) out.push({ label: "drive", value: drive })
  const topo = badgeStr(p.topology)
  if (topo) out.push({ label: "topology", value: topo })
  return out
}
