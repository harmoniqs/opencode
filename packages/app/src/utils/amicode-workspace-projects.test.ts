import { describe, expect, test, mock } from "bun:test"
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
