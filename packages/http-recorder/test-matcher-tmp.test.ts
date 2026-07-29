import { describe, expect, test } from "bun:test"
import { promptAgnosticMatcher, defaultMatcher } from "@opencode-ai/http-recorder/internal"

const snap = (body: unknown) => ({
  method: "POST",
  url: "https://api.example.com/v1/x",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

describe("promptAgnosticMatcher", () => {
  test("ignores instructions (OpenAI shape)", () => {
    const a = snap({ model: "m", instructions: "OLD PROMPT", input: [] })
    const b = snap({ model: "m", instructions: "TOTALLY NEW PROMPT", input: [] })
    expect(defaultMatcher(a, b)).toBe(false)
    expect(promptAgnosticMatcher(a, b)).toBe(true)
  })

  test("ignores system[] (Anthropic shape)", () => {
    const a = snap({ model: "m", system: [{ type: "text", text: "OLD" }] })
    const b = snap({ model: "m", system: [{ type: "text", text: "NEW" }] })
    expect(promptAgnosticMatcher(a, b)).toBe(true)
  })

  test("ignores a role:system message (proxy shape)", () => {
    const a = snap({ model: "m", input: [{ role: "system", content: "OLD" }, { role: "user", content: "hi" }] })
    const b = snap({ model: "m", input: [{ role: "system", content: "NEW" }, { role: "user", content: "hi" }] })
    expect(promptAgnosticMatcher(a, b)).toBe(true)
  })

  // The guard rails: everything that is NOT prompt prose must still differentiate.
  test("still rejects a different user message", () => {
    const a = snap({ model: "m", input: [{ role: "system", content: "P" }, { role: "user", content: "Paris" }] })
    const b = snap({ model: "m", input: [{ role: "system", content: "P" }, { role: "user", content: "Berlin" }] })
    expect(promptAgnosticMatcher(a, b)).toBe(false)
  })

  test("still rejects a different model", () => {
    expect(promptAgnosticMatcher(snap({ model: "a", instructions: "P" }), snap({ model: "b", instructions: "P" }))).toBe(false)
  })

  test("still rejects different tools", () => {
    const a = snap({ model: "m", instructions: "P", tools: [{ name: "get_weather" }] })
    const b = snap({ model: "m", instructions: "P", tools: [{ name: "rm_rf" }] })
    expect(promptAgnosticMatcher(a, b)).toBe(false)
  })

  test("still rejects a missing vs present system message", () => {
    const a = snap({ model: "m", input: [{ role: "system", content: "P" }, { role: "user", content: "hi" }] })
    const b = snap({ model: "m", input: [{ role: "user", content: "hi" }] })
    expect(promptAgnosticMatcher(a, b)).toBe(false)
  })

  test("still rejects a different url", () => {
    const a = { ...snap({ model: "m", instructions: "P" }), url: "https://api.example.com/v1/x" }
    const b = { ...snap({ model: "m", instructions: "P" }), url: "https://evil.example.com/v1/x" }
    expect(promptAgnosticMatcher(a, b)).toBe(false)
  })
})
