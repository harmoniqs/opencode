import { describe, expect, test } from "bun:test"
import { darkVariant, parseImageMarkers } from "./image-strip"

describe("parseImageMarkers", () => {
  test("extracts marker lines in order", () => {
    const output = [
      "Sequence validated against AnalogDevice (duration 200ns).",
      "AMICODE_IMAGE: position_sweep.png",
      "wrote position_sweep.png",
      "AMICODE_IMAGE: register.png",
    ].join("\n")
    expect(parseImageMarkers(output)).toEqual(["position_sweep.png", "register.png"])
  })

  test("dedupes and trims", () => {
    const output = "AMICODE_IMAGE:  a.png \nAMICODE_IMAGE: a.png"
    expect(parseImageMarkers(output)).toEqual(["a.png"])
  })

  test("rejects traversal, absolute paths, and non-image extensions", () => {
    const output = [
      "AMICODE_IMAGE: ../secrets.png",
      "AMICODE_IMAGE: /etc/passwd.png",
      "AMICODE_IMAGE: notes.txt",
      "AMICODE_IMAGE: pulse.toml",
      "AMICODE_IMAGE: ok.svg",
    ].join("\n")
    expect(parseImageMarkers(output)).toEqual(["ok.svg"])
  })

  test("caps at six images", () => {
    const output = Array.from({ length: 9 }, (_, i) => `AMICODE_IMAGE: fig${i}.png`).join("\n")
    expect(parseImageMarkers(output)).toHaveLength(6)
  })

  test("non-string and empty inputs are empty", () => {
    expect(parseImageMarkers(undefined)).toEqual([])
    expect(parseImageMarkers(42)).toEqual([])
    expect(parseImageMarkers("")).toEqual([])
    expect(parseImageMarkers("plain output, no markers")).toEqual([])
  })

  test("marker must start the line", () => {
    expect(parseImageMarkers("note: AMICODE_IMAGE: sneaky.png")).toEqual([])
  })
})

describe("darkVariant", () => {
  test("inserts .dark before the extension", () => {
    expect(darkVariant("position_sweep.png")).toBe("position_sweep.dark.png")
    expect(darkVariant("a/b/register.png")).toBe("a/b/register.dark.png")
  })
  test("leaves extensionless paths alone", () => {
    expect(darkVariant("noext")).toBe("noext")
  })
})
