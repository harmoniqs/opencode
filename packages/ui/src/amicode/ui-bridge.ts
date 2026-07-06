// AMICODE: register/dispatch singleton connecting receipt/chip clicks to the
// one component that holds app context (the entity rail registers handlers on
// mount, unregisters on cleanup — the ask-bridge idiom). Unregistered → no-op.
export type AmicodeUiBridge = {
  openEntity: (kind: string, seq?: number) => void
  openSwitcher: () => void
  // spec C: transport for the in-chat run window, provided by the app (the rail
  // holds server context). Optional so older registrations stay valid.
  fetchRunSeries?: (run: string, lab?: string) => Promise<unknown>
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
