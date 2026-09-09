/**
 * session-preview-tab — Companion file viewer for the Preview tab.
 *
 * Renders the file at `previewFile()` using PreviewFileView. When no file is
 * selected, shows a placeholder. File discovery, navigation, search, and the
 * Finder directory view have been removed (#933) — the Preview tab is now
 * driven externally by sidebar clicks and chat file-pill routing.
 *
 * Per-file state (mode, scroll position, unsaved content) persists across
 * file switches via a local store.
 *
 * @module
 */

import { createMemo, createSignal, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { PreviewFileState } from "@opencode-ai/session-ui/v2/preview-nav-state"
import { Icon } from "@opencode-ai/ui/icon"
import { PreviewFileView } from "./preview-file-view"
import type { Accessor } from "solid-js"

// ─── Types ──────────────────────────────────────────────────────────────────

interface PreviewFileStates {
  [path: string]: PreviewFileState
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SessionPreviewTab(props: {
  previewFile: Accessor<string | null>
}) {
  // ─── Per-file State ──────────────────────────────────────────────────────

  const [fileStates, setFileStates] = createStore<PreviewFileStates>({})

  const [zoom, setZoom] = createSignal(100)

  const zoomIn = () => setZoom((z) => Math.min(z + 10, 200))
  const zoomOut = () => setZoom((z) => Math.max(z - 10, 50))

  const getFileState = (path: string): PreviewFileState => {
    return fileStates[path] ?? { mode: "preview", scrollPosition: 0, unsavedContent: null }
  }

  const setFileState = (path: string, update: Partial<PreviewFileState>) => {
    const defaults: PreviewFileState = { mode: "preview", scrollPosition: 0, unsavedContent: null }
    setFileStates(path, (prev) => ({
      ...defaults,
      ...prev,
      ...update,
    }))
  }

  // ─── Header Display ─────────────────────────────────────────────────────

  const headerTitle = createMemo(() => {
    const file = props.previewFile()
    if (file) {
      const parts = file.split("/")
      return parts[parts.length - 1]
    }
    return "Preview"
  })

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base">
        <div class="flex-1 min-w-0 text-12-regular text-text-base truncate">
          {headerTitle()}
        </div>
        {/* Zoom control — only shown when a file is selected */}
        <Show when={props.previewFile()}>
          <div class="shrink-0 flex items-center h-7 rounded-md border border-border-base overflow-hidden">
            <input
              type="text"
              class="w-11 h-full text-center text-12-regular text-text-base bg-transparent outline-none"
              value={`${zoom()}%`}
              onInput={(e) => {
                const val = parseInt(e.currentTarget.value)
                if (!isNaN(val) && val >= 50 && val <= 200) setZoom(val)
              }}
              onBlur={(e) => {
                e.currentTarget.value = `${zoom()}%`
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur()
                }
              }}
            />
            <div class="flex items-center border-l border-border-base">
              <button
                class="flex items-center justify-center w-5 h-full text-text-weak hover:text-text-base hover:bg-background-stronger transition-colors"
                onClick={zoomOut}
                aria-label="Zoom out"
              >
                <span class="text-12-medium leading-none">−</span>
              </button>
              <button
                class="flex items-center justify-center w-5 h-full text-text-weak hover:text-text-base hover:bg-background-stronger transition-colors -ml-0.5"
                onClick={zoomIn}
                aria-label="Zoom in"
              >
                <span class="text-12-medium leading-none">+</span>
              </button>
            </div>
          </div>
        </Show>
      </div>

      {/* Main content */}
      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <Show
          when={props.previewFile()}
          fallback={
            /* Empty state — no file selected */
            <div class="h-full flex flex-col items-center justify-center gap-3 text-text-weak p-6">
              <Icon name="open-file" class="w-8 h-8 text-text-faint" />
              <p class="text-13-regular text-center">Select a file from the sidebar</p>
            </div>
          }
        >
          {(filePath) => (
            <PreviewFileView
              filePath={filePath()}
              fileState={getFileState(filePath())}
              onModeChange={(mode) => setFileState(filePath(), { mode })}
              onUnsavedContent={(content) => setFileState(filePath(), { unsavedContent: content })}
              onSave={() => {/* handled by PreviewFileView internally */}}
              zoom={zoom}
            />
          )}
        </Show>
      </div>
    </div>
  )
}
