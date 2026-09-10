import { describe, expect, test } from "bun:test"
import { createPreviewWorkspace, movePreviewTab, openPreviewPath, previewLeaves, previewMinimumExtent } from "./session-preview-tree"

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

  test("rejects an edge split that would empty a one-tab leaf", () => {
    const workspace = createPreviewWorkspace(["notes/only.md"])

    expect(
      movePreviewTab(workspace, {
        path: "notes/only.md",
        targetLeafID: "root",
        position: "right",
      }),
    ).toBe(workspace)
  })

  test("adds nested leaf minima along the split axis", () => {
    const initial = openPreviewPath(createPreviewWorkspace(["notes/one.md", "notes/two.md"]), "notes/three.md")
    const firstSplit = movePreviewTab(initial, {
      path: "notes/two.md",
      targetLeafID: "root",
      position: "right",
    })
    const nested = movePreviewTab(firstSplit, {
      path: "notes/three.md",
      targetLeafID: "pane-1",
      position: "right",
    })

    expect(previewMinimumExtent(nested.tree, "horizontal")).toBe(450)
    expect(previewMinimumExtent(nested.tree, "vertical")).toBe(150)
  })
})
