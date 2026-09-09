/**
 * preview-directory-view — Finder-style directory listing for the Preview tab.
 *
 * Renders folder rows and file rows for a single directory level.
 * Clicking a folder navigates into it; clicking a file selects it.
 * Only renderable files appear (filtered via filterDirectoryEntries).
 *
 * @module
 */

import { createEffect, createMemo, For, on, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import type { DirectoryEntry } from "@opencode-ai/session-ui/v2/preview-nav-state"

export function PreviewDirectoryView(props: {
  entries: () => DirectoryEntry[]
  onFolderClick: (path: string) => void
  onFileClick: (path: string) => void
  loading?: () => boolean
}) {
  const entries = createMemo(() => props.entries())

  return (
    <div class="h-full overflow-auto">
      <Show
        when={!props.loading?.()}
        fallback={
          <div class="flex items-center justify-center p-4 text-12-regular text-text-weak">
            Loading...
          </div>
        }
      >
        <Show
          when={entries().length > 0}
          fallback={
            <div class="h-full flex items-center justify-center text-12-regular text-text-weak p-4">
              No renderable files in this directory
            </div>
          }
        >
          <div class="py-1">
            <For each={entries()}>
              {(entry) => (
                <button
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-background-stronger transition-colors"
                  onClick={() => {
                    if (entry.type === "directory") {
                      props.onFolderClick(entry.path)
                    } else {
                      props.onFileClick(entry.path)
                    }
                  }}
                >
                  <Show
                    when={entry.type === "directory"}
                    fallback={
                      <FileIcon node={{ path: entry.name, type: "file" }} />
                    }
                  >
                    <Icon name="folder" class="w-4 h-4 text-text-weak shrink-0" />
                  </Show>
                  <span class="flex-1 min-w-0 text-12-regular text-text-base truncate">
                    {entry.name}
                  </span>
                  <Show when={entry.type === "directory"}>
                    <Icon name="chevron-right" class="w-3 h-3 text-text-faint shrink-0" />
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
