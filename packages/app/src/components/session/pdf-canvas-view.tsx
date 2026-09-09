/**
 * pdf-canvas-view — Renders PDF pages to <canvas> elements via PDF.js.
 *
 * Uses pdfjs-dist (Mozilla's PDF renderer) to decode PDF binary data and
 * paint each page onto a canvas. No browser plugin, no iframe, no Chromium
 * PDF viewer — works in any context including VS Code sandboxed webviews.
 *
 * Worker runs on the main thread via globalThis.pdfjsWorker injection
 * (LoopbackPort). For a side-panel preview showing one PDF at a time this
 * is fine and avoids CSP/bundling complexity with real Web Workers.
 *
 * @module
 */

import { createEffect, createSignal, For, on, onCleanup } from "solid-js"
import * as pdfjsLib from "pdfjs-dist"
// @ts-expect-error — no type declarations for the worker bundle; Vite resolves it at build time
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs"

// Inject the worker module on globalThis — the one code path in pdfjs-dist v6
// that bypasses BOTH `new Worker()` AND the `workerSrc` getter. PDF.js sees
// `globalThis.pdfjsWorker.WorkerMessageHandler`, routes through LoopbackPort,
// and runs everything on the main thread. No CSP issue, no blob worker, no
// external fetch. Fine for a side-panel preview.
;(globalThis as any).pdfjsWorker = pdfjsWorker

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfCanvasViewProps {
  /** Base64-encoded PDF content */
  base64: string
  /** MIME type (e.g. "application/pdf") */
  mime: string
  /** Zoom percentage (100 = fit width) */
  zoom: number
  /** The file path — used for the "Open in editor" button */
  filePath: string
}

// ---------------------------------------------------------------------------
// Single page renderer
// ---------------------------------------------------------------------------

function PdfPage(props: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNum: number
  zoom: number
}) {
  let canvasRef: HTMLCanvasElement | undefined

  // Re-render whenever zoom or page changes
  createEffect(() => {
    const doc = props.doc
    const zoom = props.zoom
    const pageNum = props.pageNum
    if (!canvasRef || !doc) return

    let cancelled = false

    doc.getPage(pageNum).then((page) => {
      if (cancelled || !canvasRef) return

      const dpr = window.devicePixelRatio || 1
      // Scale: at 100% zoom, render so the page fits the canvas at 1:1 CSS px.
      // We render at dpr × scale for sharp HiDPI text.
      const scale = (zoom / 100) * dpr
      const viewport = page.getViewport({ scale })

      canvasRef.width = viewport.width
      canvasRef.height = viewport.height
      // CSS size = physical ÷ dpr so it's crisp on HiDPI
      canvasRef.style.width = `${viewport.width / dpr}px`
      canvasRef.style.height = `${viewport.height / dpr}px`

      const ctx = canvasRef.getContext("2d")
      if (!ctx) return

      page.render({ canvas: null, canvasContext: ctx, viewport }).promise.catch(() => {
        // Render cancelled or failed — ignore silently
      })
    })

    onCleanup(() => {
      cancelled = true
    })
  })

  return (
    <canvas
      ref={canvasRef}
      class="shadow-sm rounded-sm"
      style={{ background: "white" }}
    />
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PdfCanvasView(props: PdfCanvasViewProps) {
  const [pageCount, setPageCount] = createSignal(0)
  const [pdfDoc, setPdfDoc] = createSignal<pdfjsLib.PDFDocumentProxy | null>(null)
  const [error, setError] = createSignal(false)

  // Load the PDF document from base64
  createEffect(
    on(
      () => props.base64,
      (b64) => {
        if (!b64) return
        setError(false)
        setPageCount(0)
        setPdfDoc(null)

        try {
          // Decode base64 → Uint8Array
          const raw = atob(b64)
          const bytes = new Uint8Array(raw.length)
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)

          const loadingTask = pdfjsLib.getDocument({
            data: bytes,
            // Disable worker-fetch — we already have the data in memory
            useWorkerFetch: false,
            useSystemFonts: true,
          })

          loadingTask.promise
            .then((doc) => {
              setPdfDoc(doc)
              setPageCount(doc.numPages)
            })
            .catch(() => {
              setError(true)
            })
        } catch {
          setError(true)
        }
      },
    ),
  )

  // Clean up the document on unmount
  onCleanup(() => {
    const doc = pdfDoc()
    if (doc) doc.cleanup()
  })

  return (
    <div class="inline-flex flex-col items-center gap-3 p-4 min-w-full min-h-full">
      {/* Rendered pages */}
      <For each={Array.from({ length: pageCount() }, (_, i) => i + 1)}>
        {(pageNum) => (
          <PdfPage
            doc={pdfDoc()!}
            pageNum={pageNum}
            zoom={props.zoom}
          />
        )}
      </For>

      {/* Error state */}
      {error() && (
        <div class="flex flex-col items-center gap-2 py-8">
          <p class="text-12-regular text-text-weak">Could not render PDF</p>
        </div>
      )}

      {/* Open in editor — secondary action below the rendered pages */}
      <button
        class="text-11-regular text-text-faint hover:text-text-weak transition-colors py-2"
        onClick={() => {
          window.parent.postMessage(
            { source: "amicode", kind: "open-file", path: props.filePath },
            "*",
          )
        }}
      >
        Open in editor
      </button>
    </div>
  )
}
