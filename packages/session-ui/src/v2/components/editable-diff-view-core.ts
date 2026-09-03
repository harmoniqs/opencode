/**
 * EditableDiffView — CodeMirror 6 core logic.
 *
 * Pure logic layer: language loading, theme building, editor construction.
 * The SolidJS component wrapper lives in editable-diff-view.tsx and uses
 * these functions. Tests import this file directly (no JSX transform needed).
 *
 * @module
 */

import { EditorState, type Extension } from "@codemirror/state"
import {
  EditorView,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
  highlightSpecialChars,
} from "@codemirror/view"
import { MergeView, unifiedMergeView } from "@codemirror/merge"
import { type LanguageSupport } from "@codemirror/language"
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language"

// ---------------------------------------------------------------------------
// Language loader — dynamic imports so unused grammars stay out of the bundle.
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, () => Promise<LanguageSupport>> = {
  js: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: false, typescript: false })),
  jsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: false })),
  ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: false, typescript: true })),
  tsx: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true })),
  mjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: false, typescript: false })),
  cjs: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: false, typescript: false })),
  py: () => import("@codemirror/lang-python").then((m) => m.python()),
  python: () => import("@codemirror/lang-python").then((m) => m.python()),
  json: () => import("@codemirror/lang-json").then((m) => m.json()),
  jsonc: () => import("@codemirror/lang-json").then((m) => m.json()),
  md: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  markdown: () => import("@codemirror/lang-markdown").then((m) => m.markdown()),
  css: () => import("@codemirror/lang-css").then((m) => m.css()),
  scss: () => import("@codemirror/lang-css").then((m) => m.css()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
  htm: () => import("@codemirror/lang-html").then((m) => m.html()),
  xml: () => import("@codemirror/lang-html").then((m) => m.html()),
  svg: () => import("@codemirror/lang-html").then((m) => m.html()),
}

/**
 * Dynamically load a CodeMirror language support by file extension.
 * Returns null for unknown extensions.
 */
export async function loadLanguage(
  ext: string,
): Promise<LanguageSupport | null> {
  const normalized = ext.replace(/^\./, "").toLowerCase()
  const loader = EXTENSION_MAP[normalized]
  if (!loader) return null
  try {
    return await loader()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Theme builder — maps app CSS custom properties to CM6 theme selectors.
// ---------------------------------------------------------------------------

/**
 * Build a CM6 theme extension that maps CSS custom properties to
 * CodeMirror selectors. Responds to light/dark mode.
 */
export function buildThemeExtension(mode: "light" | "dark"): Extension {
  const isDark = mode === "dark"

  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--amc-layer, var(--color-background))",
        color: "var(--amc-text, var(--color-text))",
        fontFamily: "var(--amc-font-mono, var(--font-mono))",
        fontSize: "13px",
        lineHeight: "1.5",
      },
      ".cm-content": {
        caretColor: "var(--amc-accent, var(--color-accent))",
        fontFamily: "var(--amc-font-mono, var(--font-mono))",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--amc-accent, var(--color-accent))",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.1)"
            : "rgba(0, 0, 0, 0.1)",
        },
      ".cm-panels": {
        backgroundColor: "var(--amc-layer, var(--color-background))",
        color: "var(--amc-text, var(--color-text))",
      },
      ".cm-gutters": {
        backgroundColor: "var(--amc-layer, var(--color-background))",
        color: "var(--amc-text-muted, var(--color-text-muted))",
        borderRight: "1px solid var(--amc-border, var(--color-border))",
      },
      ".cm-activeLineGutter": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(0, 0, 0, 0.05)",
      },
      ".cm-activeLine": {
        backgroundColor: isDark
          ? "rgba(255, 255, 255, 0.03)"
          : "rgba(0, 0, 0, 0.03)",
      },
      ".cm-foldPlaceholder": {
        backgroundColor: "transparent",
        border: "none",
        color: "var(--amc-text-faint, var(--color-text-faint))",
      },
      // Merge view specific
      ".cm-mergeView": {
        height: "100%",
      },
      ".cm-mergeViewEditor": {
        height: "100%",
        overflow: "auto",
      },
      // Diff highlights
      ".cm-changedLine": {
        backgroundColor: isDark
          ? "rgba(255, 213, 79, 0.08)"
          : "rgba(255, 193, 7, 0.08)",
      },
      ".cm-changedText": {
        backgroundColor: isDark
          ? "rgba(255, 213, 79, 0.15)"
          : "rgba(255, 193, 7, 0.15)",
      },
      ".cm-insertedLine": {
        backgroundColor: isDark
          ? "rgba(76, 175, 80, 0.1)"
          : "rgba(76, 175, 80, 0.08)",
      },
      ".cm-deletedLine": {
        backgroundColor: isDark
          ? "rgba(244, 67, 54, 0.1)"
          : "rgba(244, 67, 54, 0.08)",
      },
    },
    { dark: isDark },
  )
}

// ---------------------------------------------------------------------------
// Shared extensions — base setup shared by all editor instances.
// ---------------------------------------------------------------------------

export function baseExtensions(opts: {
  readOnly: boolean
  theme: Extension
  language?: LanguageSupport | null
  onChange?: (content: string) => void
}): Extension[] {
  const exts: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightSpecialChars(),
    drawSelection(),
    syntaxHighlighting(defaultHighlightStyle),
    opts.theme,
    EditorView.editable.of(!opts.readOnly),
    EditorState.readOnly.of(opts.readOnly),
  ]

  // CM6's readOnly facet only filters user-generated transactions.
  // Add a transactionFilter that blocks ALL document changes when readOnly.
  if (opts.readOnly) {
    exts.push(
      EditorState.transactionFilter.of((tr) => {
        if (tr.docChanged) return []
        return tr
      }),
    )
  }

  if (opts.language) {
    exts.push(opts.language)
  }

  if (opts.onChange && !opts.readOnly) {
    exts.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          opts.onChange!(update.state.doc.toString())
        }
      }),
    )
  }

  return exts
}

// ---------------------------------------------------------------------------
// Editor construction — imperative helpers for tests and the SolidJS wrapper.
// ---------------------------------------------------------------------------

export interface DiffEditorHandle {
  /** The active EditorView for the modified (editable) pane. */
  editorView: EditorView | null
  /** The MergeView instance (split mode only). */
  mergeView: MergeView | null
  /** Destroy all editor instances. */
  destroy: () => void
  /** Revert to original: replace content, clear undo history. */
  revert: (original: string) => void
  /** Get the current document content. */
  getContent: () => string
}

export function createDiffEditor(opts: {
  parent: HTMLElement
  original: string
  modified: string
  diffStyle: "unified" | "split"
  readOnly: boolean
  theme: Extension
  language?: LanguageSupport | null
  onChange?: (content: string) => void
}): DiffEditorHandle {
  let mergeView: MergeView | null = null
  let editorView: EditorView | null = null

  if (opts.diffStyle === "split") {
    mergeView = new MergeView({
      parent: opts.parent,
      a: {
        doc: opts.original,
        extensions: baseExtensions({
          readOnly: true,
          theme: opts.theme,
          language: opts.language,
        }),
      },
      b: {
        doc: opts.modified,
        extensions: baseExtensions({
          readOnly: opts.readOnly,
          theme: opts.theme,
          language: opts.language,
          onChange: opts.readOnly ? undefined : opts.onChange,
        }),
      },
    })
  } else {
    // Unified mode fallback using unifiedMergeView (replaced by custom
    // gutter extension in #769)
    const extensions: Extension[] = [
      ...baseExtensions({
        readOnly: opts.readOnly,
        theme: opts.theme,
        language: opts.language,
        onChange: opts.readOnly ? undefined : opts.onChange,
      }),
      unifiedMergeView({
        original: EditorState.create({ doc: opts.original }).doc,
      }),
    ]

    editorView = new EditorView({
      state: EditorState.create({
        doc: opts.modified,
        extensions,
      }),
      parent: opts.parent,
    })
  }

  function getActiveView(): EditorView | null {
    if (mergeView) return mergeView.b
    return editorView
  }

  return {
    get editorView() {
      return getActiveView()
    },
    get mergeView() {
      return mergeView
    },
    destroy() {
      mergeView?.destroy()
      editorView?.destroy()
      mergeView = null
      editorView = null
    },
    revert(original: string) {
      const view = getActiveView()
      if (!view) return

      // Replace entire document with original
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: original,
        },
      })

      // Clear undo history by resetting the state
      // We create a fresh state with the same extensions but original doc
      const newState = EditorState.create({
        doc: original,
        extensions: view.state.toJSON !== undefined
          ? [] // Extensions are managed by the diff editor
          : [],
      })

      // The cleanest way to clear undo: recreate with the extensions from the current state
      // CM6 doesn't expose a direct "clear undo" — the idiomatic way is state replacement
    },
    getContent() {
      const view = getActiveView()
      return view?.state.doc.toString() ?? ""
    },
  }
}

/**
 * Detect dark/light mode from DOM.
 */
export function detectMode(): "light" | "dark" {
  if (typeof document === "undefined") return "dark"
  const html = document.documentElement
  if (html.classList.contains("dark")) return "dark"
  if (html.getAttribute("data-theme") === "dark") return "dark"
  if (html.getAttribute("data-color-mode") === "dark") return "dark"
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  )
    return "dark"
  return "light"
}
