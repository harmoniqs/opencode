/**
 * EditableDiffView — SolidJS component wrapping CM6 split/unified diff editor.
 *
 * Auto-exported as @opencode-ai/session-ui/v2/editable-diff-view via the
 * wildcard export in session-ui/package.json.
 *
 * @module
 */

import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js"
import type { LanguageSupport } from "@codemirror/language"
import {
  loadLanguage,
  buildThemeExtension,
  createDiffEditor,
  detectMode,
  type DiffEditorHandle,
} from "./editable-diff-view-core"

// Re-export core utilities for external consumers
export {
  loadLanguage,
  buildThemeExtension,
  createDiffEditor,
  detectMode,
  type DiffEditorHandle,
} from "./editable-diff-view-core"

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export type EditableDiffViewProps = {
  /** The original (left/before) content. */
  original: string
  /** The modified (right/after) content — this side is editable. */
  modified: string
  /** File extension (without dot) for syntax highlighting, e.g. "ts", "py". */
  language: string
  /** "split" for side-by-side, "unified" for interleaved. */
  diffStyle: "unified" | "split"
  /** Disable editing (both panes read-only). */
  readOnly: boolean
  /** Called on every edit with the full editor content. */
  onChange: (content: string) => void
  /**
   * Called when the user reverts — the component replaces the document with
   * `original` and clears the undo history before invoking this callback.
   */
  onRevert: () => void
  /** Optional ref callback for the container element. */
  ref?: (el: HTMLElement) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditableDiffView(props: EditableDiffViewProps): JSX.Element {
  let containerRef!: HTMLDivElement
  let handle: DiffEditorHandle | null = null
  const [langSupport, setLangSupport] = createSignal<LanguageSupport | null>(
    null,
  )

  // Load language support asynchronously
  onMount(async () => {
    const lang = await loadLanguage(props.language)
    setLangSupport(lang)
  })

  // Create/recreate editors when key props change
  createEffect(() => {
    const original = props.original
    const modified = props.modified
    const diffStyle = props.diffStyle
    const readOnly = props.readOnly
    const lang = langSupport()
    const mode = detectMode()
    const theme = buildThemeExtension(mode)
    const onChange = props.onChange

    // Tear down previous
    if (handle) {
      handle.destroy()
      handle = null
    }

    if (!containerRef) return
    containerRef.innerHTML = ""

    handle = createDiffEditor({
      parent: containerRef,
      original,
      modified,
      diffStyle,
      readOnly,
      theme,
      language: lang,
      onChange: readOnly ? undefined : onChange,
    })
  })

  onCleanup(() => {
    if (handle) {
      handle.destroy()
      handle = null
    }
  })

  return (
    <div
      ref={(el) => {
        containerRef = el
        props.ref?.(el)
      }}
      class="editable-diff-view"
      data-diff-style={props.diffStyle}
      data-read-only={props.readOnly ? "" : undefined}
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        position: "relative",
      }}
    />
  ) as JSX.Element
}
