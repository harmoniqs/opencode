import { Show, createMemo, createSignal, onCleanup } from "solid-js"
import { useModels } from "@/context/models"
import { AmicodeDefaultModel } from "./amicode-default-model"
import { loadSolverMode, saveSolverMode, type SolverMode } from "@opencode-ai/ui/amicode-solver-toggle"

// AMICODE: the chrome strip's DEFAULTS CAPSULE (nav redesign, Kate 2026-07-15).
// One compact control carries both session defaults — model and solver — so the
// bar holds one row at every panel width. The face reads the current pair
// ("Auto · Piccolo"); the popover holds the full model select (the existing
// AmicodeDefaultModel, unchanged: global pin + VS Code-setting mirror) and a
// solver radio pair sharing solver-toggle.tsx's persistence. When the
// high-performance solver is on, the face wears the accent border — the PRO
// funnel stays visible at every width instead of being the first casualty
// of a narrow column.

export function AmicodeDefaultsCapsule() {
  const models = useModels()
  const [open, setOpen] = createSignal(false)
  const [mode, setMode] = createSignal<SolverMode>(loadSolverMode())
  const pick = (m: SolverMode) => {
    setMode(m)
    saveSolverMode(m)
  }

  const modelName = createMemo(() => {
    const pin = models.pin.get()
    if (!pin) return "Auto"
    const m = models.list().find((x) => x.provider.id === pin.providerID && x.id === pin.modelID)
    return m?.name ?? "Auto"
  })
  const hp = () => mode() === "hp"

  let root: HTMLDivElement | undefined
  const onDocPointer = (e: PointerEvent) => {
    if (root && !root.contains(e.target as Node)) setOpen(false)
  }
  const onDocKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false)
  }
  const toggle = () => {
    const next = !open()
    setOpen(next)
    if (next) {
      document.addEventListener("pointerdown", onDocPointer, true)
      document.addEventListener("keydown", onDocKey, true)
    } else {
      teardown()
    }
  }
  const teardown = () => {
    document.removeEventListener("pointerdown", onDocPointer, true)
    document.removeEventListener("keydown", onDocKey, true)
  }
  onCleanup(teardown)

  const radio = (active: boolean): Record<string, string> => ({
    display: "flex",
    "align-items": "center",
    gap: "7px",
    width: "100%",
    padding: "6px 10px",
    "font-size": "12px",
    "font-weight": active ? "650" : "450",
    "text-align": "left",
    border: active ? "1px solid var(--v2-icon-icon-accent)" : "1px solid var(--v2-border-border-base)",
    "border-radius": "7px",
    cursor: "pointer",
    background: active ? "color-mix(in srgb, var(--v2-icon-icon-accent) 12%, transparent)" : "transparent",
    color: active ? "var(--v2-text-text-base)" : "var(--v2-text-text-muted)",
  })

  return (
    <div ref={root} data-component="amicode-defaults-capsule" style={{ position: "relative", "min-width": "0" }}>
      <button
        type="button"
        data-slot="amicode-defaults-face"
        title="Session defaults — model & solver"
        aria-expanded={open()}
        onClick={toggle}
        style={{
          display: "inline-flex",
          "align-items": "center",
          gap: "7px",
          "max-width": "100%",
          "min-width": "0",
          border: hp()
            ? "1px solid color-mix(in srgb, var(--v2-icon-icon-accent) 55%, var(--v2-border-border-base))"
            : "1px solid var(--v2-border-border-base)",
          "border-radius": "7px",
          background: "var(--v2-background-bg-layer-01)",
          color: "var(--v2-text-text-base)",
          padding: "4px 10px",
          "font-size": "12px",
          "font-weight": "600",
          cursor: "pointer",
          transition: "border-color 0.15s ease",
        }}
      >
        <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap", "min-width": "0" }}>
          {modelName()} · {hp() ? "Piccolissimo+Altissimo" : "Piccolo"}
        </span>
        <span aria-hidden="true" style={{ "font-size": "9px", color: "var(--v2-text-text-muted)", "flex-shrink": "0" }}>
          ▾
        </span>
      </button>
      <Show when={open()}>
        <div
          data-slot="amicode-defaults-pop"
          role="dialog"
          aria-label="Session defaults"
          style={{
            position: "absolute",
            right: "0",
            top: "calc(100% + 8px)",
            "z-index": "40",
            width: "min(300px, 86vw)",
            background: "var(--v2-background-bg-base)",
            border: "1px solid var(--v2-border-border-base)",
            "border-radius": "10px",
            "box-shadow": "0 14px 40px -18px rgba(0, 0, 0, 0.55)",
            padding: "14px",
            display: "flex",
            "flex-direction": "column",
            gap: "12px",
          }}
        >
          <AmicodeDefaultModel />
          <div style={{ height: "1px", background: "var(--v2-border-border-base)" }} />
          <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
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
            <button
              type="button"
              data-slot="amicode-solver-piccolo"
              style={radio(!hp())}
              onClick={() => pick("piccolo")}
            >
              Piccolo
            </button>
            <button type="button" data-slot="amicode-solver-hp" style={radio(hp())} onClick={() => pick("hp")}>
              <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                Piccolissimo + Altissimo
              </span>
              {/* amicode pill spec (media/ui/atoms/pill.ts): round, currentColor
                  border, 10% currentColor tint — state lives in the text color. */}
              <span
                style={{
                  "font-size": "9px",
                  "font-weight": "600",
                  "letter-spacing": "0.5px",
                  padding: "4px 7px",
                  "line-height": "1",
                  "border-radius": "999px",
                  border: "1px solid currentColor",
                  background: "color-mix(in srgb, currentColor 10%, transparent)",
                  color: "var(--v2-text-text-accent)",
                  "flex-shrink": "0",
                }}
              >
                PRO
              </span>
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
