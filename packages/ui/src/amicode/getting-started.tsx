import { For, Show } from "solid-js"
import { AmicodeTagline } from "./tagline"

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

// The three-beat arc of a pulse-design session, from setup to hardware.
const STEPS = ["① Define your system and problem", "② Optimize and iterate", "③ Execute and tune on hardware"]

export function AmicodeGettingStarted(props: {
  onStart: (prompt: string) => void
  // spec B: Resume verb — set only when a problem workspace exists (no empty chrome)
  resumeName?: string
  onResume?: () => void
  // amicode: the compact new-session layout hides the how-it-works steps (tagline
  // + chips only). Defaults on so the classic NewSessionView is unchanged.
  showSteps?: boolean
}) {
  return (
    <div
      data-component="amicode-getting-started"
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "12px",
        "min-width": "0",
        "max-width": "100%",
      }}
    >
      <div
        data-slot="amicode-gs-tagline"
        style={{ "font-size": "14px", "line-height": "20px", color: "var(--v2-text-text-base)" }}
      >
        <AmicodeTagline />
      </div>
      <div
        data-slot="amicode-gs-byline"
        style={{ "font-size": "11px", "line-height": "14px", color: "var(--v2-text-text-faint)", "margin-top": "-8px" }}
      >
        By Harmoniqs
      </div>
      <Show when={props.showSteps ?? true}>
        <div
          data-slot="amicode-gs-steps"
          style={{
            display: "flex",
            "flex-wrap": "wrap",
            "justify-content": "center",
            "column-gap": "16px",
            "row-gap": "4px",
            "font-size": "12px",
            "line-height": "16px",
            color: "var(--v2-text-text-faint)",
          }}
        >
          <For each={STEPS}>{(step) => <span style={{ "white-space": "nowrap" }}>{step}</span>}</For>
        </div>
      </Show>
      <div
        data-slot="amicode-gs-starters"
        style={{
          display: "flex",
          "flex-wrap": "wrap",
          "justify-content": "center",
          gap: "6px",
        }}
      >
        <For each={AMICODE_STARTERS}>
          {(starter) => (
            <button
              type="button"
              data-slot="amicode-gs-starter"
              onClick={() => props.onStart(starter.prompt)}
              style={{
                border: "1px solid var(--v2-icon-icon-accent)",
                "border-radius": "6px",
                background: "var(--v2-background-bg-layer-02)",
                color: "var(--v2-text-text-base)",
                padding: "4px 12px",
                "font-size": "12px",
                "line-height": "16px",
                cursor: "pointer",
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
              border: "1px solid var(--v2-icon-icon-accent)",
              "border-radius": "6px",
              background: "var(--v2-background-bg-layer-02)",
              color: "var(--v2-text-text-base)",
              padding: "4px 12px",
              "font-size": "12px",
              "line-height": "16px",
              cursor: "pointer",
            }}
          >
            Resume “{props.resumeName}”
          </button>
        )}
      </div>
    </div>
  )
}
