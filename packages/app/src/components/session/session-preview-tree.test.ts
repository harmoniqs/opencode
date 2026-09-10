import { describe, expect, test } from "bun:test"
import { createPreviewWorkspace, movePreviewTab, previewLeaves } from "./session-preview-tree"

describe("Preview workspace pane tree", () => {
  test("moves a tab into a focused right sibling leaf", () => {
    const workspace = createPreviewWorkspace(["notes/baseline.md", "notes/second.md"])

    const moved = movePreviewTab(workspace, {
      path: "notes/second.md",
      targetLeafID: "root",
      position: "right",
    })

    expect(previewLeaves(moved.tree).map(({ id, tabs, selectedPath }) => ({ id, tabs, selectedPath }))).toEqual([
      { id: "root", tabs: ["notes/baseline.md"], selectedPath: "notes/baseline.md" },
      { id: "pane-1", tabs: ["notes/second.md"], selectedPath: "notes/second.md" },
    ])
    expect(moved.focusedLeafID).toBe("pane-1")
  })
})
