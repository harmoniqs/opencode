/**
 * Custom CM6 gutter extension for unified diff mode (#769).
 *
 * Diffs `original` vs the current editor document and renders gutter
 * markers: green (added), red (removed), yellow (changed). Updates
 * on a debounced basis (~300ms) after each edit.
 *
 * Uses the `diff` npm package (already a session-ui dependency) for
 * line-level diffing.
 *
 * @module
 */

import {
  type Extension,
  StateField,
  StateEffect,
  RangeSet,
  type EditorState,
} from "@codemirror/state"
import {
  EditorView,
  GutterMarker,
  gutter,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"
import { diffLines, type Change } from "diff"

// ---------------------------------------------------------------------------
// Marker kinds and GutterMarker subclasses
// ---------------------------------------------------------------------------

export enum DiffGutterMarkerKind {
  Added = "added",
  Removed = "removed",
  Changed = "changed",
}

class DiffMarker extends GutterMarker {
  constructor(readonly kind: DiffGutterMarkerKind) {
    super()
  }

  toDOM(): HTMLElement {
    const el = document.createElement("div")
    el.className = `cm-diff-gutter-marker cm-diff-gutter-${this.kind}`
    el.style.width = "4px"
    el.style.height = "100%"
    el.style.borderRadius = "1px"

    switch (this.kind) {
      case DiffGutterMarkerKind.Added:
        el.style.backgroundColor = "var(--amc-success, #4caf50)"
        break
      case DiffGutterMarkerKind.Removed:
        el.style.backgroundColor = "var(--amc-danger, #f44336)"
        break
      case DiffGutterMarkerKind.Changed:
        el.style.backgroundColor = "var(--amc-warning, #ffc107)"
        break
    }

    return el
  }
}

const addedMarker = new DiffMarker(DiffGutterMarkerKind.Added)
const removedMarker = new DiffMarker(DiffGutterMarkerKind.Removed)
const changedMarker = new DiffMarker(DiffGutterMarkerKind.Changed)

// ---------------------------------------------------------------------------
// State effect and field for diff markers
// ---------------------------------------------------------------------------

const setDiffMarkers = StateEffect.define<RangeSet<DiffMarker>>()

const diffMarkersField = StateField.define<RangeSet<DiffMarker>>({
  create() {
    return RangeSet.empty
  },
  update(markers, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiffMarkers)) {
        return effect.value
      }
    }
    return markers
  },
})

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------

interface LineMarker {
  line: number
  kind: DiffGutterMarkerKind
}

function computeDiffMarkers(
  original: string,
  current: string,
): LineMarker[] {
  const changes = diffLines(original, current)
  const markers: LineMarker[] = []

  let currentLine = 1

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    const lineCount = change.count ?? 0

    if (change.removed) {
      // Lines were removed from original. Mark the current position
      // with a removed indicator (shown on the line before or at the
      // current position).
      markers.push({
        line: Math.max(1, currentLine),
        kind: DiffGutterMarkerKind.Removed,
      })
      // Check if the next change is an addition (replacement)
      if (i + 1 < changes.length && changes[i + 1].added) {
        const nextChange = changes[i + 1]
        const nextCount = nextChange.count ?? 0
        // This is a replacement — mark added lines as "changed"
        // Remove the last removed marker (it's actually a change)
        markers.pop()
        for (let j = 0; j < nextCount; j++) {
          markers.push({
            line: currentLine + j,
            kind: DiffGutterMarkerKind.Changed,
          })
        }
        currentLine += nextCount
        i++ // Skip the next (added) change since we handled it
      }
      // Removed-only: currentLine doesn't advance (lines are gone from current)
    } else if (change.added) {
      // Pure addition (not a replacement — those are handled above)
      for (let j = 0; j < lineCount; j++) {
        markers.push({
          line: currentLine + j,
          kind: DiffGutterMarkerKind.Added,
        })
      }
      currentLine += lineCount
    } else {
      // Unchanged lines
      currentLine += lineCount
    }
  }

  return markers
}

function markersToRangeSet(
  markers: LineMarker[],
  state: EditorState,
): RangeSet<DiffMarker> {
  const builder: { from: number; marker: DiffMarker }[] = []

  for (const m of markers) {
    if (m.line < 1 || m.line > state.doc.lines) continue

    const lineStart = state.doc.line(m.line).from
    const marker =
      m.kind === DiffGutterMarkerKind.Added
        ? addedMarker
        : m.kind === DiffGutterMarkerKind.Removed
          ? removedMarker
          : changedMarker

    builder.push({ from: lineStart, marker })
  }

  // RangeSet requires sorted, unique positions
  builder.sort((a, b) => a.from - b.from)

  return RangeSet.of(
    builder.map((b) => b.marker.range(b.from)),
  )
}

// ---------------------------------------------------------------------------
// View plugin: debounced diff recomputation
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300

function createDiffPlugin(original: string) {
  return ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | null = null
      private original: string

      constructor(private view: EditorView) {
        this.original = original
        // Defer initial diff computation — can't dispatch during construction
        this.timer = setTimeout(() => {
          this.timer = null
          this.computeAndApply()
        }, 0)
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.scheduleCompute()
        }
      }

      private scheduleCompute() {
        if (this.timer !== null) {
          clearTimeout(this.timer)
        }
        this.timer = setTimeout(() => {
          this.timer = null
          this.computeAndApply()
        }, DEBOUNCE_MS)
      }

      private computeAndApply() {
        const current = this.view.state.doc.toString()
        const markers = computeDiffMarkers(this.original, current)
        const rangeSet = markersToRangeSet(markers, this.view.state)
        this.view.dispatch({
          effects: setDiffMarkers.of(rangeSet),
        })
      }

      destroy() {
        if (this.timer !== null) {
          clearTimeout(this.timer)
        }
      }
    },
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a CM6 extension that shows diff gutter markers comparing
 * the editor content against `original`. Markers update 300ms after
 * the last edit.
 */
export function diffGutterExtension(original: string): Extension {
  return [
    diffMarkersField,
    gutter({
      class: "cm-diff-gutter",
      markers: (view) => view.state.field(diffMarkersField),
    }),
    createDiffPlugin(original),
    // Gutter styling
    EditorView.baseTheme({
      ".cm-diff-gutter": {
        width: "6px",
        minWidth: "6px",
        marginRight: "2px",
      },
    }),
  ]
}

/**
 * Read the current diff markers from an EditorState.
 * Useful for testing — avoids relying on DOM rendering.
 */
export function getDiffMarkers(state: EditorState): RangeSet<GutterMarker> {
  return state.field(diffMarkersField)
}
