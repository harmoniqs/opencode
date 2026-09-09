/**
 * preview-nav-state — Pure navigation state machine for the Preview tab.
 *
 * No SolidJS, no DOM — just state transitions and directory filtering logic.
 * Consumed by session-preview-tab.tsx (orchestrator) as a SolidJS store.
 * Testable independently.
 *
 * @module
 */

import { isRenderable } from "./markdown-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewFileState {
  mode: "preview" | "edit"
  scrollPosition: number
  unsavedContent: string | null
}

export interface PreviewTabState {
  currentPath: string
  selectedFile: string | null
  searchQuery: string
  fileStates: Record<string, PreviewFileState>
}

/** Matches the SDK's FileNode shape — kept here to avoid importing the SDK. */
export interface DirectoryEntry {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

// ---------------------------------------------------------------------------
// Default file state
// ---------------------------------------------------------------------------

const DEFAULT_FILE_STATE: PreviewFileState = {
  mode: "preview",
  scrollPosition: 0,
  unsavedContent: null,
}

// ---------------------------------------------------------------------------
// Navigation state machine (plain object, no reactivity)
// ---------------------------------------------------------------------------

export function createPreviewNavState() {
  let state: PreviewTabState = {
    currentPath: "",
    selectedFile: null,
    searchQuery: "",
    fileStates: {},
  }

  return {
    get: () => state,

    navigateToFolder(path: string) {
      state = { ...state, currentPath: path, selectedFile: null }
    },

    selectFile(path: string) {
      state = { ...state, selectedFile: path }
    },

    goBack() {
      if (state.selectedFile) {
        // From file view → back to directory
        state = { ...state, selectedFile: null }
      } else if (state.currentPath) {
        // From subdirectory → parent
        const parts = state.currentPath.split("/")
        parts.pop()
        state = { ...state, currentPath: parts.join("") ? parts.join("/") : "" }
      }
      // At root with no file → no-op
    },

    setFileState(path: string, fileState: PreviewFileState) {
      state = {
        ...state,
        fileStates: { ...state.fileStates, [path]: fileState },
      }
    },

    getFileState(path: string): PreviewFileState {
      return state.fileStates[path] ?? { ...DEFAULT_FILE_STATE }
    },

    setSearchQuery(query: string) {
      state = { ...state, searchQuery: query }
    },
  }
}

// ---------------------------------------------------------------------------
// Directory filtering — pure function for testability
// ---------------------------------------------------------------------------

/**
 * Filter a list of directory entries to renderable files and non-ignored
 * directories. Sorts directories first, then files, alphabetically.
 *
 * Directories are shown optimistically (they may have renderable descendants
 * we haven't loaded yet). The full-tree filtering for the dropdown/search
 * comes in Slice 3.
 */
export function filterDirectoryEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  const filtered = entries.filter((entry) => {
    if (entry.ignored) return false
    if (entry.type === "directory") return true
    return isRenderable(entry.name)
  })

  // Sort: directories first, then files, alphabetically within each group
  return filtered.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}
