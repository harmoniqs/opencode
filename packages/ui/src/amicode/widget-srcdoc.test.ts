import { describe, expect, test } from "bun:test"
import { densityFor, resolveTokens } from "./widget-tokens"
import { WIDGET_CSP, buildSrcdoc, embedCode } from "./widget-srcdoc"

describe("densityFor", () => {
  test("boundaries match COMPACT_CSS (≤880 compact, ≤760 tight)", () => {
    expect(densityFor(881)).toBe("normal")
    expect(densityFor(880)).toBe("compact")
    expect(densityFor(761)).toBe("compact")
    expect(densityFor(760)).toBe("tight")
    expect(densityFor(500)).toBe("tight")
  })
})

describe("resolveTokens", () => {
  test("maps resolved v2 values and falls back when empty", () => {
    const tokens = resolveTokens((name) => (name === "--v2-text-text-base" ? " #fff " : ""), "normal")
    expect(tokens["--amc-text"]).toBe("#fff")
    expect(tokens["--amc-bg"]).toBe("#0B0E15") // fallback
    expect(tokens["--amc-accent"]).toBe("#F2C94C")
    expect(tokens["--amc-font-mono"]).toContain("monospace")
    expect(Object.keys(tokens)).toHaveLength(15) // 11 colors + 2 fonts + 2 pads
  })
  test("padding tokens follow density", () => {
    expect(resolveTokens(() => "", "normal")["--amc-pad"]).toBe("14px 16px")
    expect(resolveTokens(() => "", "tight")["--amc-pad"]).toBe("8px 12px")
  })
})

describe("buildSrcdoc", () => {
  const doc = buildSrcdoc({ code: "export default { mount() {} }", tokens: { "--amc-bg": "#000" }, density: "compact" })

  test("carries the exact normative CSP", () => {
    expect(doc).toContain(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' blob:; style-src \'unsafe-inline\'; img-src https: data:">',
    )
    expect(WIDGET_CSP).not.toContain("unsafe-eval")
  })

  test("tokens on :root, runtime + code present, density stamped", () => {
    expect(doc).toContain(":root { --amc-bg: #000; }")
    expect(doc).toContain("amc:init") // runtime marker
    expect(doc).toContain("__amcWidgetCode")
    expect(doc).toContain('data-density="compact"')
  })

  test("</script> in widget code cannot break out", () => {
    const hostile = buildSrcdoc({ code: 'var x = "</script><script>alert(1)"', tokens: {}, density: "normal" })
    // the only </script> occurrences are the assembler's own closers
    expect(hostile).not.toContain('alert(1)"</script>')
    expect(embedCode("</script>")).not.toContain("</script>")
  })
})
