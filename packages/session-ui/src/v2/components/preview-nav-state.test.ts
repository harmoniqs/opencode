import { describe, expect, test, beforeEach } from "bun:test"
import {
  createPreviewNavState,
  filterDirectoryEntries,
  type PreviewTabState,
  type DirectoryEntry,
} from "./preview-nav-state"

/**
 * Tests for the Preview tab navigation state machine (Slice 2 of #912).
 * Pure logic — no SolidJS, no DOM.
 */

// ---------------------------------------------------------------------------
// createPreviewNavState — state transitions
// ---------------------------------------------------------------------------

describe("createPreviewNavState", () => {
  let state: ReturnType<typeof createPreviewNavState>

  beforeEach(() => {
    state = createPreviewNavState()
  })

  test("initial state: root directory, no selected file", () => {
    expect(state.get().currentPath).toBe("")
    expect(state.get().selectedFile).toBeNull()
    expect(state.get().searchQuery).toBe("")
  })

  test("navigateToFolder sets currentPath and clears selectedFile", () => {
    state.selectFile("src/README.md")
    state.navigateToFolder("src/components")
    expect(state.get().currentPath).toBe("src/components")
    expect(state.get().selectedFile).toBeNull()
  })

  test("selectFile sets the selected file path", () => {
    state.selectFile("src/README.md")
    expect(state.get().selectedFile).toBe("src/README.md")
  })

  test("goBack from file view: clears selectedFile", () => {
    state.navigateToFolder("src")
    state.selectFile("src/README.md")
    state.goBack()
    expect(state.get().selectedFile).toBeNull()
    expect(state.get().currentPath).toBe("src")
  })

  test("goBack from subdirectory: navigates to parent", () => {
    state.navigateToFolder("src/components/session")
    state.goBack()
    expect(state.get().currentPath).toBe("src/components")
    expect(state.get().selectedFile).toBeNull()
  })

  test("goBack from root directory: stays at root (no-op)", () => {
    state.goBack()
    expect(state.get().currentPath).toBe("")
    expect(state.get().selectedFile).toBeNull()
  })

  test("goBack from first-level directory: returns to root", () => {
    state.navigateToFolder("src")
    state.goBack()
    expect(state.get().currentPath).toBe("")
  })

  test("fileStates persist across navigation", () => {
    state.setFileState("README.md", { mode: "edit", scrollPosition: 150, unsavedContent: null })
    state.navigateToFolder("src")
    state.navigateToFolder("")
    expect(state.get().fileStates["README.md"]).toEqual({
      mode: "edit",
      scrollPosition: 150,
      unsavedContent: null,
    })
  })

  test("setFileState merges into existing state", () => {
    state.setFileState("README.md", { mode: "preview", scrollPosition: 0, unsavedContent: null })
    state.setFileState("README.md", { mode: "edit", scrollPosition: 0, unsavedContent: "edited" })
    expect(state.get().fileStates["README.md"]?.mode).toBe("edit")
    expect(state.get().fileStates["README.md"]?.unsavedContent).toBe("edited")
  })

  test("getFileState returns default for unknown file", () => {
    expect(state.getFileState("unknown.md")).toEqual({
      mode: "preview",
      scrollPosition: 0,
      unsavedContent: null,
    })
  })
})

// ---------------------------------------------------------------------------
// filterDirectoryEntries — filter file nodes to renderable entries
// ---------------------------------------------------------------------------

describe("filterDirectoryEntries", () => {
  const makeEntry = (name: string, type: "file" | "directory", path?: string): DirectoryEntry => ({
    name,
    path: path ?? name,
    absolute: `/project/${path ?? name}`,
    type,
    ignored: false,
  })

  test("includes renderable files", () => {
    const entries = [
      makeEntry("README.md", "file"),
      makeEntry("diagram.png", "file"),
      makeEntry("paper.pdf", "file"),
    ]
    const result = filterDirectoryEntries(entries)
    expect(result).toHaveLength(3)
  })

  test("excludes non-renderable files", () => {
    const entries = [
      makeEntry("app.ts", "file"),
      makeEntry("style.css", "file"),
      makeEntry("data.json", "file"),
      makeEntry("README.md", "file"),
    ]
    const result = filterDirectoryEntries(entries)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("README.md")
  })

  test("includes all non-ignored directories", () => {
    const entries = [
      makeEntry("src", "directory"),
      makeEntry("docs", "directory"),
    ]
    const result = filterDirectoryEntries(entries)
    expect(result).toHaveLength(2)
  })

  test("excludes ignored entries", () => {
    const entries = [
      { name: "node_modules", path: "node_modules", absolute: "/project/node_modules", type: "directory" as const, ignored: true },
      { name: ".git", path: ".git", absolute: "/project/.git", type: "directory" as const, ignored: true },
      makeEntry("README.md", "file"),
    ]
    const result = filterDirectoryEntries(entries)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("README.md")
  })

  test("sorts directories before files, then alphabetically", () => {
    const entries = [
      makeEntry("zebra.md", "file"),
      makeEntry("docs", "directory"),
      makeEntry("alpha.md", "file"),
      makeEntry("src", "directory"),
    ]
    const result = filterDirectoryEntries(entries)
    expect(result.map(e => e.name)).toEqual(["docs", "src", "alpha.md", "zebra.md"])
  })

  test("returns empty array for no renderable entries", () => {
    const entries = [
      makeEntry("app.ts", "file"),
      makeEntry("index.js", "file"),
    ]
    const result = filterDirectoryEntries(entries)
    expect(result).toHaveLength(0)
  })

  test("handles empty input", () => {
    expect(filterDirectoryEntries([])).toHaveLength(0)
  })
})
