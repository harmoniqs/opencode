// Framed-app clipboard fallback, generalized from the prompt input's bridge.
// Inside the VS Code webview iframe, native paste never fires and native
// copy never reaches the OS clipboard (see prompt-input/clipboard-bridge.ts
// for the full why) — so every editable silently ignores ⌘V and poisons the
// next paste on ⌘C. This module intercepts mod+V/C/X at the window's capture
// phase and routes them over the existing extension-host bridge. It is the
// SOLE ⌘V path in the webview: the prompt composers (v1 and v2) no longer
// intercept the keystroke themselves, so the text lands exactly once.
// Unframed (plain web/desktop), it does nothing — native clipboard behavior
// stands.

import {
  readClipboardImageViaBridge,
  readClipboardViaBridge,
  writeClipboardViaBridge,
} from "@/components/prompt-input/clipboard-bridge"

// Single-slot media hook: a paste that carries no text is offered to the
// registered consumer (the v2 composer's attachment pipeline) as an image.
// Deliberately one slot — a list would invite two owners of one gesture.
let clipboardImageHandler: ((file: File) => void) | undefined

export function setClipboardImageHandler(handler?: (file: File) => void): void {
  clipboardImageHandler = handler
}

// Elements that carry their own bridged paste (the profile fields'
// pasteFallback) mark themselves so the fallback doesn't double-insert. The
// marker owns PASTE only: nothing element-local handles copy/cut, so ⌘C/⌘X
// still mirror to the OS clipboard even inside marked subtrees — otherwise
// copying from the prompt would paste stale content.
export const CLIPBOARD_SELF_SELECTOR = '[data-amc-clipboard="self"]'

type FormField = HTMLInputElement | HTMLTextAreaElement

// Input types that hold free text and support the selection API. Everything
// else (checkbox, file, range, date, …) has no text caret to paste at.
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "password", "email"])

const isFormField = (el: unknown): el is FormField =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

export function isEditableTarget(el: EventTarget | null): el is HTMLElement {
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.disabled && !el.readOnly
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly
  return el instanceof HTMLElement && el.isContentEditable
}

// email (and, in some browsers, other text-like types) throws on selection
// access — degrade to append-at-end rather than losing the paste entirely.
function fieldSelection(el: FormField): { start: number; end: number } {
  try {
    const start = el.selectionStart
    const end = el.selectionEnd
    if (start !== null && end !== null) return { start, end }
  } catch {
    // no selection API for this input type
  }
  return { start: el.value.length, end: el.value.length }
}

function setCaret(el: FormField, at: number) {
  try {
    el.setSelectionRange(at, at)
  } catch {
    // no selection API — the value update above still landed
  }
}

// Manual dispatch discipline: setRangeText and Range edits fire no events, but
// Solid-controlled inputs only sync state from a bubbling "input" event.
function dispatchInput(el: HTMLElement, inputType: string, data?: string) {
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }))
}

export function insertTextAtSelection(el: HTMLElement, text: string): void {
  if (isFormField(el)) {
    const { start, end } = fieldSelection(el)
    if (typeof el.setRangeText === "function") {
      el.setRangeText(text, start, end)
    } else {
      el.value = el.value.slice(0, start) + text + el.value.slice(end)
    }
    // Place the caret ourselves: setRangeText's "end" selection mode is not
    // reliable across DOM implementations (happy-dom lands it off-spec).
    setCaret(el, start + text.length)
    dispatchInput(el, "insertFromPaste", text)
    return
  }

  // contenteditable: prefer execCommand — the browser splices the text at the
  // caret and fires the input event itself, exactly like a native paste.
  const doc = el.ownerDocument
  if (typeof doc.execCommand === "function") {
    el.focus()
    try {
      if (doc.execCommand("insertText", false, text)) return
    } catch {
      // fall through to the manual range splice
    }
  }
  const selection = doc.defaultView?.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const node = doc.createTextNode(text)
  if (selection && range && el.contains(range.commonAncestorContainer)) {
    range.deleteContents()
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  } else {
    // No usable selection inside the element — append rather than drop the paste.
    el.appendChild(node)
  }
  dispatchInput(el, "insertFromPaste", text)
}

export function extractSelection(el: HTMLElement, opts: { cut?: boolean } = {}): string {
  if (isFormField(el)) {
    const { start, end } = fieldSelection(el)
    const text = el.value.slice(start, end)
    if (!text) return ""
    if (opts.cut) {
      if (typeof el.setRangeText === "function") {
        el.setRangeText("", start, end)
      } else {
        el.value = el.value.slice(0, start) + el.value.slice(end)
      }
      setCaret(el, start)
      dispatchInput(el, "deleteByCut")
    }
    return text
  }

  const selection = el.ownerDocument.defaultView?.getSelection()
  if (!selection || selection.rangeCount === 0) return ""
  const range = selection.getRangeAt(0)
  // Only speak for selections that actually live inside this editable —
  // cutting must never delete content the keystroke's target doesn't own.
  if (!el.contains(range.commonAncestorContainer)) return ""
  const text = selection.toString()
  if (!text) return ""
  if (opts.cut) {
    range.deleteContents() // leaves the selection collapsed at the cut point
    dispatchInput(el, "deleteByCut")
  }
  return text
}

// Capture-phase so it sees the keystroke before any component handler, and
// window-level so portaled UI (popovers, dialogs) is covered too. Returns an
// uninstall function; the handler re-checks framing per event, so installing
// unconditionally at startup is safe everywhere.
export function installGlobalClipboardFallback(win: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (win.parent === win) return // unframed: native clipboard works — stay out
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
    if (event.isComposing) return
    const key = event.key.toLowerCase()
    if (key !== "v" && key !== "c" && key !== "x") return
    const target = event.target
    if (!isEditableTarget(target)) return // non-editables keep native behavior

    if (key === "v") {
      if (target.closest(CLIPBOARD_SELF_SELECTOR)) return // element owns its own paste
      // Native paste never fires in-frame, so preventDefault loses nothing;
      // an empty or dead bridge reply degrades to a no-op (see clipboard-bridge).
      event.preventDefault()
      void readClipboardViaBridge(win).then(async (text) => {
        if (text) {
          insertTextAtSelection(target, text)
          return
        }
        // No text on the clipboard: offer media. Mirrors the composer's own
        // handlePaste precedence (image only when there is no plain text), so
        // text pastes keep their exact single-value sequence with no extra
        // round-trip.
        if (!clipboardImageHandler) return
        const file = await readClipboardImageViaBridge(win)
        if (file) clipboardImageHandler(file)
      })
      return
    }

    const text = extractSelection(target, { cut: key === "x" })
    if (!text) return // nothing selected: the native no-op stands
    event.preventDefault()
    writeClipboardViaBridge(text, win)
  }

  win.addEventListener("keydown", onKeyDown, true)
  return () => win.removeEventListener("keydown", onKeyDown, true)
}
