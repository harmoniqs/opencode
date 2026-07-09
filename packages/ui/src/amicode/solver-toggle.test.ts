import { describe, expect, test } from "bun:test"
import { loadSolverMode, saveSolverMode } from "./solver-toggle"

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe("solver mode persistence", () => {
  test("defaults to piccolo; hp round-trips; garbage → piccolo", () => {
    const s = mem()
    expect(loadSolverMode(s)).toBe("piccolo")
    saveSolverMode("hp", s)
    expect(loadSolverMode(s)).toBe("hp")
    s.setItem("amicode-solver-mode", "nonsense")
    expect(loadSolverMode(s)).toBe("piccolo")
  })
  test("storage failures fail soft", () => {
    const broken = {
      getItem: () => {
        throw new Error("nope")
      },
      setItem: () => {
        throw new Error("nope")
      },
    }
    expect(loadSolverMode(broken)).toBe("piccolo")
    expect(() => saveSolverMode("hp", broken)).not.toThrow()
  })
})
