/**
 * preview-file-view — Routes file rendering by type for the Preview tab.
 *
 * Slice 2: handles markdown files only (Preview via <Markdown>, edit via
 * the existing textarea RawEditor as placeholder).
 * Slice 4: replaces RawEditor with CodeMirror.
 * Slice 5: adds image and PDF rendering branches.
 *
 * @module
 */

import { createEffect, createSignal, on, onCleanup, Show } from "solid-js"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { SegmentedControlV2, SegmentedControlItemV2 } from "@opencode-ai/ui/v2/segmented-control-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { Icon } from "@opencode-ai/ui/icon"
import { preprocessMarkdown } from "@opencode-ai/session-ui/v2/markdown-utils"
import { RENDERABLE_EXTENSIONS } from "@opencode-ai/session-ui/v2/markdown-utils"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import type { PreviewFileState } from "@opencode-ai/session-ui/v2/preview-nav-state"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot > 0 ? path.slice(dot).toLowerCase() : ""
}

function isMarkdown(path: string): boolean {
  const ext = getExtension(path)
  return (RENDERABLE_EXTENSIONS.markdown as readonly string[]).includes(ext)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreviewFileView(props: {
  filePath: string
  fileState: PreviewFileState
  onModeChange: (mode: "preview" | "raw") => void
  onUnsavedContent: (content: string) => void
  onSave: (path: string, content: string) => void
  zoom: () => number
}) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const [fileContent, setFileContent] = createSignal("")
  const [loading, setLoading] = createSignal(true)

  // ─── File loading ──────────────────────────────────────────────────────

  createEffect(
    on(
      () => props.filePath,
      (path) => {
        setLoading(true)
        sdk()
          .client.file.read({ path })
          .then((result) => {
            const content = result.data
            if (content && content.type === "text") {
              setFileContent(content.content)
            }
          })
          .catch(() => {
            setFileContent("")
          })
          .finally(() => {
            setLoading(false)
          })
      },
    ),
  )

  // ─── Save logic ────────────────────────────────────────────────────────

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const [saveStatus, setSaveStatus] = createSignal<"idle" | "saving" | "saved">("idle")
  let savedTimer: ReturnType<typeof setTimeout> | undefined

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

  const handleRawEdit = (content: string) => {
    props.onUnsavedContent(content)
    setFileContent(content)
    debouncedSave(props.filePath, content)
  }

  const immediateSave = () => {
    if (props.fileState.unsavedContent !== null) {
      if (saveTimer) clearTimeout(saveTimer)
      saveFile(props.filePath, props.fileState.unsavedContent)
      props.onUnsavedContent(null as any)
    }
  }

  // Flush pending save on navigation away
  onCleanup(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      // Flush the pending save
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

  const showModeToggle = () => isMarkdown(props.filePath)

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Sub-header: save status + mode toggle + zoom */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-1 border-b border-border-weaker-base">
        <div class="flex-1" />
        <Show when={saveStatus() !== "idle"}>
          <span
            class="text-11-medium"
            classList={{
              "text-green-500": saveStatus() === "saved",
              "text-text-weak": saveStatus() === "saving",
            }}
          >
            {saveStatus() === "saving" ? "Saving..." : "Saved"}
          </span>
        </Show>
        <Show when={showModeToggle()}>
          <SegmentedControlV2
            value={props.fileState.mode}
            onChange={(value) => {
              if (value === "preview" || value === "raw") {
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
            <TooltipV2 openDelay={400} value="Raw">
              <SegmentedControlItemV2 value="raw" aria-label="Raw" class="!flex-none !px-2">
                <Icon name="edit" size="small" />
              </SegmentedControlItemV2>
            </TooltipV2>
          </SegmentedControlV2>
        </Show>
      </div>

      {/* Content */}
      <div class="flex-1 min-h-0 overflow-auto">
        <Show when={!loading()} fallback={<div class="p-4 text-12-regular text-text-weak">Loading...</div>}>
          <Show
            when={isMarkdown(props.filePath)}
            fallback={
              <div class="h-full flex items-center justify-center text-12-regular text-text-weak p-4">
                {/* Stub: Slice 5 adds image/PDF rendering here */}
                Preview not available for this file type
              </div>
            }
          >
            <Show
              when={props.fileState.mode === "preview"}
              fallback={
                <RawEditor
                  content={fileContent()}
                  onEdit={handleRawEdit}
                  onSave={immediateSave}
                  zoom={props.zoom()}
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
          </Show>
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Placeholder RawEditor — will be replaced by CodeMirror in Slice 4
// ---------------------------------------------------------------------------

function RawEditor(props: { content: string; onEdit: (content: string) => void; onSave: () => void; zoom: number }) {
  return (
    <textarea
      ref={(el) => {
        el.value = props.content
        el.addEventListener("keydown", (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault()
            e.stopPropagation()
            props.onSave()
            return
          }
          if (e.metaKey || e.ctrlKey) {
            e.stopPropagation()
          }
        })
      }}
      class="w-full h-full p-4 resize-none bg-transparent text-text-base font-mono outline-none border-none selection:bg-blue-500/30"
      style={{ "tab-size": "2", "font-size": `${props.zoom * 0.12}px` }}
      onInput={(e) => props.onEdit(e.currentTarget.value)}
      spellcheck={false}
    />
  )
}
