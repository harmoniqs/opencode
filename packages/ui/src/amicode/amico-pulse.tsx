// AMICODE: the working indicator — a single hollow dot emitting a soft
// glowing pulse. This is the website's own working signal (globals.css
// .rail-dot: a box-shadow ripple, 1.6s ease-out) brought home, with a blurred
// edge so the ripple glows instead of ringing. Clean and conceptless
// (Kate 2026-08-25): circular like the rail nodes, one quiet breath at a time.
//
// Replaces AmicoHarmonics (parked alongside AmicoWave). Carries the
// `amc-wave` class ONLY for the thinking grid's placement + icon-accent ink
// (neutral on light, brand yellow on dark); its own skin is .amc-pulse in
// amicode.css.
export function AmicoPulse(props: { class?: string }) {
  return <span class={`amc-wave amc-pulse${props.class ? " " + props.class : ""}`} aria-hidden="true" />
}
