// AMICODE: register/dispatch singleton connecting receipt/chip clicks to the
// one component that holds app context (the entity rail registers handlers on
// mount, unregisters on cleanup — the ask-bridge idiom). Unregistered → no-op.
export type AmicodeUiBridge = {
  openEntity: (kind: string, seq?: number) => void
  openSwitcher: () => void
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
