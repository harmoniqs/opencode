import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// Regression guard for the travelling dot + bottom-up card animation (#265).
// These CSS declarations are load-bearing: removing them silently breaks the
// dot's smooth travel and the card entry motion.

const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8")
const polishCss = readFileSync(resolve(__dirname, "../../../design-polish.css"), "utf8")

describe("travelling dot transition (#265)", () => {
  test("settled dot has top transition", () => {
    expect(indexCss).toContain("thought-rail-dot--settled")
    expect(indexCss).toMatch(/thought-rail-dot--settled[^}]*transition[^}]*top/)
  })

  test("rail line has height transition", () => {
    expect(indexCss).toMatch(/thought-rail-line[^}]*transition[^}]*height/)
  })

  test("reduced motion disables dot transition", () => {
    // Inside a prefers-reduced-motion block, the settled class gets transition: none
    expect(indexCss).toMatch(/prefers-reduced-motion[\s\S]*thought-rail-dot--settled[\s\S]*transition:\s*none/)
  })

  test("reduced motion disables rail line transition", () => {
    expect(indexCss).toMatch(/prefers-reduced-motion[\s\S]*thought-rail-line[\s\S]*transition:\s*none/)
  })
})


