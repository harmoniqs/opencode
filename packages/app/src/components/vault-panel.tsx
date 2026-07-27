// amicode: the standalone Vault drawer — vault access OUTSIDE sessions
// (Landing/home), where no session side panel exists. Inside a session the
// side panel's Vault tab is the host (it replaced the git review; Kate
// 2026-07-27), so the drawer stands down there — both hosts ride the same
// vaultPanel store and render the same VaultBrowser body.
import { Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { vaultPanel } from "@/context/vault-panel"
import { VaultBrowser } from "@/components/vault-browser"

export function VaultPanel() {
  const language = useLanguage()
  const params = useParams()
  return (
    <Show when={vaultPanel.opened() && !params.id}>
      <aside
        data-component="amico-vault-panel"
        aria-label={language.t("amicode.vault.title")}
        class="fixed bottom-2 left-18 top-12 z-40 flex w-[360px] max-w-[85vw] flex-col overflow-hidden rounded-xl border border-border-weaker-base bg-background-base shadow-[var(--v2-elevation-raised)]"
      >
        <VaultBrowser onClose={() => vaultPanel.close()} />
      </aside>
    </Show>
  )
}
