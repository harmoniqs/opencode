import { describe, expect, test } from "bun:test"
import { parseManifest, sanitizeConfig, type WidgetManifest } from "../../src/server/amicode/widget-manifest"

const GOOD = `
id = "pulse-bank"
name = "Pulse bank"
version = "1.0.0"
description = "Banked pulses at a glance"
size = "tile"
height = 96

[config.stats]
type = "multi-select"
options = ["problems", "runs", "banked"]
default = ["problems", "runs"]

[config.show_footer]
type = "boolean"
default = true

[config.plot]
type = "select"
options = ["pulse", "objective"]
default = "pulse"
`

const parsed = (src: string, dir = "pulse-bank") => {
  const r = parseManifest(src, dir)
  expect(r.ok).toBe(true)
  if (!r.ok) throw new Error(r.error)
  return r.manifest
}

describe("parseManifest", () => {
  test("happy path with config schema", () => {
    const m = parsed(GOOD)
    expect(m.id).toBe("pulse-bank")
    expect(m.name).toBe("Pulse bank")
    expect(m.size).toBe("tile")
    expect(m.bridge).toBe(1) // defaults
    expect(m.height).toBe(96)
    expect(m.config.stats.type).toBe("multi-select")
    const plot = m.config.plot
    expect(plot.type).toBe("select")
    if (plot.type === "select") expect(plot.options).toEqual(["pulse", "objective"])
  })

  test("id must equal dirname", () => {
    const r = parseManifest(GOOD, "other-dir")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("dirname")
  })

  test("id must be kebab-case", () => {
    expect(parseManifest('id = "Bad_Id"\nname = "x"', "Bad_Id").ok).toBe(false)
  })

  test("name required; size defaults tile; bad size rejected", () => {
    expect(parseManifest('id = "a"', "a").ok).toBe(false)
    const m = parsed('id = "a"\nname = "A"', "a")
    expect(m.size).toBe("tile")
    expect(parseManifest('id = "a"\nname = "A"\nsize = "huge"', "a").ok).toBe(false)
  })

  test("hero size accepted; bridge respected", () => {
    const m = parsed('id = "a"\nname = "A"\nsize = "hero"\nbridge = 2', "a")
    expect(m.size).toBe("hero")
    expect(m.bridge).toBe(2)
  })

  test("select without options rejected; unknown field type rejected", () => {
    expect(parseManifest('id = "a"\nname = "A"\n[config.x]\ntype = "select"\ndefault = "p"', "a").ok).toBe(false)
    expect(parseManifest('id = "a"\nname = "A"\n[config.x]\ntype = "wat"', "a").ok).toBe(false)
  })

  test("default must satisfy own constraints", () => {
    expect(
      parseManifest('id = "a"\nname = "A"\n[config.x]\ntype = "select"\noptions = ["p"]\ndefault = "q"', "a").ok,
    ).toBe(false)
  })

  test("bad toml surfaces as error", () => {
    expect(parseManifest("id =", "a").ok).toBe(false)
  })
})

describe("sanitizeConfig", () => {
  const schema = (): WidgetManifest["config"] => parsed(GOOD).config

  test("valid values pass through", () => {
    const out = sanitizeConfig(schema(), { stats: ["banked"], show_footer: false, plot: "objective" })
    expect(out).toEqual({ stats: ["banked"], show_footer: false, plot: "objective" })
  })

  test("invalid values fall back to defaults; unknown keys dropped", () => {
    const out = sanitizeConfig(schema(), { stats: ["nope", "runs"], show_footer: "yes", plot: "3d", extra: 1 })
    expect(out.stats).toEqual(["runs"]) // invalid options filtered
    expect(out.show_footer).toBe(true) // default
    expect(out.plot).toBe("pulse") // default
    expect("extra" in out).toBe(false)
  })

  test("missing values → defaults; empty schema → empty config", () => {
    expect(sanitizeConfig(schema(), {})).toEqual({ stats: ["problems", "runs"], show_footer: true, plot: "pulse" })
    expect(sanitizeConfig({}, { a: 1 })).toEqual({})
  })
})
