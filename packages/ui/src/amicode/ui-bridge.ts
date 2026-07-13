import type { WidgetHostCallbacks } from "./widget-frame"

// AMICODE: register/dispatch singleton connecting receipt/chip clicks to the
// one component that holds app context (the entity rail registers handlers on
// mount, unregisters on cleanup — the ask-bridge idiom). Unregistered → no-op.

// Stage 2 chat authoring: the in-chat widget preview needs the same server
// context the home grid has (frame src base, host callbacks) plus a pin verb.
// Provided by the app alongside fetchRunSeries; optional so a host that can't
// render widgets (e.g. TUI) simply shows a fallback note.
export type AmicodeWidgetHost = {
  frameSrc: (id: string, hash: string) => string
  callbacks: WidgetHostCallbacks
  pin: (id: string, size: "hero" | "tile") => Promise<unknown>
}

export type AmicodeUiBridge = {
  openEntity: (kind: string, seq?: number) => void
  openSwitcher: () => void
  // spec C: transport for the in-chat run window, provided by the app (the rail
  // holds server context). Optional so older registrations stay valid.
  fetchRunSeries?: (run: string, lab?: string) => Promise<unknown>
  widgetHost?: AmicodeWidgetHost
}
let bridge: AmicodeUiBridge | undefined
export function registerAmicodeUiBridge(next: AmicodeUiBridge): () => void {
  bridge = next
  return () => {
    if (bridge === next) bridge = undefined
  }
}
export function openAmicodeEntity(kind: string, seq?: number): void {
  bridge?.openEntity(kind, seq)
}
export function openAmicodeSwitcher(): void {
  bridge?.openSwitcher()
}
/** Returns undefined when no transport is registered (no-op, like the openers). */
export function fetchAmicodeRunSeries(run: string, lab?: string): Promise<unknown> | undefined {
  return bridge?.fetchRunSeries?.(run, lab)
}
/** The widget-host transport for the in-chat preview; undefined ⇒ no host. */
export function amicodeWidgetHost(): AmicodeWidgetHost | undefined {
  return bridge?.widgetHost
}
