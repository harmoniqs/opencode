import { type ComponentProps } from "solid-js"

// AMICODE: working/thinking spinner — the Harmoniqs H-robot silhouette as a
// small monochrome glyph (H body with the screen slit knocked out via
// fill-rule=evenodd; no eye digits / mouth — illegible at 14-18px).
// Colors via currentColor so mount sites' style={{color: ...}} passes through
// exactly like the stock Spinner. Animation: gentle opacity pulse reusing the
// EXISTING `pulse-opacity` keyframes (styles/animations.css) — chosen over
// rotation because the H is non-radial and tumbles/blurs at 16px, and pulse
// matches the stock spinner's own animation language. prefers-reduced-motion:
// static glyph, no animation (matchMedia guard; inline animations don't
// inherit the CSS-file media-query pattern used elsewhere).

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export function AmicoSpinner(props: {
  class?: string
  classList?: ComponentProps<"div">["classList"]
  style?: ComponentProps<"div">["style"]
}) {
  return (
    <svg
      {...props}
      viewBox="0 0 64 56"
      data-component="amico-spinner"
      classList={{
        ...props.classList,
        [props.class ?? ""]: !!props.class,
      }}
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M2 2h16v14h28V2h16v52H46V40H18v14H2Z M9 19h46v18H9Z"
        style={
          reducedMotion()
            ? undefined
            : { animation: "pulse-opacity 1.2s ease-in-out infinite", "animation-fill-mode": "both" }
        }
      />
    </svg>
  )
}
