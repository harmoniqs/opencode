/**
 * session-preview-tab — Companion file viewer for the Preview tab.
 *
 * Renders the file at `previewFile()` using PreviewFileView. When no file is
 * selected, shows a placeholder. File discovery, navigation, search, and the
 * Finder directory view have been removed (#933) — the Preview tab is now
 * driven externally by sidebar clicks and chat file-pill routing.
 *
 * Each live renderer host retains its own mode, scroll position, and draft
 * through inner and outer tab switches.
 *
 * @module
 */

import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { PreviewFileView } from "./preview-file-view"
import type { Accessor } from "solid-js"

// ─── Main Component ─────────────────────────────────────────────────────────

export function SessionPreviewTab(props: {
  previewFile: Accessor<string | null>
}) {
  // ─── Workspace state ─────────────────────────────────────────────────────

  const [dirtyPaths, setDirtyPaths] = createStore<Record<string, boolean>>({})
  const [saveRequests, setSaveRequests] = createStore<Record<string, number>>({})

  const [zoom, setZoom] = createSignal(100)
  const [openedPaths, setOpenedPaths] = createSignal<string[]>([])
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null)
  const [capacityMessage, setCapacityMessage] = createSignal<string | null>(null)
  const [closingPath, setClosingPath] = createSignal<string | null>(null)

  const openPath = (path: string) => {
    if (openedPaths().includes(path)) {
      setSelectedPath(path)
      setCapacityMessage(null)
      return
    }
    if (openedPaths().length === 8) {
      setCapacityMessage("Close an existing Preview tab before opening another file.")
      return
    }
    setOpenedPaths((paths) => [...paths, path])
    setSelectedPath(path)
    setCapacityMessage(null)
  }

  createEffect(
    on(
      () => props.previewFile(),
      (path) => {
        if (!path) return
        openPath(path)
      },
    ),
  )

  onMount(() => {
    const handlePreviewFile = (event: MessageEvent) => {
      const data = event.data as { source?: string; kind?: string; path?: string } | undefined
      if (data?.source !== "amicode" || data.kind !== "preview-file" || !data.path) return
      openPath(data.path)
    }
    window.addEventListener("message", handlePreviewFile)
    onCleanup(() => window.removeEventListener("message", handlePreviewFile))
  })

  const zoomIn = () => setZoom((z) => Math.min(z + 10, 500))
  const zoomOut = () => setZoom((z) => Math.max(z - 10, 50))
  const onZoomChange = (value: number) => setZoom(Math.round(Math.min(Math.max(value, 50), 500)))

  const removePath = (path: string) => {
    setOpenedPaths((paths) => {
      const index = paths.indexOf(path)
      if (index === -1) return paths
      const next = paths.filter((item) => item !== path)
      if (selectedPath() === path) setSelectedPath(next[index - 1] ?? next[index] ?? null)
      return next
    })
    setDirtyPaths(path, false)
  }

  const closePath = (path: string) => {
    if (dirtyPaths[path]) {
      setClosingPath(path)
      return
    }
    removePath(path)
  }

  // ─── Header Display ─────────────────────────────────────────────────────

  const headerTitle = createMemo(() => {
    const file = selectedPath()
    if (file) {
      const parts = file.split("/")
      return parts[parts.length - 1]
    }
    return "Preview"
  })

  // ─── Render ─────────────────────────────────────────────────────────────

  // Dirty state: true when the current file has unsaved edits
  const isUnsaved = createMemo(() => {
    const file = selectedPath()
    if (!file) return false
    return dirtyPaths[file] ?? false
  })

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Header: filename + unsaved dot */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base">
        <div class="flex-1 min-w-0 flex items-center gap-1.5">
          <span class="text-12-regular text-text-base truncate">
            {headerTitle()}
          </span>
          <Show when={isUnsaved()}>
            <div class="w-2 h-2 rounded-full bg-v2-text-text-faint shrink-0" aria-label="Unsaved changes" />
          </Show>
        </div>
      </div>

      <Show when={openedPaths().length > 0}>
        <div class="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-border-weaker-base" role="tablist" aria-label="Open previews">
          <For each={openedPaths()}>
            {(path) => (
              <div
                class="min-w-0 max-w-40 flex items-center rounded-md text-text-weak hover:text-text-base hover:bg-background-stronger"
                classList={{ "text-text-base bg-background-stronger": selectedPath() === path }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedPath() === path}
                  class="min-w-0 flex-1 px-2 py-1 text-12-regular truncate focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
                  onClick={() => setSelectedPath(path)}
                >
                  {path.split("/").pop()}
                </button>
                <button
                  type="button"
                  class="shrink-0 px-1 py-1 text-12-regular text-text-weak hover:text-text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
                  aria-label={`Close ${path.split("/").pop()}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    closePath(path)
                  }}
                >
                  <Icon name="close-small" size="small" />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={capacityMessage()}>
        <div class="shrink-0 px-3 py-2 text-12-regular text-text-weak" role="alert">
          {capacityMessage()}
        </div>
      </Show>

      <Show when={closingPath()}>
        {(path) => (
          <div class="shrink-0 mx-3 mb-3 p-3 border border-border-base rounded-md bg-background-base" role="dialog" aria-modal="true" aria-label="Unsaved changes">
            <p class="text-12-regular text-text-base">Save changes to {path().split("/").pop()} before closing?</p>
            <div class="mt-2 flex justify-end gap-2">
              <button type="button" class="px-2 py-1 text-12-regular text-text-weak hover:text-text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus" onClick={() => setClosingPath(null)}>
                Cancel
              </button>
              <button
                type="button"
                class="px-2 py-1 text-12-regular text-text-weak hover:text-text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
                onClick={() => {
                  removePath(path())
                  setClosingPath(null)
                }}
              >
                Discard
              </button>
              <button
                type="button"
                class="px-2 py-1 text-12-regular text-text-base border border-border-strong rounded-md hover:bg-background-stronger focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
                onClick={() => setSaveRequests(path(), (request) => (request ?? 0) + 1)}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </Show>

      {/* Main content */}
      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <Show when={openedPaths().length === 0}>
          {/* Empty state — no file selected */}
          <div class="h-full flex flex-col items-center justify-center gap-3 text-text-weak p-6">
            <Icon name="open-file" class="w-8 h-8 text-v2-text-text-faint" />
            <p class="text-13-regular text-center">Select a file from the sidebar</p>
          </div>
        </Show>
        <For each={openedPaths()}>
          {(filePath) => (
            <div
              data-preview-host={filePath}
              class="h-full min-h-0"
              classList={{ hidden: selectedPath() !== filePath }}
              aria-hidden={selectedPath() !== filePath}
              inert={selectedPath() !== filePath}
            >
              <PreviewFileView
                filePath={filePath}
                onDirtyChange={(dirty) => setDirtyPaths(filePath, dirty)}
                saveRequest={() => saveRequests[filePath] ?? 0}
                onSaveComplete={() => {
                  removePath(filePath)
                  setClosingPath(null)
                }}
                zoom={zoom}
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                onZoomChange={onZoomChange}
              />
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
