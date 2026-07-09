import { type ComponentProps } from "solid-js"

// AMICODE branding v2: Mark/Splash render the "digi" Harmoniqs H-robot
// (canonical source also lives at amicode:packages/extension/media/amico.svg,
// kept in sync manually); Logo renders the AMICODE wordmark. Component names,
// props, and data-component hooks are kept identical to stock. The robot body
// follows currentColor; the display rect + glyphs are fixed brand colors.
// viewBox is 64:56 (8:7, not square) — see logo.css aspect-ratio.

const Robot = () => (
  <>
    <path fill="currentColor" d="M2 2h16v14h28V2h16v52H46V40H18v14H2Z" />
    <rect x="9" y="19" width="46" height="18" fill="#0A0A0A" />
    <g fill="#FFF676">
      <rect x="17" y="21" width="2" height="2" />
      <rect x="15" y="23" width="2" height="2" />
      <rect x="13" y="25" width="2" height="2" />
      <rect x="15" y="27" width="2" height="2" />
      <rect x="17" y="29" width="2" height="2" />
      <rect x="21" y="21" width="6" height="2" />
      <rect x="21" y="23" width="2" height="6" />
      <rect x="25" y="23" width="2" height="6" />
      <rect x="21" y="29" width="6" height="2" />
      <rect x="29" y="21" width="2" height="10" />
      <rect x="33" y="21" width="2" height="10" />
      <rect x="37" y="21" width="6" height="2" />
      <rect x="37" y="23" width="2" height="6" />
      <rect x="41" y="23" width="2" height="6" />
      <rect x="37" y="29" width="6" height="2" />
      <rect x="45" y="21" width="2" height="2" />
      <rect x="47" y="23" width="2" height="2" />
      <rect x="49" y="25" width="2" height="2" />
      <rect x="47" y="27" width="2" height="2" />
      <rect x="45" y="29" width="2" height="2" />
      <polygon points="28,33 36,33 34,36 30,36" />
    </g>
  </>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 56"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: "var(--icon-strong-base)" }}
    >
      <Robot />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 64 56"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: "var(--icon-strong-base)" }}
    >
      <Robot />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 234 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <text
        x="117"
        y="22"
        text-anchor="middle"
        dominant-baseline="central"
        textLength="230"
        lengthAdjust="spacingAndGlyphs"
        font-family="'Racing Sans One', var(--font-family-mono, ui-monospace, monospace)"
        font-weight="400"
        font-size="36"
        fill="var(--icon-base)"
      >
        AMICODE
      </text>
    </svg>
  )
}
