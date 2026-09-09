/**
 * preview-breadcrumb — Clickable path bar + filetree dropdown for the Preview tab.
 *
 * Each path segment is individually clickable, navigating to that directory.
 * A chevron trigger opens a FileTreeV2 (static mode) overlay showing the
 * full filtered filetree. Folder navigation in the dropdown uses a click
 * interceptor since FileTreeV2 has no onFolderClick prop.
 *
 * @module
 */

import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { parseBreadcrumbSegments } from "@opencode-ai/session-ui/v2/preview-search-utils"
import { Icon } from "@opencode-ai/ui/icon"
import type { FileNode } from "@opencode-ai/sdk/v2"

// Lazy import FileTreeV2 to avoid circular deps — the component is in the same package
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type FileTreeV2Type = typeof import("@/components/file-tree-v2").default

export function PreviewBreadcrumb(props: {
  currentPath: string
  onNavigate: (path: string) => void
  onFileSelect: (path: string) => void
  cachedPaths: () => readonly string[]
  FileTreeV2: FileTreeV2Type
}) {
  const [dropdownOpen, setDropdownOpen] = createSignal(false)
  let dropdownRef: HTMLDivElement | undefined
  let triggerRef: HTMLButtonElement | undefined

  const segments = () => parseBreadcrumbSegments(props.currentPath)

  // Close dropdown on outside click
  createEffect(() => {
    if (!dropdownOpen()) return
    const onPointerDown = (e: PointerEvent) => {
      if (triggerRef?.contains(e.target as Node)) return
      if (dropdownRef?.contains(e.target as Node)) return
      setDropdownOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    onCleanup(() => document.removeEventListener("pointerdown", onPointerDown, true))
  })

  // Click interceptor for folder navigation in the dropdown
  const handleDropdownClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest?.('[data-slot="file-tree-v2-row"]')
    if (!target) return

    // Check if this is a directory row (has a chevron child)
    const chevron = target.querySelector('[data-slot="file-tree-v2-chevron"]')
    if (!chevron) return // It's a file row, let FileTreeV2 handle it

    // It's a directory row — intercept, navigate, close
    const path = target.getAttribute("data-path")
    if (path !== null) {
      e.stopPropagation()
      e.preventDefault()
      props.onNavigate(path)
      setDropdownOpen(false)
    }
  }

  const handleFileClick = (file: FileNode) => {
    props.onFileSelect(file.path)
    setDropdownOpen(false)
  }

  return (
    <div class="flex items-center gap-0.5 px-3 py-1 min-w-0 border-b border-border-weaker-base">
      {/* Breadcrumb segments */}
      <div class="flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden">
        <For each={segments()}>
          {(segment, index) => (
            <>
              <Show when={index() > 0}>
                <span class="text-text-faint text-11-regular shrink-0">/</span>
              </Show>
              <button
                class="text-12-regular text-text-muted hover:text-text-base truncate shrink-0 max-w-[150px] transition-colors"
                classList={{
                  "text-text-base font-medium": index() === segments().length - 1,
                }}
                onClick={() => props.onNavigate(segment.path)}
                title={segment.path || "Root"}
              >
                {segment.label}
              </button>
            </>
          )}
        </For>
      </div>

      {/* Dropdown trigger */}
      <button
        ref={triggerRef}
        class="shrink-0 w-5 h-5 flex items-center justify-center text-text-weak hover:text-text-base transition-colors rounded hover:bg-background-stronger"
        onClick={() => setDropdownOpen(!dropdownOpen())}
        aria-label="Browse files"
      >
        <Icon name="chevron-down" class="w-3 h-3" />
      </button>

      {/* Dropdown overlay */}
      <Show when={dropdownOpen()}>
        <div
          ref={dropdownRef}
          class="absolute top-full left-0 right-0 z-50 mt-0.5 mx-2 max-h-[300px] overflow-auto rounded-md border border-border-base bg-background-base shadow-lg"
          onClick={handleDropdownClick}
        >
          <div class="py-1">
            <props.FileTreeV2
              allowed={props.cachedPaths()}
              onFileClick={handleFileClick}
            />
          </div>
        </div>
      </Show>
    </div>
  )
}
