import { describe, expect, test, mock } from "bun:test"
import { readFileSync } from "fs"
import { resolve } from "path"
import { notifyProjectSelected } from "./amicode-workspace-projects"

describe("amicode workspace-projects — notifyProjectSelected (#663)", () => {
  test("posts a project-selected envelope to the parent frame", () => {
    const calls: unknown[] = []
    const orig = window.parent.postMessage
    window.parent.postMessage = (...args: unknown[]) => { calls.push(args) }
    try {
      notifyProjectSelected("/Users/jj/harmoniqs")
      expect(calls).toHaveLength(1)
      const [msg, origin] = calls[0] as [Record<string, unknown>, string]
      expect(msg).toEqual({ source: "amicode", kind: "project-selected", path: "/Users/jj/harmoniqs", autoExpand: true })
      expect(origin).toBe("*")
    } finally {
      window.parent.postMessage = orig
    }
  })

  test("explicit selection defaults to autoExpand=true", () => {
    const calls: unknown[] = []
    const orig = window.parent.postMessage
    window.parent.postMessage = (...args: unknown[]) => { calls.push(args) }
    try {
      notifyProjectSelected("/projects/foo")
      const [msg] = calls[0] as [Record<string, unknown>]
      expect(msg.autoExpand).toBe(true)
    } finally {
      window.parent.postMessage = orig
    }
  })

  test("session navigation passes autoExpand=false", () => {
    const calls: unknown[] = []
    const orig = window.parent.postMessage
    window.parent.postMessage = (...args: unknown[]) => { calls.push(args) }
    try {
      notifyProjectSelected("/projects/foo", false)
      const [msg] = calls[0] as [Record<string, unknown>]
      expect(msg.autoExpand).toBe(false)
    } finally {
      window.parent.postMessage = orig
    }
  })
})

describe("prompt-project-selector — no false default (#673)", () => {
  const src = readFileSync(
    resolve(__dirname, "..", "components", "prompt-project-selector.tsx"),
    "utf8",
  )

  test("selected() returns current() without a fallback to available[0]", () => {
    // The old line was: const selected = () => current() ?? input.controls().available[0]
    // The new line must NOT fall back to available[0]
    expect(src).not.toMatch(/selected\s*=\s*\(\)\s*=>\s*current\(\)\s*\?\?\s*input/)
  })

  test("trigger shows a placeholder when no project is selected", () => {
    // The trigger must have a fallback text for the unselected state
    expect(src).toMatch(/Pick a project/i)
  })
})
