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
