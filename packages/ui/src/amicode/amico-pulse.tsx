// AMICODE: the working indicator — a single hollow dot emitting a crisp
// expanding ripple. This is the website's own working signal (globals.css
// .rail-dot: a spread-only box-shadow ripple, 1.6s ease-out) brought home
// verbatim — a blurred edge was tried and cut (Kate 2026-08-25). Clean and
// conceptless: circular like the rail nodes, one quiet breath at a time.
//
// Replaces AmicoHarmonics (parked alongside AmicoWave). Carries the
// `amc-wave` class ONLY for the thinking grid's placement + icon-accent ink
// (neutral on light, brand yellow on dark); its own skin is .amc-pulse in
// amicode.css.
export function AmicoPulse(props: { class?: string }) {
  return <span class={`amc-wave amc-pulse${props.class ? " " + props.class : ""}`} aria-hidden="true" />
}
