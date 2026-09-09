/**
 * session-preview-tab — Thin orchestrator for the Preview tab.
 *
 * Manages navigation state (directory path, selected file, search query)
 * and routes to either the directory view or the file view. File discovery
 * uses the `useFile()` context. Directory filtering uses `isRenderable()`
 * and `filterDirectoryEntries()` from session-ui.
 *
 * Slice 2 of #912 — rewritten from the flat session-touched-files list to
 * a Finder-style project browser.
 *
 * @module
 */

import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { preprocessMarkdown } from "@opencode-ai/session-ui/v2/markdown-utils"
import { isRenderable } from "@opencode-ai/session-ui/v2/markdown-utils"
import { filterDirectoryEntries } from "@opencode-ai/session-ui/v2/preview-nav-state"
import { searchRenderableFiles } from "@opencode-ai/session-ui/v2/preview-search-utils"
import type { PreviewFileState, DirectoryEntry } from "@opencode-ai/session-ui/v2/preview-nav-state"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { writeClipboardViaBridge } from "@/components/prompt-input/clipboard-bridge"
import FileTreeV2 from "@/components/file-tree-v2"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { PreviewDirectoryView } from "./preview-directory-view"
import { PreviewFileView } from "./preview-file-view"
import { PreviewBreadcrumb } from "./preview-breadcrumb"

// ─── Types ──────────────────────────────────────────────────────────────────

interface PreviewTabStore {
  currentPath: string
  selectedFile: string | null
  searchQuery: string
  fileStates: Record<string, PreviewFileState>
}

// Legacy entry type for no-project fallback
export interface PreviewFileEntry {
  path: string
  relativePath: string
  basename: string
  extension: ".md"
  changeType: "added" | "modified"
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SessionPreviewTab(props: {
  diffs: () => Array<{ file: string; status?: string }>
  touchedFiles?: () => Array<{ file: string; status: string }>
}) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()

  // Try to get the file context — may not be available if no project
  let file: ReturnType<typeof useFile> | null = null
  try {
    file = useFile()
  } catch {
    // No FileProvider ancestor — fall back to session-touched mode
  }

  // ─── Navigation State ────────────────────────────────────────────────────

  const [store, setStore] = createStore<PreviewTabStore>({
    currentPath: "",
    selectedFile: null,
    searchQuery: "",
    fileStates: {},
  })

  const [zoom, setZoom] = createSignal(100)
  const [dirLoading, setDirLoading] = createSignal(false)

  const zoomIn = () => setZoom((z) => Math.min(z + 10, 200))
  const zoomOut = () => setZoom((z) => Math.max(z - 10, 50))

  // ─── Has a project? ──────────────────────────────────────────────────────

  const hasProject = createMemo(() => {
    if (!file) return false
    return file.ready()
  })

  // ─── Directory entries (filtered) ────────────────────────────────────────

  const [directoryEntries, setDirectoryEntries] = createSignal<DirectoryEntry[]>([])

  // Load directory when currentPath changes (only in project mode)
  createEffect(
    on(
      () => store.currentPath,
      (path) => {
        if (!file || !hasProject()) return
        setDirLoading(true)

        // Trigger async load, then read from store
        file.tree.list(path).then(() => {
          const children = file!.tree.children(path) as DirectoryEntry[]
          setDirectoryEntries(filterDirectoryEntries(children))
          setDirLoading(false)
        }).catch(() => {
          setDirectoryEntries([])
          setDirLoading(false)
        })
      },
    ),
  )

  // ─── Navigation Actions ──────────────────────────────────────────────────

  const navigateToFolder = (path: string) => {
    setStore("currentPath", path)
    setStore("selectedFile", null)
    setStore("searchQuery", "")
  }

  const selectFile = (path: string) => {
    setStore("selectedFile", path)
    setStore("searchQuery", "")
  }

  const goBack = () => {
    if (store.searchQuery) {
      setStore("searchQuery", "")
    } else if (store.selectedFile) {
      setStore("selectedFile", null)
    } else if (store.currentPath) {
      const parts = store.currentPath.split("/")
      parts.pop()
      setStore("currentPath", parts.length ? parts.join("/") : "")
    }
  }

  const canGoBack = createMemo(() => {
    return !!store.searchQuery || !!store.selectedFile || !!store.currentPath
  })

  // ─── Recursive File Enumeration + Cache ──────────────────────────────────

  const [cachedPaths, setCachedPaths] = createSignal<string[]>([])

  async function walkTree(dir: string): Promise<string[]> {
    if (!file) return []
    try {
      await file.tree.list(dir)
    } catch {
      return []
    }
    const children = file.tree.children(dir) as DirectoryEntry[]
    const paths: string[] = []

    for (const child of children) {
      if (child.ignored) continue
      if (child.type === "file" && isRenderable(child.name)) {
        paths.push(child.path)
      } else if (child.type === "directory") {
        const subPaths = await walkTree(child.path)
        paths.push(...subPaths)
      }
    }
    return paths
  }

  const refreshCache = () => {
    if (!file || !hasProject()) return
    walkTree("").then(setCachedPaths).catch(() => setCachedPaths([]))
  }

  // Walk on mount (when project becomes ready)
  createEffect(() => {
    if (hasProject()) refreshCache()
  })

  // ─── Search ──────────────────────────────────────────────────────────────

  const searchResults = createMemo(() => {
    if (!store.searchQuery) return []
    return searchRenderableFiles(store.searchQuery, cachedPaths())
  })

  let searchInputRef: HTMLInputElement | undefined

  const handleSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setStore("searchQuery", "")
      searchInputRef?.blur()
    }
  }

  // ─── File State Management ───────────────────────────────────────────────

  const getFileState = (path: string): PreviewFileState => {
    return store.fileStates[path] ?? { mode: "preview", scrollPosition: 0, unsavedContent: null }
  }

  const setFileState = (path: string, update: Partial<PreviewFileState>) => {
    const defaults: PreviewFileState = { mode: "preview", scrollPosition: 0, unsavedContent: null }
    setStore("fileStates", path, (prev) => ({
      ...defaults,
      ...prev,
      ...update,
    }))
  }

  // ─── Header Display ─────────────────────────────────────────────────────

  const headerTitle = createMemo(() => {
    if (store.selectedFile) {
      const parts = store.selectedFile.split("/")
      return parts[parts.length - 1]
    }
    if (store.currentPath) {
      return store.currentPath
    }
    return "Preview"
  })

  // ─── Legacy Fallback (no project) ────────────────────────────────────────

  const fallbackFiles = createMemo((): PreviewFileEntry[] => {
    if (hasProject()) return []

    const seen = new Set<string>()
    const entries: PreviewFileEntry[] = []

    const touched = props.touchedFiles?.() ?? []
    const suffixToAbsolute = new Map<string, string>()
    for (const t of touched) {
      const parts = t.file.split("/")
      for (let i = 1; i < parts.length; i++) {
        suffixToAbsolute.set(parts.slice(i).join("/"), t.file)
      }
    }

    const resolveFile = (filePath: string): string => {
      if (!filePath.startsWith("~/")) return filePath
      const suffix = filePath.slice(2)
      return suffixToAbsolute.get(suffix) ?? filePath
    }

    const toEntry = (filePath: string, status: string): PreviewFileEntry | null => {
      if (!isRenderable(filePath)) return null
      const resolved = resolveFile(filePath)
      if (seen.has(resolved)) return null
      seen.add(resolved)
      const parts = resolved.split("/")
      const basename = parts[parts.length - 1]
      const relativePath = resolved.replace(/^\/Users\/[^/]+\//, "")
      return {
        path: resolved,
        relativePath,
        basename,
        extension: ".md" as const,
        changeType: (status === "added" ? "added" : "modified") as "added" | "modified",
      }
    }

    for (const t of touched) {
      const entry = toEntry(t.file, t.status)
      if (entry) entries.push(entry)
    }

    for (const d of props.diffs()) {
      const entry = toEntry(d.file, d.status === "added" ? "added" : "modified")
      if (entry) entries.push(entry)
    }

    return entries
  })

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base">
        <Show when={canGoBack()}>
          <IconButton
            icon="arrow-left"
            variant="ghost"
            class="h-6 w-6"
            onClick={goBack}
            aria-label="Back"
          />
        </Show>
        <div class="flex-1 min-w-0 text-12-regular text-text-base truncate">
          {headerTitle()}
        </div>
        {/* Zoom control */}
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
      </div>

      {/* Main content */}
      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <Show
          when={hasProject()}
          fallback={
            /* No-project fallback: session-touched renderable files */
            <FallbackFileList
              files={fallbackFiles()}
              onSelect={(path) => selectFile(path)}
              selectedFile={store.selectedFile}
              fileState={store.selectedFile ? getFileState(store.selectedFile) : undefined}
              onModeChange={(mode) => store.selectedFile && setFileState(store.selectedFile, { mode })}
              onUnsavedContent={(content) => store.selectedFile && setFileState(store.selectedFile, { unsavedContent: content })}
              zoom={zoom}
              goBack={goBack}
            />
          }
        >
          {/* Search bar (project mode only) */}
          <div class="shrink-0 px-3 py-1.5 border-b border-border-weaker-base">
            <div class="flex items-center gap-2 h-7 px-2 rounded-md bg-background-stronger">
              <Icon name="magnifying-glass" class="w-3.5 h-3.5 text-text-faint shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                class="flex-1 bg-transparent text-12-regular text-text-base outline-none placeholder:text-text-faint"
                placeholder="Search files..."
                value={store.searchQuery}
                onInput={(e) => setStore("searchQuery", e.currentTarget.value)}
                onKeyDown={handleSearchKeyDown}
              />
              <Show when={store.searchQuery}>
                <button
                  class="w-4 h-4 flex items-center justify-center text-text-weak hover:text-text-base"
                  onClick={() => setStore("searchQuery", "")}
                  aria-label="Clear search"
                >
                  <Icon name="close" class="w-3 h-3" />
                </button>
              </Show>
            </div>
          </div>

          {/* Breadcrumb (project mode, not searching, not viewing file) */}
          <Show when={!store.searchQuery && !store.selectedFile}>
            <div class="shrink-0 relative">
              <PreviewBreadcrumb
                currentPath={store.currentPath}
                onNavigate={navigateToFolder}
                onFileSelect={selectFile}
                cachedPaths={cachedPaths}
                FileTreeV2={FileTreeV2}
              />
            </div>
          </Show>

          {/* Content area */}
          <div class="flex-1 min-h-0 overflow-hidden">
            <Show
              when={!store.searchQuery}
              fallback={
                /* Search results */
                <div class="h-full overflow-auto">
                  <Show
                    when={searchResults().length > 0}
                    fallback={
                      <div class="h-full flex items-center justify-center text-12-regular text-text-weak p-4">
                        No matching files
                      </div>
                    }
                  >
                    <div class="py-1">
                      <For each={searchResults()}>
                        {(path) => {
                          const parts = path.split("/")
                          const filename = parts[parts.length - 1]
                          const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
                          return (
                            <button
                              class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-background-stronger transition-colors"
                              onClick={() => selectFile(path)}
                            >
                              <div class="flex-1 min-w-0">
                                <div class="text-12-regular text-text-base truncate">{filename}</div>
                                <Show when={dir}>
                                  <div class="text-11-regular text-text-weak truncate">{dir}</div>
                                </Show>
                              </div>
                            </button>
                          )
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              }
            >
              {/* Project mode: Finder-style browser */}
              <Show
                when={store.selectedFile}
                fallback={
                  <PreviewDirectoryView
                    entries={directoryEntries}
                    onFolderClick={navigateToFolder}
                    onFileClick={selectFile}
                    loading={dirLoading}
                  />
                }
              >
                {(filePath) => (
                  <PreviewFileView
                    filePath={filePath()}
                    fileState={getFileState(filePath())}
                    onModeChange={(mode) => setFileState(filePath(), { mode })}
                    onUnsavedContent={(content) => setFileState(filePath(), { unsavedContent: content })}
                    onSave={(path, content) => {/* handled by PreviewFileView internally */}}
                    zoom={zoom}
                  />
                )}
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}

// ─── No-Project Fallback ────────────────────────────────────────────────────

function FallbackFileList(props: {
  files: PreviewFileEntry[]
  onSelect: (path: string) => void
  selectedFile: string | null
  fileState?: PreviewFileState
  onModeChange: (mode: "preview" | "raw") => void
  onUnsavedContent: (content: string) => void
  zoom: () => number
  goBack: () => void
}) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const [fileContent, setFileContent] = createSignal("")
  const [loading, setLoading] = createSignal(false)

  // Load selected file
  createEffect(
    on(
      () => props.selectedFile,
      (path) => {
        if (!path) return
        setLoading(true)
        const fsPath = path.startsWith("~/")
          ? path.replace("~", process.env.HOME ?? "")
          : path
        sdk()
          .client.file.read({ path: fsPath })
          .then((result) => {
            const content = result.data
            if (content && content.type === "text") {
              setFileContent(content.content)
            }
          })
          .catch(() => setFileContent(""))
          .finally(() => setLoading(false))
      },
    ),
  )

  const copyToClipboard = (text: string) => {
    if (!writeClipboardViaBridge(text)) {
      void navigator.clipboard.writeText(text)
    }
  }

  return (
    <Show
      when={props.selectedFile}
      fallback={
        <div class="h-full overflow-auto">
          <Show
            when={props.files.length > 0}
            fallback={
              <div class="h-full flex items-center justify-center text-12-regular text-text-weak p-4">
                No renderable files modified in this session
              </div>
            }
          >
            <div class="py-1">
              <For each={props.files}>
                {(file) => (
                  <MenuV2.Context>
                    <MenuV2.Context.Trigger
                      as="button"
                      class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-background-stronger transition-colors"
                      onClick={() => props.onSelect(file.path)}
                    >
                      <span
                        class="shrink-0 w-4 h-4 flex items-center justify-center rounded text-10-medium"
                        classList={{
                          "bg-green-500/15 text-green-500": file.changeType === "added",
                          "bg-yellow-500/15 text-yellow-500": file.changeType === "modified",
                        }}
                      >
                        {file.changeType === "added" ? "A" : "M"}
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="text-12-regular text-text-base truncate">{file.basename}</div>
                        <div class="text-11-regular text-text-weak truncate">{file.relativePath}</div>
                      </div>
                    </MenuV2.Context.Trigger>
                    <MenuV2.Context.Portal>
                      <MenuV2.Context.Content>
                        <MenuV2.Item onSelect={() => copyToClipboard(file.basename)}>Copy filename</MenuV2.Item>
                        <MenuV2.Item onSelect={() => {
                          const fullPath = file.path.startsWith("~/")
                            ? file.path.replace("~", process.env.HOME ?? "")
                            : file.path
                          copyToClipboard(fullPath)
                        }}>Copy full path</MenuV2.Item>
                      </MenuV2.Context.Content>
                    </MenuV2.Context.Portal>
                  </MenuV2.Context>
                )}
              </For>
            </div>
          </Show>
        </div>
      }
    >
      {/* Selected file in fallback mode */}
      <div class="h-full flex flex-col overflow-hidden">
        <div class="flex-1 min-h-0 overflow-auto">
          <Show when={!loading()} fallback={<div class="p-4 text-12-regular text-text-weak">Loading...</div>}>
            <div
              class="p-4 origin-top-left [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:max-w-full [&_.katex]:text-[0.9em]"
              style={{ transform: `scale(${props.zoom() / 100})`, width: `${10000 / props.zoom()}%` }}
            >
              <Markdown text={preprocessMarkdown(fileContent())} class="text-12-regular" />
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}
