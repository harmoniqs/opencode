/**
 * preview-file-view — Routes file rendering by type for the Preview tab.
 *
 * Slice 4: handles markdown files with Preview mode (<Markdown>) and Edit
 * mode (CodeMirror 6 via preview-editor.tsx). Mode renamed from "raw" to "edit".
 * Slice 5 adds image and PDF rendering branches.
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
import { PreviewEditor } from "@opencode-ai/session-ui/v2/preview-editor"

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
  onModeChange: (mode: "preview" | "edit") => void
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

  const showModeToggle = () => isMarkdown(props.filePath)

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Sub-header: save status + mode toggle */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-1 border-b border-border-weaker-base">
        <div class="flex-1 flex items-center gap-1.5">
          <Show when={saveStatus() === "saving"}>
            <div
              class="w-3 h-3 rounded-full border-2 border-text-weak border-t-transparent shrink-0"
              style={{ animation: "spin 0.6s linear infinite" }}
              aria-label="Saving"
            />
          </Show>
          <Show when={saveStatus() === "saved"}>
            <div class="w-3 h-3 rounded-full bg-green-500 shrink-0" aria-label="Saved" />
          </Show>
        </div>
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
          </Show>
        </Show>
      </div>
    </div>
  )
}
