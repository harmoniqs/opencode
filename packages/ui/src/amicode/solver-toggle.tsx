import { createSignal } from "solid-js"

// AMICODE: solver mode toggle — SHOW-ONLY v1 (spec-20260709-093000). Presents
// the future High-Performance path (Piccolissimo splines + Altissimo GPU
// solver on Harmoniqs cloud) as a selectable mode so demos can tell the story
// today. It deliberately changes NOTHING about solves: the future wiring is
// the scores schema's `executor: "cloud-altissimo" | local` seam, and the
// existing `issimo` entitlement tier becomes the subscription gate.

export type SolverMode = "piccolo" | "hp"
const KEY = "amicode-solver-mode"

export function loadSolverMode(storage: Pick<Storage, "getItem"> = localStorage): SolverMode {
  try {
    return storage.getItem(KEY) === "hp" ? "hp" : "piccolo"
  } catch {
    return "piccolo"
  }
}

export function saveSolverMode(mode: SolverMode, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(KEY, mode)
  } catch {
    /* storage unavailable — selection just won't persist */
  }
}

export function AmicodeSolverToggle() {
  const [mode, setMode] = createSignal<SolverMode>(loadSolverMode())
  const pick = (m: SolverMode) => {
    setMode(m)
    saveSolverMode(m)
  }
  const seg = (active: boolean): Record<string, string> => ({
    display: "inline-flex",
    "align-items": "center",
    gap: "6px",
    padding: "5px 12px",
    "font-size": "12px",
    "font-weight": active ? "650" : "450",
    border: "none",
    cursor: "pointer",
    background: active ? "color-mix(in srgb, var(--v2-icon-icon-accent) 14%, transparent)" : "transparent",
    color: active ? "var(--v2-text-text-base)" : "var(--v2-text-text-muted)",
  })
  return (
    <div
      data-component="amicode-solver-toggle"
      title="Preview — GPU cloud solver rolling out"
      style={{ display: "flex", "align-items": "center", gap: "10px" }}
    >
      <span
        style={{
          "font-size": "10px",
          "font-weight": "700",
          "letter-spacing": "0.08em",
          "text-transform": "uppercase",
          color: "var(--v2-text-text-faint)",
        }}
      >
        Solver
      </span>
      <div
        style={{
          display: "inline-flex",
          border: mode() === "hp" ? "1px solid var(--v2-icon-icon-accent)" : "1px solid var(--v2-border-border-base)",
          "border-radius": "8px",
          overflow: "hidden",
          transition: "border-color 0.15s ease",
        }}
      >
        <button
          type="button"
          data-slot="amicode-solver-piccolo"
          style={seg(mode() === "piccolo")}
          onClick={() => pick("piccolo")}
        >
          Piccolo
        </button>
        <button type="button" data-slot="amicode-solver-hp" style={seg(mode() === "hp")} onClick={() => pick("hp")}>
          <span aria-hidden="true">⚡</span>
          Piccolissimo + Altissimo
          <span
            style={{
              "font-size": "9px",
              "font-weight": "750",
              "letter-spacing": "0.06em",
              padding: "1px 5px",
              "border-radius": "4px",
              background: "var(--v2-icon-icon-accent)",
              color: "var(--v2-background-bg-base, #000)",
            }}
          >
            PRO
          </span>
        </button>
      </div>
      <span style={{ "font-size": "11px", color: "var(--v2-text-text-faint)" }}>High Performance Solver</span>
    </div>
  )
}
