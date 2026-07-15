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
// Each starter carries a stroke-icon path (24-grid, one family: 1.75px round
// strokes) suggesting its action — rendered on a small lemon tile so the chip
// reads branded without the whole component going yellow (Kate).
export const AMICODE_STARTERS: readonly { label: string; prompt: string; icon: string }[] = [
  {
    label: "Design a pulse — walk me through it",
    prompt: "walk me through designing a pulse",
    icon: "M2 12h4l3-7 4 14 3-7h6", // a pulse trace
  },
  {
    label: "Optimize an X gate on my transmon",
    prompt: "optimize an X gate on my transmon — use what you know from my history",
    icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3", // a target
  },
  // NOTE(spec B): the static "Resume my pulse design" chip was replaced by the
  // conditional resumeName-driven chip below — Resume renders only when a
  // problem workspace actually exists (no empty chrome).
  {
    label: "Warm-start from my pulse bank",
    prompt: "warm-start a new solve from my pulse bank",
    icon: "M20 12a8 8 0 1 1-2.3-5.7M20 3v4h-4", // restart arc
  },
  {
    label: "Go fast with Veloce",
    prompt: "turn on Veloce — auto-accept your high-confidence recommendations, and still confirm before any solve",
    icon: "M13 3 5 14h5l-1 7 8-11h-5l1-7Z", // a bolt
  },
  {
    label: "What can Amico do?",
    prompt: "what can Amico do?",
    icon: "M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.9.4-1.2.9-1.2 1.9M12 17.2v.1", // a question
  },
]

// Resume is play-shaped.
const RESUME_ICON = "M8 5.5v13l10.5-6.5Z"

// The one place the chip carries the brand: a small lemon tile (fill + 1px
// icon-accent edge — dark hairline on light, invisible on dark) holding the
// action glyph in ink. SVG only, never emoji; 12px glyph on a 20px tile.
const GLYPH_TILE: Record<string, string> = {
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  width: "20px",
  height: "20px",
  "box-sizing": "border-box",
  "flex-shrink": "0",
  "border-radius": "5px",
  background: "var(--v2-background-bg-accent, #FFF676)",
  border: "1px solid var(--v2-icon-icon-accent)",
  color: "#000",
}

function StarterGlyph(props: { d: string }) {
  return (
    <span style={GLYPH_TILE} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d={props.d} />
      </svg>
    </span>
  )
}

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
          display: "grid",
          "grid-template-columns": "repeat(2, minmax(0, 1fr))",
          gap: "6px 8px",
          width: "100%",
          "max-width": "540px",
        }}
      >
        <For each={AMICODE_STARTERS}>
          {(starter) => (
            <button
              type="button"
              data-slot="amicode-gs-starter"
              onClick={() => props.onStart(starter.prompt)}
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "7px",
                "min-width": "0",
                border: "1px solid var(--v2-border-border-strong)",
                "border-radius": "6px",
                background: "var(--v2-background-bg-layer-02)",
                color: "var(--v2-text-text-base)",
                padding: "4px 12px 4px 5px",
                "font-size": "12px",
                "line-height": "16px",
                cursor: "pointer",
              }}
            >
              <StarterGlyph d={starter.icon} />
              <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                {starter.label}
              </span>
            </button>
          )}
        </For>
        {props.resumeName && props.onResume && (
          <button
            type="button"
            data-slot="amicode-gs-resume"
            onClick={() => props.onResume?.()}
            style={{
              display: "inline-flex",
              "align-items": "center",
              gap: "7px",
              "min-width": "0",
              border: "1px solid var(--v2-border-border-strong)",
              "border-radius": "6px",
              background: "var(--v2-background-bg-layer-02)",
              color: "var(--v2-text-text-base)",
              padding: "4px 12px 4px 5px",
              "font-size": "12px",
              "line-height": "16px",
              cursor: "pointer",
            }}
          >
            <StarterGlyph d={RESUME_ICON} />
            <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
              Resume “{props.resumeName}”
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
