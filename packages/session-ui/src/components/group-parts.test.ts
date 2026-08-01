import { describe, expect, test } from "bun:test"
import { groupParts } from "./message-part-groups"

// Minimal PartType-shaped fixtures — groupParts only reads type/tool/id.
const tool = (id: string, name: string) => ({ messageID: "m1", part: { type: "tool", tool: name, id } as any })
const text = (id: string) => ({ messageID: "m1", part: { type: "text", id, text: "hi" } as any })

describe("groupParts — shell grouping (spec B)", () => {
  test("≥2 consecutive bash collapse into one shell group", () => {
    const groups = groupParts([tool("a", "bash"), tool("b", "bash"), tool("c", "bash")])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.type).toBe("shell")
    expect(groups[0]!.type === "shell" && groups[0]!.refs.map((r) => r.partID)).toEqual(["a", "b", "c"])
  })

  test("a lone bash stays a full part (never a 1-item shell group)", () => {
    const groups = groupParts([text("t"), tool("a", "bash"), text("u")])
    expect(groups.map((g) => g.type)).toEqual(["part", "part", "part"])
  })

  test("non-adjacent bash are not grouped", () => {
    const groups = groupParts([tool("a", "bash"), text("t"), tool("b", "bash")])
    expect(groups.map((g) => g.type)).toEqual(["part", "part", "part"])
  })

  test("context and shell runs stay distinct and adjacent-flush cleanly", () => {
    const groups = groupParts([tool("r1", "read"), tool("r2", "grep"), tool("b1", "bash"), tool("b2", "bash")])
    expect(groups.map((g) => g.type)).toEqual(["context", "shell"])
    expect(groups[0]!.type === "context" && groups[0]!.refs).toHaveLength(2)
    expect(groups[1]!.type === "shell" && groups[1]!.refs).toHaveLength(2)
  })

  test("shell then context: order + boundaries preserved", () => {
    const groups = groupParts([tool("b1", "bash"), tool("b2", "bash"), tool("r1", "list")])
    expect(groups.map((g) => g.type)).toEqual(["shell", "context"])
  })

  test("edits are never grouped", () => {
    const groups = groupParts([tool("e1", "edit"), tool("e2", "write")])
    expect(groups.map((g) => g.type)).toEqual(["part", "part"])
  })
})
