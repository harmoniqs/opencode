import { describe, expect, test } from "bun:test"
import { legacyJsonSchema } from "../../src/tool/registry"

// AMICODE: nullable-union normalization — `type: ["array","null"]` must become
// a singular-typed optional field. Passed through raw, Gemini's adapter emits
// an any_of whose array branch lacks `items` and rejects the whole function
// declaration (every turn on a Gemini model died with an empty APIError reply).
describe("legacyJsonSchema", () => {
  test("strips null from union types and marks the field optional", () => {
    const schema = legacyJsonSchema([
      ["question", { type: "string", description: "q" }],
      ["details", { type: ["array", "null"], items: { type: "string" }, description: "optional" }],
    ])
    expect(schema.properties?.details).toEqual({ type: "array", items: { type: "string" }, description: "optional" })
    expect(schema.required).toEqual(["question"])
  })
  test("singular-typed fields pass through untouched and stay required", () => {
    const schema = legacyJsonSchema([["options", { type: "array", items: { type: "string" } }]])
    expect(schema.properties?.options).toEqual({ type: "array", items: { type: "string" } })
    expect(schema.required).toEqual(["options"])
  })
})
