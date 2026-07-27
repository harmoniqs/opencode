// amicode: the Vault panel — the vault, and every file that makes it up,
// living IN the interface (Aaron, 2026-07-26). A dismissible drawer beside the
// Chat (CONTEXT.md's Panel concept): pick a mount, browse its real files, and
// read markdown / source inline. Data comes from the read-only
// /amicode/vault-files + /amicode/vault-file routes (vault-browser.ts) — the
// same mounts the agent itself reads through its per-mount grants.
// Opened by the rail's vault button, the command palette, or a context-tree
// click on a vault node (which lands directly on that file).
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Markdown } from "@opencode-ai/ui/markdown"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { amicodeGet } from "@/utils/amicode-fetch"
import { vaultPanel } from "@/context/vault-panel"

type Mount = { id: string; kind: string; writable: boolean }
type Entry = { path: string; name: string; size: number; readable: boolean }
type Dir = { name: string; path: string; dirs: Dir[]; files: Entry[] }

function foldTree(files: Entry[]): Dir {
  const root: Dir = { name: "", path: "", dirs: [], files: [] }
  const dirOf = new Map<string, Dir>([["", root]])
  const ensureDir = (p: string): Dir => {
    const known = dirOf.get(p)
    if (known) return known
    const cut = p.lastIndexOf("/")
    const parent = ensureDir(cut < 0 ? "" : p.slice(0, cut))
    const dir: Dir = { name: cut < 0 ? p : p.slice(cut + 1), path: p, dirs: [], files: [] }
    parent.dirs.push(dir)
    dirOf.set(p, dir)
    return dir
  }
  for (const f of files) {
    const cut = f.path.lastIndexOf("/")
    ensureDir(cut < 0 ? "" : f.path.slice(0, cut)).files.push(f)
  }
  return root
}

export function VaultPanel() {
  const language = useLanguage()
  const server = useServer()

  const [mountsRaw] = createResource(
    () => (vaultPanel.opened() ? server.current : undefined),
    (conn) => amicodeGet(conn, "/amicode/vaults").catch(() => undefined),
  )
  const mounts = createMemo<Mount[]>(() => {
    const raw = mountsRaw() as { mounts?: Mount[] } | undefined
    return Array.isArray(raw?.mounts) ? raw.mounts.filter((m) => typeof m?.id === "string") : []
  })

  const [chosenMount, setChosenMount] = createSignal<string | undefined>(undefined)
  const mount = createMemo(() => {
    const chosen = chosenMount()
    if (chosen && mounts().some((m) => m.id === chosen)) return chosen
    return mounts()[0]?.id
  })

  const [listingRaw] = createResource(
    () => (vaultPanel.opened() && mount() && server.current ? { conn: server.current, mount: mount()! } : undefined),
    (key) => amicodeGet(key.conn, `/amicode/vault-files?mount=${encodeURIComponent(key.mount)}`).catch(() => undefined),
  )
  const listing = createMemo(() => {
    const raw = listingRaw() as { ok?: boolean; truncated?: boolean; files?: Entry[]; error?: string } | undefined
    if (!raw) return undefined
    if (!raw.ok || !Array.isArray(raw.files)) return { error: raw.error ?? "unreadable" } as const
    return { tree: foldTree(raw.files), truncated: !!raw.truncated, total: raw.files.length } as const
  })

  const [expanded, setExpanded] = createSignal(new Set<string>(), { equals: false })
  const toggleDir = (p: string) => {
    const next = new Set(expanded())
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setExpanded(next)
  }

  const [selected, setSelected] = createSignal<Entry | undefined>(undefined)
  const [fileRaw] = createResource(
    () =>
      vaultPanel.opened() && mount() && selected()?.readable && server.current
        ? { conn: server.current, mount: mount()!, path: selected()!.path }
        : undefined,
    (key) =>
      amicodeGet(
        key.conn,
        `/amicode/vault-file?mount=${encodeURIComponent(key.mount)}&path=${encodeURIComponent(key.path)}`,
      ).catch(() => undefined),
  )
  const fileBody = createMemo(() => {
    const raw = fileRaw() as { ok?: boolean; content?: string; error?: string } | undefined
    if (!raw) return undefined
    return raw.ok && typeof raw.content === "string" ? { content: raw.content } : { error: raw.error ?? "unreadable" }
  })

  // a context-tree click lands directly on its file: pick the mount, unfold
  // the ancestors, select — then clear so the next open starts at the tree
  createEffect(() => {
    const target = vaultPanel.target()
    if (!target || !vaultPanel.opened()) return
    setChosenMount(target.mount)
    const parts = target.path.split("/")
    const next = new Set(expanded())
    for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"))
    setExpanded(next)
    setSelected({
      path: target.path,
      name: parts[parts.length - 1],
      size: 0,
      readable: true,
    })
    vaultPanel.clearTarget()
  })

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !vaultPanel.opened()) return
    e.preventDefault()
    if (selected()) setSelected(undefined)
    else vaultPanel.close()
  }
  window.addEventListener("keydown", onKeyDown)
  onCleanup(() => window.removeEventListener("keydown", onKeyDown))

  const renderDir = (dir: Dir, depth: number) => (
    <>
      <For each={[...dir.dirs].sort((a, b) => a.name.localeCompare(b.name))}>
        {(sub) => (
          <>
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-12-regular text-text-base hover:bg-background-stronger focus-visible:outline focus-visible:outline-1 focus-visible:outline-border-focus-base"
              style={{ "padding-left": `${8 + depth * 12}px` }}
              aria-expanded={expanded().has(sub.path)}
              onClick={() => toggleDir(sub.path)}
            >
              <span class="inline-block w-3 text-text-weak" aria-hidden="true">
                {expanded().has(sub.path) ? "▾" : "▸"}
              </span>
              <span class="truncate">{sub.name}</span>
            </button>
            <Show when={expanded().has(sub.path)}>{renderDir(sub, depth + 1)}</Show>
          </>
        )}
      </For>
      <For each={[...dir.files].sort((a, b) => a.name.localeCompare(b.name))}>
        {(f) => (
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-12-regular focus-visible:outline focus-visible:outline-1 focus-visible:outline-border-focus-base"
            classList={{
              "cursor-pointer text-text-base hover:bg-background-stronger": f.readable,
              "cursor-default text-text-weaker": !f.readable,
              "bg-background-stronger": selected()?.path === f.path,
            }}
            style={{ "padding-left": `${20 + depth * 12}px` }}
            disabled={!f.readable}
            title={f.readable ? f.path : language.t("amicode.vault.unreadable")}
            onClick={() => f.readable && setSelected(f)}
          >
            <span class="truncate">{f.name}</span>
          </button>
        )}
      </For>
    </>
  )

  return (
    <Show when={vaultPanel.opened()}>
      <aside
        data-component="amico-vault-panel"
        aria-label={language.t("amicode.vault.title")}
        class="fixed bottom-2 left-18 top-12 z-40 flex w-[360px] max-w-[85vw] flex-col overflow-hidden rounded-xl border border-border-weaker-base bg-background-base shadow-[var(--v2-elevation-raised)]"
      >
        <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border-weaker-base px-3">
          <Show
            when={selected()}
            fallback={<div class="text-12-medium text-text-base">{language.t("amicode.vault.title")}</div>}
          >
            <IconButton
              icon="arrow-left"
              variant="ghost"
              onClick={() => setSelected(undefined)}
              aria-label={language.t("amicode.vault.back")}
            />
            <div class="min-w-0 truncate text-12-medium text-text-base">{selected()!.name}</div>
          </Show>
          <div class="flex-1" />
          <IconButton
            icon="close"
            variant="ghost"
            onClick={() => vaultPanel.close()}
            aria-label={language.t("amicode.vault.close")}
          />
        </div>

        <Show when={!selected()}>
          <Show when={mounts().length > 1}>
            <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border-weaker-base px-3 py-2">
              <For each={mounts()}>
                {(m) => (
                  <button
                    type="button"
                    class="cursor-pointer rounded-md border px-2 py-0.5 text-12-regular focus-visible:outline focus-visible:outline-1 focus-visible:outline-border-focus-base"
                    classList={{
                      "border-border-strong-base text-text-base bg-background-stronger": mount() === m.id,
                      "border-border-weaker-base text-text-weak hover:bg-background-stronger": mount() !== m.id,
                    }}
                    aria-pressed={mount() === m.id}
                    onClick={() => {
                      setChosenMount(m.id)
                      setSelected(undefined)
                    }}
                  >
                    {m.id}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <div class="min-h-0 flex-1 overflow-y-auto px-1 py-2">
            <Show
              when={listing()}
              fallback={
                <div class="px-3 py-2 text-12-regular text-text-weak">
                  {mountsRaw.loading || listingRaw.loading
                    ? `${language.t("common.loading")}${language.t("common.loading.ellipsis")}`
                    : language.t("amicode.vault.empty")}
                </div>
              }
            >
              {(state) => (
                <Show
                  when={"tree" in state() ? (state() as { tree: Dir }) : undefined}
                  fallback={<div class="px-3 py-2 text-12-regular text-text-weak">{language.t("amicode.vault.error")}</div>}
                >
                  {(ok) => (
                    <>
                      {renderDir(ok().tree, 0)}
                      <Show when={(state() as { truncated?: boolean }).truncated}>
                        <div class="px-3 py-2 text-12-regular text-text-weaker">
                          {language.t("amicode.vault.truncated")}
                        </div>
                      </Show>
                    </>
                  )}
                </Show>
              )}
            </Show>
          </div>
        </Show>

        <Show when={selected()}>
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <Show
              when={fileBody()}
              fallback={
                <div class="text-12-regular text-text-weak">
                  {language.t("common.loading")}
                  {language.t("common.loading.ellipsis")}
                </div>
              }
            >
              {(body) => (
                <Show
                  when={"content" in body() ? (body() as { content: string }) : undefined}
                  fallback={<div class="text-12-regular text-text-weak">{language.t("amicode.vault.error")}</div>}
                >
                  {(ok) => (
                    <Show
                      when={/\.(md|txt)$/i.test(selected()!.name)}
                      fallback={
                        <pre class="overflow-x-auto whitespace-pre rounded-lg bg-background-stronger p-3 font-mono text-12-regular text-text-base">
                          {ok().content}
                        </pre>
                      }
                    >
                      <Markdown text={ok().content} cacheKey={`vault:${mount()}:${selected()!.path}`} />
                    </Show>
                  )}
                </Show>
              )}
            </Show>
          </div>
        </Show>
      </aside>
    </Show>
  )
}
