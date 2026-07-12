// AMICODE (widget kernel): the --amc-* token seam. Host CSS vars (--v2-*)
// cannot cross an iframe boundary, so the host resolves its computed values
// into a stable token map that widgets style against — widget code never
// touches fork-internal theme names. Density replaces COMPACT_CSS: widgets
// restyle themselves from the signal instead of the host reaching into tile
// internals. Pure, unit-tested.

export type Density = "normal" | "compact" | "tight"

/** COMPACT_CSS thresholds (home-cards): ≤880 compact, ≤760 tight. */
export function densityFor(webviewHeightPx: number): Density {
  if (webviewHeightPx <= 760) return "tight"
  if (webviewHeightPx <= 880) return "compact"
  return "normal"
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

/** --v2-* source per token, with a dark-theme literal fallback for vars that
 *  resolve empty (run-card palette). */
const SOURCES: [amc: string, v2: string, fallback: string][] = [
  ["--amc-bg", "--v2-background-bg-base", "#0B0E15"],
  ["--amc-layer", "--v2-background-bg-layer-01", "#111624"],
  ["--amc-layer2", "--v2-background-bg-layer-02", "#1A2133"],
  ["--amc-border", "--v2-border-border-base", "#2A3245"],
  ["--amc-text", "--v2-text-text-base", "#E9ECF4"],
  ["--amc-text-muted", "--v2-text-text-muted", "#8B94A9"],
  ["--amc-text-faint", "--v2-text-text-faint", "#6A7286"],
  ["--amc-accent", "--v2-icon-icon-accent", "#F2C94C"],
  ["--amc-success", "--v2-state-fg-success", "#5BC873"],
  ["--amc-warning", "--v2-state-fg-warning", "#E5B454"],
  ["--amc-danger", "--v2-state-fg-danger", "#E56A6A"],
]

const PADDING: Record<Density, { pad: string; padTile: string }> = {
  normal: { pad: "14px 16px", padTile: "10px 12px" },
  compact: { pad: "10px 14px", padTile: "10px 12px" },
  tight: { pad: "8px 12px", padTile: "8px 10px" },
}

/** Resolve the full token map. getVar = (v2Name) => computed value ("" when
 *  unset); the caller wires it to getComputedStyle(appRoot).getPropertyValue. */
export function resolveTokens(getVar: (name: string) => string, density: Density): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [amc, v2, fallback] of SOURCES) {
    const v = getVar(v2).trim()
    out[amc] = v !== "" ? v : fallback
  }
  out["--amc-font-sans"] = SANS
  out["--amc-font-mono"] = MONO
  out["--amc-pad"] = PADDING[density].pad
  out["--amc-pad-tile"] = PADDING[density].padTile
  return out
}
