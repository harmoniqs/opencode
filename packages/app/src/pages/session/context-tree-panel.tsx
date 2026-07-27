// amicode: the context tree — the knowledge graph, moved to the TOP PANEL and
// redesigned around the session (Aaron, 2026-07-26). A pinned, collapsible
// panel between the session header and the chat that charts the agent's
// actual context: root = amico, branches = the session's turns, leaves = the
// markdown / source / skills / agents each turn pulled in. Unlike the retired
// inline brain strip this surface is INTERACTIVE — clicking a file node opens
// the real file (project files in a session tab, vault files in the Vault
// panel). Hovering a tool row in the log still glances at its node here via
// the same amicode:brain-hover event the strip used.
import { createEffect, createMemo, createSignal, onCleanup, onMount, For, Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useSync } from "@/context/sync"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { amicoBrainRef } from "@opencode-ai/ui/brain-ref"
import {
  createContextTreeEngine,
  contextTreeKindColor,
  type ContextTreeEngine,
  type ContextTreeKind,
  type ContextTreeScheme,
  type ContextTreeSelection,
} from "@opencode-ai/ui/context-tree-engine"
import { buildContextTree, vaultRefFromPath, type ContextTurn } from "@opencode-ai/ui/context-tree-data"
import { vaultPanel } from "@/context/vault-panel"
import { createOpenSessionFileTab } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"

const OPEN_KEY = "amicode-context-tree-open"

/** The panel's session gate, shared with the timeline header so its bottom
 *  padding can defer to the tree block when the tree will render: ≥1 commit
 *  touch anywhere in the session (same refs the tree charts). */
export function sessionHasContextItems(
  messages: readonly { id: string; role?: string }[],
  partsFor: (messageID: string) => readonly { type?: string; tool?: string; state?: { input?: unknown } }[],
): boolean {
  for (const m of messages) {
    if (m.role !== "assistant") continue
    for (const p of partsFor(m.id) ?? []) {
      if (p?.type !== "tool" || typeof p.tool !== "string") continue
      const ref = amicoBrainRef(p.tool, (p.state?.input as Record<string, unknown>) ?? {})
      if (ref && !ref.consider) return true
    }
  }
  return false
}
const LEGEND: { kind: ContextTreeKind; label: string }[] = [
  { kind: "note", label: "notes" },
  { kind: "source", label: "source" },
  { kind: "skill", label: "skills" },
  { kind: "agent", label: "agents" },
]

export function ContextTreePanel(props: { sessionID?: string }) {
  // keyed remount per session: a fresh tree charts the new session's context
  return (
    <Show when={props.sessionID} keyed>
      {(sid) => <ContextTreeFrame sessionID={sid} />}
    </Show>
  )
}

function ContextTreeFrame(props: { sessionID: string }) {
  const sync = useSync()
  const file = useFile()
  const language = useLanguage()
  const { tabs, view } = useSessionLayout()

  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])
  const getParts = (msgId: string) => sync.data.part[msgId] ?? []
  const busy = createMemo(() => (sync.data.session_status[props.sessionID]?.type ?? "idle") !== "idle")

  const turnTitle = (parentID: string | undefined) => {
    const parent = parentID ? messages().find((m) => m.id === parentID) : undefined
    if (!parent) return ""
    for (const p of getParts(parent.id)) {
      if (p.type === "text" && typeof p.text === "string" && p.text.trim()) return p.text.trim()
    }
    return ""
  }

  // the session's turns: ONE branch per user prompt. A single ask can span
  // several assistant messages (continuation steps), and charting per
  // assistant message drew duplicate roman-numeral branches carrying the
  // same prompt excerpt — group by the parent user message instead.
  const turns = createMemo<ContextTurn[]>(() => {
    const byPrompt = new Map<string, ContextTurn>()
    const out: ContextTurn[] = []
    for (const m of messages()) {
      if (m.role !== "assistant") continue
      const key = m.parentID ?? m.id
      let turn = byPrompt.get(key)
      if (!turn) {
        turn = { id: key, title: turnTitle(m.parentID), refs: [], busy: false }
        byPrompt.set(key, turn)
        out.push(turn)
      }
      for (const p of getParts(m.id)) {
        if (p.type !== "tool") continue
        const ref = amicoBrainRef(p.tool, p.state.input ?? {})
        if (!ref || ref.consider) continue
        turn.refs.push(ref)
      }
      if (typeof m.time?.completed !== "number" && busy()) turn.busy = true
    }
    return out.filter((t) => t.refs.length > 0)
  })

  const itemCount = createMemo(() => {
    const seen = new Set<string>()
    for (const t of turns()) for (const r of t.refs) seen.add(r.path ?? r.label.toLowerCase())
    return seen.size
  })

  // collapse is a window preference, not per-session state
  const [open, setOpen] = createSignal(localStorage.getItem(OPEN_KEY) !== "false")
  const toggle = () => {
    const next = !open()
    setOpen(next)
    localStorage.setItem(OPEN_KEY, String(next))
  }

  const [engine, setEngine] = createSignal<ContextTreeEngine>()
  const currentScheme = (): ContextTreeScheme =>
    document.documentElement.dataset.colorScheme === "light" ? "light" : "dark"
  const [scheme, setScheme] = createSignal<ContextTreeScheme>(
    typeof document === "undefined" ? "dark" : currentScheme(),
  )

  // node clicks open the real thing: vault files through the Vault panel,
  // project files as a session file tab (same flow as the file tree)
  const openTab = createOpenSessionFileTab({
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
    openTab: (tab) => tabs().open(tab),
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel: () => {
      if (!view().reviewPanel.opened()) view().reviewPanel.open()
    },
    setActive: (tab) => tabs().setActive(tab),
  })
  const onSelect = (node: ContextTreeSelection) => {
    if (!node.path) return
    const vaultRef = vaultRefFromPath(node.path)
    if (vaultRef) {
      vaultPanel.open({ mount: vaultRef.mount, path: vaultRef.rel })
      return
    }
    openTab(file.tab(node.path))
  }

  onMount(() => engine()?.resize())
  const themeObserver = new MutationObserver(() => {
    setScheme(currentScheme())
    engine()?.setTheme(currentScheme())
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] })
  onCleanup(() => themeObserver.disconnect())
  onCleanup(() => engine()?.destroy())

  // hovering a tool row in the log glances at its node on the tree — the same
  // event the brain strip consumed, so message-part needs no change
  const onToolHover = (e: Event) => {
    const d = (e as CustomEvent).detail as { label?: string } | undefined
    if (d?.label) engine()?.highlight(d.label)
  }
  window.addEventListener("amicode:brain-hover", onToolHover)
  onCleanup(() => window.removeEventListener("amicode:brain-hover", onToolHover))

  createEffect(() => {
    const brain = engine()
    if (!brain) return
    brain.setTree(buildContextTree(turns()))
  })
  // folded away — stop burning frames
  createEffect(() => {
    const brain = engine()
    if (!brain) return
    if (open()) brain.resume()
    else brain.pause()
  })

  const hasItems = createMemo(() => itemCount() > 0)

  return (
    // folded into the sticky session header (Kate, 2026-07-27): no card
    // chrome of its own — a hairline seam + the header's solid ground (the
    // canvas must not sit on the header's fade-to-transparent gradient).
    // Absent entirely until the session holds ≥1 context item.
    <Show when={hasItems()}>
      <div
        data-component="amico-context-tree"
        class="mt-1 overflow-hidden border-t border-border-weaker-base bg-background-stronger"
      >
        <div class="flex h-8 items-center gap-2 px-3">
        <div class="text-12-medium text-text-base">{language.t("amicode.contextTree.title")}</div>
        <div class="text-12-regular text-text-weak">
          {language.t("amicode.contextTree.count", { count: itemCount() })}
        </div>
        <Show when={open()}>
          <div class="ml-2 hidden items-center gap-3 sm:flex" aria-hidden="true">
            <For each={LEGEND}>
              {(item) => (
                <div class="flex items-center gap-1.5">
                  <span
                    class="inline-block size-2 rounded-full"
                    style={{ background: contextTreeKindColor(scheme(), item.kind) }}
                  />
                  <span class="text-12-regular text-text-weak">{item.label}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
        <div class="flex-1" />
        <Show when={open()}>
          <IconButton
            icon="expand"
            variant="ghost"
            onClick={() => engine()?.fit()}
            aria-label={language.t("amicode.contextTree.fit")}
          />
        </Show>
        <IconButton
          icon={open() ? "chevron-down" : "chevron-right"}
          variant="ghost"
          onClick={toggle}
          aria-label={language.t(open() ? "amicode.contextTree.collapse" : "amicode.contextTree.expand")}
          aria-expanded={open()}
        />
      </div>
      <div
        class="overflow-hidden transition-[height] duration-200 motion-reduce:transition-none"
        style={{ height: open() ? "192px" : "0px" }}
      >
        <canvas
          ref={(el) =>
            setEngine(
              createContextTreeEngine(el, {
                scheme: currentScheme(),
                size: { width: 900, height: 192 },
                onSelect,
              }),
            )
          }
          role="img"
          aria-label={language.t("amicode.contextTree.canvasLabel")}
          class="block h-full w-full"
        />
      </div>
      </div>
    </Show>
  )
}
