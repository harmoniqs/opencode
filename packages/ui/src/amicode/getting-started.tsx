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
// NOTE (Kate, chat-redesign): keep the FULL feature-diverse set — these are
// designed to become suggestion data (per profile/activity/entitled score, see
// the repertoire-chips TODO above); don't condense the static stand-in.
// Labels are the full recommendation text — NOT hand-shortened. These become
// server-generated suggestions (see the repertoire-chips TODO): the label will
// BE the recommendation, so we honor it verbatim and let the row wrap.
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

/** amicode chat-redesign (Kate): chips-only row for the composer-as-hero start
 *  screen — no tagline, no byline, no steps. Quiet GLASS pills over the Brain
 *  (latent-constellation slice): the slice-#60 glass recipe via its vars —
 *  translucent tier tint + hairline edge + the shared blur/brightness filter —
 *  so the constellation stays alive behind them instead of being tiled away
 *  by an opaque layer fill; muted ink that lifts on hover. */
export function AmicodeStarterChips(props: {
  onStart: (prompt: string) => void
  resumeName?: string
  onResume?: () => void
}) {
  // The chips' OWN wrapping row (Kate: separate container from the folder
  // picker) — centered, quiet pills. Class-based styling so hover works.
  const pill =
    "rounded-full border border-[var(--glass-edge)] bg-[var(--glass-standard-bg)] shadow-[var(--glass-shadow)] [backdrop-filter:blur(var(--glass-blur))_brightness(var(--glass-brightness,1))] [-webkit-backdrop-filter:blur(var(--glass-blur))_brightness(var(--glass-brightness,1))] px-3 py-1 text-[12px] leading-4 whitespace-nowrap text-[var(--v2-text-text-muted)] cursor-pointer transition-colors duration-120 hover:text-[var(--v2-text-text-base)] hover:border-[var(--v2-border-border-strong)]"
  return (
    <div
      data-component="amicode-starter-chips"
      class="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2"
    >
      <For each={AMICODE_STARTERS}>
        {(starter) => (
          <button
            type="button"
            data-slot="amicode-gs-starter"
            class={pill}
            onClick={() => props.onStart(starter.prompt)}
          >
            {starter.label}
          </button>
        )}
      </For>
      <Show when={props.resumeName && props.onResume}>
        <button type="button" data-slot="amicode-gs-resume" class={pill} onClick={() => props.onResume?.()}>
          Resume {props.resumeName}
        </button>
      </Show>
    </div>
  )
}

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
      // glass sweep (#56): the classic in-chat landing floats as ONE standard
      // glass card — its bare tagline/byline/steps text otherwise sits directly
      // on the live Brain (fails AA over peak bloom).
      data-glass="standard"
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "12px",
        "min-width": "0",
        "max-width": "100%",
        padding: "20px 24px",
      }}
    >
      {/* amicode latent-constellation: bare text floats over the moving Brain
          now — each muted line rides a dense-var backed zone (the question-
          hint pattern: slice #60's token, never a new tint literal) */}
      <div
        data-slot="amicode-gs-tagline"
        style={{
          "font-size": "14px",
          "line-height": "20px",
          color: "var(--v2-text-text-base)",
          background: "var(--glass-dense-bg)",
          "border-radius": "var(--radius-sm)",
          padding: "2px 8px",
          "-webkit-backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
          "backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
        }}
      >
        <AmicodeTagline />
      </div>
      <div
        data-slot="amicode-gs-byline"
        style={{
          "font-size": "11px",
          "line-height": "14px",
          color: "var(--v2-text-text-faint)",
          "margin-top": "-8px",
          background: "var(--glass-dense-bg)",
          "border-radius": "var(--radius-sm)",
          padding: "2px 8px",
          "-webkit-backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
          "backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
        }}
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
            background: "var(--glass-dense-bg)",
            "border-radius": "var(--radius-sm)",
            padding: "2px 8px",
            "-webkit-backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
            "backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
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
              // glass sweep (#56): dense-zone chip fill + accent-edge (neutral on
              // light, yellow on dark) — never an opaque layer or a yellow
              // foreground on light (design-system accent law).
              style={{
                // latent-constellation: glass, not an opaque layer fill
                border: "1px solid var(--glass-edge)",
                "border-radius": "var(--radius-md)",
                background: "var(--glass-standard-bg)",
                "box-shadow": "var(--glass-shadow)",
                "-webkit-backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
                "backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
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
              // latent-constellation: glass, not an opaque layer fill
              border: "1px solid var(--glass-edge)",
              "border-radius": "var(--radius-md)",
              background: "var(--glass-standard-bg)",
              "box-shadow": "var(--glass-shadow)",
              "-webkit-backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
              "backdrop-filter": "blur(var(--glass-blur)) brightness(var(--glass-brightness, 1))",
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
