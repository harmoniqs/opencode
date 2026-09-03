import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { EditorState } from "@codemirror/state"
import { EditorView, lineNumbers } from "@codemirror/view"
import {
  diffGutterExtension,
  DiffGutterMarkerKind,
  getDiffMarkers,
} from "./diff-gutter-extension"

/**
 * Tests for the custom unified-mode diff gutter extension (#769).
 *
 * The extension diffs `original` vs the current document and renders
 * gutter markers (added/removed/changed) in a custom CM6 gutter.
 */

function createEditor(opts: {
  doc: string
  original: string
  parent: HTMLElement
}): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: opts.doc,
      extensions: [lineNumbers(), diffGutterExtension(opts.original)],
    }),
    parent: opts.parent,
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("diffGutterExtension", () => {
  let parent: HTMLDivElement
  let view: EditorView

  beforeEach(() => {
    parent = document.createElement("div")
    document.body.appendChild(parent)
  })

  afterEach(() => {
    view?.destroy()
    parent.remove()
  })

  test("module exports diffGutterExtension function", async () => {
    const mod = await import("./diff-gutter-extension")
    expect(mod.diffGutterExtension).toBeDefined()
    expect(typeof mod.diffGutterExtension).toBe("function")
  })

  test("module exports DiffGutterMarkerKind enum/type", async () => {
    const mod = await import("./diff-gutter-extension")
    expect(mod.DiffGutterMarkerKind).toBeDefined()
  })

  test("renders without errors on identical content", async () => {
    view = createEditor({
      doc: "line1\nline2\nline3",
      original: "line1\nline2\nline3",
      parent,
    })

    // Wait for initial deferred compute
    await sleep(100)

    expect(view.state.doc.toString()).toBe("line1\nline2\nline3")
    const markers = getDiffMarkers(view.state)
    expect(markers.size).toBe(0)
  })

  test("shows added marker for new lines", async () => {
    view = createEditor({
      doc: "line1\nnewline\nline2",
      original: "line1\nline2",
      parent,
    })

    await sleep(400)

    const markers = getDiffMarkers(view.state)
    expect(markers.size).toBeGreaterThan(0)
  })

  test("shows removed marker when lines are deleted", async () => {
    view = createEditor({
      doc: "line1\nline3",
      original: "line1\nline2\nline3",
      parent,
    })

    await sleep(400)

    const markers = getDiffMarkers(view.state)
    expect(markers.size).toBeGreaterThan(0)
  })

  test("shows changed marker for modified lines", async () => {
    view = createEditor({
      doc: "line1\nline2-modified\nline3",
      original: "line1\nline2\nline3",
      parent,
    })

    await sleep(400)

    const markers = getDiffMarkers(view.state)
    expect(markers.size).toBeGreaterThan(0)
  })

  test("updates markers after edit (debounced)", async () => {
    view = createEditor({
      doc: "line1\nline2",
      original: "line1\nline2",
      parent,
    })

    // Initially identical — no markers after initial deferred compute
    await sleep(400)
    let markers = getDiffMarkers(view.state)
    expect(markers.size).toBe(0)

    // Edit: add a line
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "\nnewline" },
    })

    // Wait for debounced update
    await sleep(400)

    markers = getDiffMarkers(view.state)
    expect(markers.size).toBeGreaterThan(0)
  })

  test("handles empty original gracefully", () => {
    view = createEditor({
      doc: "some content",
      original: "",
      parent,
    })

    expect(view.state.doc.toString()).toBe("some content")
  })

  test("handles empty modified gracefully", () => {
    view = createEditor({
      doc: "",
      original: "some content",
      parent,
    })

    expect(view.state.doc.toString()).toBe("")
  })
})
