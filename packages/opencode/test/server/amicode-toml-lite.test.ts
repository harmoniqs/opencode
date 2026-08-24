import { describe, expect, test } from "bun:test"
import { parseTomlLite } from "../../src/server/amicode/toml-lite"

const ok = (src: string): Record<string, unknown> => {
  const r = parseTomlLite(src)
  expect(r.ok).toBe(true)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe("parseTomlLite", () => {
  test("scalars: strings, ints, floats, bools", () => {
    const v = ok(`
id = "showcase"
name = 'Pulse bank'
height = 96
opacity = 0.55
builtin = true
hidden = false
`)
    expect(v.id).toBe("showcase")
    expect(v.name).toBe("Pulse bank")
    expect(v.height).toBe(96)
    expect(v.opacity).toBe(0.55)
    expect(v.builtin).toBe(true)
    expect(v.hidden).toBe(false)
  })

  test("string arrays, single line and multiline", () => {
    const v = ok(`
default = ["problems", "runs", "banked"]
options = [
  "a",
  "b",
]
`)
    expect(v.default).toEqual(["problems", "runs", "banked"])
    expect(v.options).toEqual(["a", "b"])
  })

  test("nested tables via [table] and [table.sub]", () => {
    const v = ok(`
id = "x"
[config]
[config.stats]
type = "multi-select"
options = ["problems"]
[origin]
session = "abc"
`) as any
    expect(v.config.stats.type).toBe("multi-select")
    expect(v.config.stats.options).toEqual(["problems"])
    expect(v.origin.session).toBe("abc")
  })

  test("arrays of tables via [[widget]]", () => {
    const v = ok(`
[[widget]]
id = "a"
[[widget]]
id = "b"
hidden = true
`) as any
    expect(v.widget).toHaveLength(2)
    expect(v.widget[0].id).toBe("a")
    expect(v.widget[1].hidden).toBe(true)
  })

  test("comments and blank lines ignored; inline comments after values", () => {
    const v = ok(`
# full line comment
id = "x" # trailing comment
`)
    expect(v.id).toBe("x")
  })

  test("quoted strings keep # and escaped quotes", () => {
    const v = ok(`msg = "keep # this \\" quote"`)
    expect(v.msg).toBe('keep # this " quote')
  })

  test("malformed line → ok:false", () => {
    expect(parseTomlLite("id =").ok).toBe(false)
    expect(parseTomlLite("just garbage").ok).toBe(false)
    expect(parseTomlLite("[unclosed").ok).toBe(false)
  })

  test("duplicate scalar key in same table → ok:false", () => {
    expect(parseTomlLite('id = "a"\nid = "b"').ok).toBe(false)
  })

  test("empty input → empty object", () => {
    expect(ok("")).toEqual({})
  })
})
