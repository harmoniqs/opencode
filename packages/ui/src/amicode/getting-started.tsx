import { For } from "solid-js"

// AMICODE: start-screen getting-started block — tagline, how-it-works row,
// and starter chips that submit their prompt as the first message of a new
// session. Presentation only; the submit wiring (composer draft + submit) is
// app-side and arrives via onStart (same pattern as the entity rail's onAsk).
// Copy is en-only by design, consistent with the default-locale-en patch.

// TODO(repertoire-chips): these become data — one chip per installed+entitled
// score (name/outcome/duration from SCORE.md frontmatter) once the server
// exposes the compiled repertoire; static, feature-diverse set until then.
// The set spans the lifetime: onboard (first run routes any chip into the
// overture) → design with memory/recommendations → warm-start from the pulse
// bank → go fast with Veloce.
export const AMICODE_STARTERS: readonly { label: string; prompt: string }[] = [
  {
    label: "Design a pulse — walk me through it",
    prompt: "walk me through designing a pulse",
  },
  {
    label: "Optimize an X gate on my transmon",
    prompt: "optimize an X gate on my transmon — use what you know from my history",
  },
  // NOTE(spec B): the static "Resume my pulse design" chip was replaced by the
  // conditional resumeName-driven chip below — Resume renders only when a
  // problem workspace actually exists (no empty chrome).
  {
    label: "Warm-start from my pulse bank",
    prompt: "warm-start a new solve from my pulse bank",
  },
  {
    label: "Go fast with Veloce",
    prompt: "turn on Veloce — auto-accept your high-confidence recommendations, and still confirm before any solve",
  },
  {
    label: "What can Amico do?",
    prompt: "what can Amico do?",
  },
]

// The lifetime arc, not just the per-pulse loop: Amico gets to know your setup
// (session zero), designs with recommendations drawn from your history, then
// helps you take it to hardware.
const STEPS = ["① Get set up — your system & lab", "② Design & optimize, with your history", "③ Verify & tune on hardware"]

export function AmicodeGettingStarted(props: {
  onStart: (prompt: string) => void
  // spec B: Resume verb — set only when a problem workspace exists (no empty chrome)
  resumeName?: string
  onResume?: () => void
}) {
  return (
    <div
      data-component="amicode-getting-started"
      style={{
        "display": "flex",
        "flex-direction": "column",
        "align-items": "center",
        "gap": "12px",
        "min-width": "0",
        "max-width": "100%",
      }}
    >
      <div
        data-slot="amicode-gs-tagline"
        style={{ "font-size": "13px", "line-height": "18px", "color": "var(--v2-text-text-base)" }}
      >
        <span style={{ "color": "var(--v2-text-text-accent)", "font-weight": "600" }}>Amico</span> — a pulse-design copilot who remembers your work and gets faster the more you build together.{" "}
        <span style={{ "font-style": "italic" }}>Andiamo.</span>
      </div>
      <div
        data-slot="amicode-gs-steps"
        style={{
          "display": "flex",
          "flex-wrap": "wrap",
          "justify-content": "center",
          "column-gap": "16px",
          "row-gap": "4px",
          "font-size": "12px",
          "line-height": "16px",
          "color": "var(--v2-text-text-faint)",
        }}
      >
        <For each={STEPS}>{(step) => <span style={{ "white-space": "nowrap" }}>{step}</span>}</For>
      </div>
      <div
        data-slot="amicode-gs-starters"
        style={{
          "display": "flex",
          "flex-wrap": "wrap",
          "justify-content": "center",
          "gap": "6px",
        }}
      >
        <For each={AMICODE_STARTERS}>
          {(starter) => (
            <button
              type="button"
              data-slot="amicode-gs-starter"
              onClick={() => props.onStart(starter.prompt)}
              style={{
                "border": "1px solid var(--v2-icon-icon-accent)",
                "border-radius": "6px",
                "background": "var(--v2-background-bg-layer-02)",
                "color": "var(--v2-text-text-base)",
                "padding": "4px 12px",
                "font-size": "12px",
                "line-height": "16px",
                "cursor": "pointer",
              }}
            >
              {starter.label}
            </button>
          )}
        </For>
        {props.resumeName && props.onResume && (
          <button
            type="button"
            data-slot="amicode-gs-resume"
            onClick={() => props.onResume?.()}
            style={{
              "border": "1px solid var(--v2-icon-icon-accent)",
              "border-radius": "6px",
              "background": "var(--v2-background-bg-layer-02)",
              "color": "var(--v2-text-text-base)",
              "padding": "4px 12px",
              "font-size": "12px",
              "line-height": "16px",
              "cursor": "pointer",
            }}
          >
            Resume “{props.resumeName}”
          </button>
        )}
      </div>
    </div>
  )
}
