import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import {
  loadLanguage,
  buildThemeExtension,
  createDiffEditor,
  baseExtensions,
  type DiffEditorHandle,
} from "./editable-diff-view-core"

/**
 * Tests for EditableDiffView core logic (no JSX / SolidJS needed).
 *
 * Tests the language loader, theme builder, and imperative editor
 * construction — the behavioral contract the SolidJS wrapper delegates to.
 */

// ---------------------------------------------------------------------------
// loadLanguage
// ---------------------------------------------------------------------------

describe("loadLanguage", () => {
  test("resolves known extensions to a LanguageSupport", async () => {
    const js = await loadLanguage("js")
    expect(js).not.toBeNull()

    const ts = await loadLanguage("ts")
    expect(ts).not.toBeNull()

    const tsx = await loadLanguage("tsx")
    expect(tsx).not.toBeNull()

    const py = await loadLanguage("py")
    expect(py).not.toBeNull()

    const json = await loadLanguage("json")
    expect(json).not.toBeNull()

    const md = await loadLanguage("md")
    expect(md).not.toBeNull()

    const css = await loadLanguage("css")
    expect(css).not.toBeNull()

    const html = await loadLanguage("html")
    expect(html).not.toBeNull()
  })

  test("returns null for unknown extensions", async () => {
    const result = await loadLanguage("xyz-unknown-extension")
    expect(result).toBeNull()
  })

  test("strips leading dot from extension", async () => {
    const result = await loadLanguage(".ts")
    expect(result).not.toBeNull()
  })

  test("is case-insensitive", async () => {
    const result = await loadLanguage("JSON")
    expect(result).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildThemeExtension
// ---------------------------------------------------------------------------

describe("buildThemeExtension", () => {
  test("returns a defined CM6 Extension for dark mode", () => {
    const ext = buildThemeExtension("dark")
    expect(ext).toBeDefined()
    expect(ext).not.toBeNull()
  })

  test("returns a defined CM6 Extension for light mode", () => {
    const ext = buildThemeExtension("light")
    expect(ext).toBeDefined()
    expect(ext).not.toBeNull()
  })

  test("dark and light produce distinct extensions", () => {
    const dark = buildThemeExtension("dark")
    const light = buildThemeExtension("light")
    // They should be distinct objects
    expect(dark).not.toBe(light)
  })
})

// ---------------------------------------------------------------------------
// baseExtensions
// ---------------------------------------------------------------------------

describe("baseExtensions", () => {
  test("returns an array of extensions", () => {
    const theme = buildThemeExtension("dark")
    const exts = baseExtensions({ readOnly: false, theme })
    expect(Array.isArray(exts)).toBe(true)
    expect(exts.length).toBeGreaterThan(0)
  })

  test("includes onChange listener when not readOnly", () => {
    const theme = buildThemeExtension("dark")
    const withCb = baseExtensions({ readOnly: false, theme, onChange: () => {} })
    const withoutCb = baseExtensions({ readOnly: false, theme })
    // With onChange callback should have one more extension
    expect(withCb.length).toBe(withoutCb.length + 1)
  })

  test("omits onChange listener when readOnly", () => {
    const theme = buildThemeExtension("dark")
    const withCb = baseExtensions({ readOnly: true, theme, onChange: () => {} })
    const withoutCb = baseExtensions({ readOnly: true, theme })
    // readOnly suppresses the onChange extension regardless
    expect(withCb.length).toBe(withoutCb.length)
  })
})

// ---------------------------------------------------------------------------
// createDiffEditor — split mode
// ---------------------------------------------------------------------------

describe("createDiffEditor (split mode)", () => {
  let parent: HTMLDivElement
  let handle: DiffEditorHandle

  beforeEach(() => {
    parent = document.createElement("div")
    document.body.appendChild(parent)
  })

  afterEach(() => {
    handle?.destroy()
    parent.remove()
  })

  test("creates a split MergeView in the parent element", () => {
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "line1\nline2",
      modified: "line1\nline2-changed",
      diffStyle: "split",
      readOnly: false,
      theme,
    })

    expect(handle.mergeView).not.toBeNull()
    // MergeView should have inserted DOM into parent
    expect(parent.children.length).toBeGreaterThan(0)
  })

  test("editorView returns the modified (b) pane", () => {
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "original",
      modified: "modified",
      diffStyle: "split",
      readOnly: false,
      theme,
    })

    expect(handle.editorView).not.toBeNull()
    expect(handle.getContent()).toBe("modified")
  })

  test("onChange fires when content changes", () => {
    const changes: string[] = []
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "original",
      modified: "modified",
      diffStyle: "split",
      readOnly: false,
      theme,
      onChange: (c) => changes.push(c),
    })

    const view = handle.editorView!
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "new content" },
    })

    expect(changes.length).toBeGreaterThan(0)
    expect(changes[changes.length - 1]).toBe("new content")
  })

  test("readOnly prevents content changes", () => {
    const changes: string[] = []
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "original",
      modified: "modified",
      diffStyle: "split",
      readOnly: true,
      theme,
      onChange: (c) => changes.push(c),
    })

    const view = handle.editorView!
    const before = view.state.doc.toString()

    // Dispatch should be rejected by readOnly
    view.dispatch({
      changes: { from: 0, insert: "X" },
    })

    expect(view.state.doc.toString()).toBe(before)
    expect(changes.length).toBe(0)
  })

  test("getContent returns current document text", () => {
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "orig",
      modified: "mod",
      diffStyle: "split",
      readOnly: false,
      theme,
    })

    expect(handle.getContent()).toBe("mod")

    handle.editorView!.dispatch({
      changes: { from: 0, to: 3, insert: "updated" },
    })

    expect(handle.getContent()).toBe("updated")
  })

  test("revert replaces content with original", () => {
    const changes: string[] = []
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "original text",
      modified: "modified text",
      diffStyle: "split",
      readOnly: false,
      theme,
      onChange: (c) => changes.push(c),
    })

    // Make some edits
    handle.editorView!.dispatch({
      changes: {
        from: 0,
        to: handle.editorView!.state.doc.length,
        insert: "user edits",
      },
    })
    expect(handle.getContent()).toBe("user edits")

    // Revert
    handle.revert("original text")
    expect(handle.getContent()).toBe("original text")
  })

  test("destroy cleans up both editors", () => {
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "a",
      modified: "b",
      diffStyle: "split",
      readOnly: false,
      theme,
    })

    handle.destroy()
    expect(handle.editorView).toBeNull()
    expect(handle.mergeView).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// createDiffEditor — unified mode
// ---------------------------------------------------------------------------

describe("createDiffEditor (unified mode)", () => {
  let parent: HTMLDivElement
  let handle: DiffEditorHandle

  beforeEach(() => {
    parent = document.createElement("div")
    document.body.appendChild(parent)
  })

  afterEach(() => {
    handle?.destroy()
    parent.remove()
  })

  test("creates a single EditorView in unified mode", () => {
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "line1\nline2",
      modified: "line1\nline2-changed",
      diffStyle: "unified",
      readOnly: false,
      theme,
    })

    expect(handle.editorView).not.toBeNull()
    // In unified mode, mergeView should be null
    expect(handle.mergeView).toBeNull()
    expect(parent.children.length).toBeGreaterThan(0)
  })

  test("onChange fires on content changes in unified mode", () => {
    const changes: string[] = []
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "original",
      modified: "modified",
      diffStyle: "unified",
      readOnly: false,
      theme,
      onChange: (c) => changes.push(c),
    })

    const view = handle.editorView!
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "new" },
    })

    expect(changes.length).toBeGreaterThan(0)
    expect(changes[changes.length - 1]).toBe("new")
  })

  test("readOnly prevents changes in unified mode", () => {
    const theme = buildThemeExtension("dark")
    handle = createDiffEditor({
      parent,
      original: "orig",
      modified: "mod",
      diffStyle: "unified",
      readOnly: true,
      theme,
    })

    const view = handle.editorView!
    const before = view.state.doc.toString()
    view.dispatch({ changes: { from: 0, insert: "X" } })
    expect(view.state.doc.toString()).toBe(before)
  })
})
