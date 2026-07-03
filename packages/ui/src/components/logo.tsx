import { type ComponentProps } from "solid-js"

// AMICODE branding: Mark/Splash render the amico face (from amicode
// packages/extension/media/amico.svg); Logo renders the AMICODE wordmark.
// Component names, props, and data-component hooks are kept identical to stock.

const Face = (props: { stroke: string }) => (
  <g
    stroke={props.stroke}
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M8 11c1.5 -2 6.5 -2 8 0" />
    <path d="M9 15c1 1 5 1 6 0" />
    <circle cx="9.5" cy="9.5" r="0.6" fill={props.stroke} stroke="none" />
    <circle cx="14.5" cy="9.5" r="0.6" fill={props.stroke} stroke="none" />
  </g>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <Face stroke="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <Face stroke="var(--icon-strong-base)" />
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
        font-family="var(--font-family-mono, ui-monospace, monospace)"
        font-weight="700"
        font-size="36"
        fill="var(--icon-base)"
      >
        AMICODE
      </text>
    </svg>
  )
}
