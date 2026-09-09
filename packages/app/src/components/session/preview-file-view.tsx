/**
 * preview-file-view — Routes file rendering by type for the Preview tab.
 *
 * Markdown files get Preview/Edit toggle (CodeMirror 6 via preview-editor.tsx).
 * Text files open directly in edit mode. Images render as <img> (data URI),
 * PDFs as <embed> (blob URL). Binary, error, and oversize files get
 * placeholders.
 *
 * #925: "text" replaces "unsupported" — all non-renderable files open in
 * the CM6 editor. Async fileType signal detects binary/error/oversize after
 * file.read().
 *
 * #934: images and PDFs render via data URI / blob URL from the SDK binary
 * response. Save dot moved to parent (SessionPreviewTab); zoom controls
 * moved here to share Bar 2 with the edit/preview toggle.
 *
 * @module
 */

import { createEffect, createMemo, createSignal, on, onCleanup, Show, Switch, Match } from "solid-js"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { SegmentedControlV2, SegmentedControlItemV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { preprocessMarkdown } from "@opencode-ai/session-ui/v2/markdown-utils"
import { RENDERABLE_EXTENSIONS } from "@opencode-ai/session-ui/v2/markdown-utils"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import type { PreviewFileState } from "@opencode-ai/session-ui/v2/preview-nav-state"
import { PreviewEditor } from "@opencode-ai/session-ui/v2/preview-editor"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot > 0 ? path.slice(dot).toLowerCase() : ""
}

type FileCategory = "markdown" | "image" | "pdf" | "text"

/**
 * Sync, extension-based file classification (phase 1).
 * Extensionless files (Makefile, Dockerfile, LICENSE) → "text".
 */
function getFileCategory(path: string): FileCategory {
  const ext = getExtension(path)
  if (!ext) return "text" // extensionless → plain text
  if ((RENDERABLE_EXTENSIONS.markdown as readonly string[]).includes(ext)) return "markdown"
  if ((RENDERABLE_EXTENSIONS.images as readonly string[]).includes(ext)) return "image"
  if ((RENDERABLE_EXTENSIONS.pdf as readonly string[]).includes(ext)) return "pdf"
  return "text"
}

/** Async file-type classification after file.read() (phase 2). */
type FileType = "text" | "binary" | "error" | "too-large" | null

const MAX_FILE_SIZE = 1_000_000

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewFileView(props: {
  filePath: string
  fileState: PreviewFileState
  onModeChange: (mode: "preview" | "edit") => void
  onUnsavedContent: (content: string) => void
  onSave: (path: string, content: string) => void
  onSaveStatusChange: (status: "idle" | "saving" | "saved") => void
  zoom: () => number
  zoomIn: () => void
  zoomOut: () => void
}) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const [fileContent, setFileContent] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [fileType, setFileType] = createSignal<FileType>(null)

  // Binary data for image/PDF rendering (data URI / blob URL)
  const [binaryData, setBinaryData] = createSignal<{ base64: string; mime: string } | null>(null)

  // ─── File loading ──────────────────────────────────────────────────────

  const category = () => getFileCategory(props.filePath)

  createEffect(
    on(
      () => props.filePath,
      (path) => {
        setLoading(true)
        setFileType(null)
        setBinaryData(null)
        sdk()
          .client.file.read({ path })
          .then((result) => {
            const content = result.data
            if (!content) {
              setFileType("error")
              setFileContent("")
              return
            }
            if (content.type !== "text") {
              // Image/PDF binaries are renderable — store the base64 data and
              // let the category-based renderer handle them.
              const cat = getFileCategory(props.filePath)
              if ((cat === "image" || cat === "pdf") && (content as any).encoding === "base64") {
                setBinaryData({
                  base64: content.content,
                  mime: (content as any).mimeType ?? "application/octet-stream",
                })
                setFileType("text") // pass-through: let category branch render
                return
              }
              setFileType("binary")
              setFileContent("")
              return
            }
            const size = (content as any).length ?? content.content.length
            if (size > MAX_FILE_SIZE) {
              setFileType("too-large")
              setFileContent("")
              return
            }
            setFileType("text")
            setFileContent(content.content)
          })
          .catch(() => {
            setFileType("error")
            setFileContent("")
          })
          .finally(() => {
            setLoading(false)
          })
      },
    ),
  )

  // ─── Binary URLs ───────────────────────────────────────────────────────

  // Data URI for images (small enough for inline base64)
  const imageDataUrl = createMemo(() => {
    const data = binaryData()
    if (!data || category() !== "image") return ""
    return `data:${data.mime};base64,${data.base64}`
  })

  // Blob URL for PDFs (embed/object needs a real URL, not a data URI)
  const [pdfBlobUrl, setPdfBlobUrl] = createSignal("")

  createEffect(
    on(binaryData, (data) => {
      // Revoke previous blob URL
      const prev = pdfBlobUrl()
      if (prev) URL.revokeObjectURL(prev)
      setPdfBlobUrl("")

      if (!data || category() !== "pdf") return

      // Decode base64 → Uint8Array → Blob → object URL
      const raw = atob(data.base64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      const blob = new Blob([bytes], { type: data.mime })
      setPdfBlobUrl(URL.createObjectURL(blob))
    }),
  )

  onCleanup(() => {
    const url = pdfBlobUrl()
    if (url) URL.revokeObjectURL(url)
  })

  // ─── Save logic ────────────────────────────────────────────────────────

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const [saveStatus, setSaveStatus] = createSignal<"idle" | "saving" | "saved">("idle")
  let savedTimer: ReturnType<typeof setTimeout> | undefined

  // Surface save status to parent (for the header dot)
  createEffect(() => {
    props.onSaveStatusChange(saveStatus())
  })

  const saveFile = (path: string, content: string) => {
    const baseUrl = serverSDK().url
    if (!baseUrl) return

    setSaveStatus("saving")
    fetch(new URL("/file/write", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    })
      .then(() => {
        setSaveStatus("saved")
        if (savedTimer) clearTimeout(savedTimer)
        savedTimer = setTimeout(() => setSaveStatus("idle"), 2000)
      })
      .catch(() => {
        setSaveStatus("idle")
      })
  }

  const debouncedSave = (path: string, content: string) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveFile(path, content), 1000)
  }

  const handleEdit = (content: string) => {
    props.onUnsavedContent(content)
    setFileContent(content)
    debouncedSave(props.filePath, content)
  }

  const handleImmediateSave = () => {
    if (props.fileState.unsavedContent !== null) {
      if (saveTimer) clearTimeout(saveTimer)
      saveFile(props.filePath, props.fileState.unsavedContent)
    }
  }

  // Flush pending save on navigation away
  onCleanup(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      if (props.fileState.unsavedContent !== null) {
        const baseUrl = serverSDK().url
        if (baseUrl) {
          fetch(new URL("/file/write", baseUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: props.filePath, content: props.fileState.unsavedContent }),
          }).catch(() => {})
        }
      }
    }
    if (savedTimer) clearTimeout(savedTimer)
  })

  // ─── Render ────────────────────────────────────────────────────────────

  const showModeToggle = () => category() === "markdown"

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Action bar: mode toggle + zoom controls */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-1 border-b border-border-weaker-base">
        <div class="flex-1" />
        <Show when={showModeToggle()}>
          <SegmentedControlV2
            value={props.fileState.mode}
            onChange={(value) => {
              if (value === "preview" || value === "edit") {
                props.onModeChange(value)
              }
            }}
            class="!w-auto"
            aria-label="View mode"
          >
            <TooltipV2 openDelay={400} value="Preview">
              <SegmentedControlItemV2 value="preview" aria-label="Preview" class="!flex-none !px-2">
                <Icon name="eye" size="small" />
              </SegmentedControlItemV2>
            </TooltipV2>
            <TooltipV2 openDelay={400} value="Edit">
              <SegmentedControlItemV2 value="edit" aria-label="Edit" class="!flex-none !px-2">
                <Icon name="edit" size="small" />
              </SegmentedControlItemV2>
            </TooltipV2>
          </SegmentedControlV2>
        </Show>
        {/* Zoom controls — always visible when a file is loaded */}
        <div class="shrink-0 flex items-center h-7 rounded-md border border-border-base overflow-hidden">
          <input
            type="text"
            class="w-11 h-full text-center text-12-regular text-text-base bg-transparent outline-none"
            value={`${props.zoom()}%`}
            onInput={(e) => {
              const val = parseInt(e.currentTarget.value)
              if (!isNaN(val) && val >= 50 && val <= 200) {
                // Direct set not available — zoom is owned by parent.
                // Manual input is display-only; use +/- buttons to change.
              }
            }}
            onBlur={(e) => {
              e.currentTarget.value = `${props.zoom()}%`
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur()
              }
            }}
            readOnly
          />
          <div class="flex items-center border-l border-border-base">
            <button
              class="flex items-center justify-center w-5 h-full text-text-weak hover:text-text-base hover:bg-background-stronger transition-colors"
              onClick={() => props.zoomOut()}
              aria-label="Zoom out"
            >
              <span class="text-12-medium leading-none">−</span>
            </button>
            <button
              class="flex items-center justify-center w-5 h-full text-text-weak hover:text-text-base hover:bg-background-stronger transition-colors -ml-0.5"
              onClick={() => props.zoomIn()}
              aria-label="Zoom in"
            >
              <span class="text-12-medium leading-none">+</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 min-h-0 overflow-auto">
        <Show when={!loading()} fallback={<div class="p-4 text-12-regular text-text-weak">Loading...</div>}>
          <Switch>
            <Match when={fileType() === "error"}>
              <div class="h-full flex items-center justify-center text-12-regular text-text-weak p-4">
                Could not read file
              </div>
            </Match>

            {/* Renderable binaries: image/PDF use data URI or blob URL */}
            <Match when={category() === "image" && (binaryData() || fileType() === "text")}>
              <div class="min-h-full flex items-center justify-center p-4">
                <img
                  src={imageDataUrl()}
                  alt={props.filePath.split("/").pop() ?? ""}
                  class="object-contain max-w-none shrink-0"
                  style={{ width: `${props.zoom()}%`, "image-rendering": "auto" }}
                />
              </div>
            </Match>

            <Match when={category() === "pdf" && (binaryData() || fileType() === "text")}>
              <div
                class="origin-top-left"
                style={{
                  transform: `scale(${props.zoom() / 100})`,
                  width: `${10000 / props.zoom()}%`,
                  height: `${10000 / props.zoom()}%`,
                }}
              >
                <iframe
                  src={pdfBlobUrl()}
                  class="w-full h-full border-0"
                  title={props.filePath.split("/").pop() ?? "PDF"}
                />
              </div>
            </Match>

            <Match when={fileType() === "binary"}>
              <div class="h-full flex items-center justify-center text-12-regular text-text-weak p-4">
                Binary file — cannot preview
              </div>
            </Match>
            <Match when={fileType() === "too-large"}>
              <div class="h-full flex items-center justify-center text-12-regular text-text-weak p-4">
                File too large to preview in this tab
              </div>
            </Match>

            {/* Text-based rendering by category */}
            <Match when={category() === "markdown"}>
              <Show
                when={props.fileState.mode === "preview"}
                fallback={
                  <PreviewEditor
                    content={fileContent()}
                    filePath={props.filePath}
                    onChange={handleEdit}
                    onSave={handleImmediateSave}
                  />
                }
              >
                <div
                  class="p-4 origin-top-left [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:max-w-full [&_.katex]:text-[0.9em]"
                  style={{ transform: `scale(${props.zoom() / 100})`, width: `${10000 / props.zoom()}%` }}
                >
                  <Markdown text={preprocessMarkdown(fileContent())} class="text-12-regular" />
                </div>
              </Show>
            </Match>

            {/* Text files: open directly in edit mode */}
            <Match when={category() === "text"}>
              <PreviewEditor
                content={fileContent()}
                filePath={props.filePath}
                onChange={handleEdit}
                onSave={handleImmediateSave}
              />
            </Match>
          </Switch>
        </Show>
      </div>
    </div>
  )
}
