// amicode: the context tree — the knowledge graph, moved to the TOP PANEL and
// redesigned around the session (Aaron, 2026-07-26). A pinned, collapsible
// panel between the session header and the chat that charts the agent's
// actual context: root = amico, branches = the session's turns, leaves = the
// markdown / source / skills / agents each turn pulled in. Unlike the retired
// inline brain strip this surface is INTERACTIVE — clicking a file node opens
// the real file (project files in a session tab, vault files in the Vault
// panel). Hovering a tool row in the log still glances at its node here via
// the same amicode:brain-hover event the strip used.
import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, For, Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useSync } from "@/context/sync"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { amicodeGet } from "@/utils/amicode-fetch"
import { amicoBrainRef } from "@opencode-ai/ui/brain-ref"
import {
  createContextTreeEngine,
  contextTreeKindColor,
  type ContextTreeEngine,
  type ContextTreeKind,
  type ContextTreeNodeInput,
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
  const server = useServer()
  const { tabs, view } = useSessionLayout()

  // per-mount browsability from GET /amicode/vaults (`browsable`, stamped by
  // the server's fail-closed law) — proprietary mounts mark their nodes
  // locked upfront instead of dead-ending in a Vault-panel refusal on click
  const [vaultsRaw] = createResource(
    () => server.current,
    (conn) => amicodeGet(conn, "/amicode/vaults").catch(() => undefined),
  )
  const browsableMounts = createMemo<Map<string, boolean | undefined> | undefined>(() => {
    const raw = vaultsRaw() as { mounts?: { id?: string; browsable?: boolean }[] } | undefined
    if (!raw || !Array.isArray(raw.mounts)) return undefined
    return new Map(
      raw.mounts.filter((m) => typeof m?.id === "string").map((m) => [m.id as string, m.browsable]),
    )
  })
  const vaultLocked = (mount: string) => {
    const map = browsableMounts()
    // list unavailable → status quo (no lock claims we can't back);
    // a mount the server doesn't list can't be browsed → locked;
    // `browsable` absent (older server) → unknown, again no lock claim
    if (!map) return false
    if (!map.has(mount)) return true
    return map.get(mount) === false
  }

  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])
  const getParts = (msgId: string) => sync.data.part[msgId] ?? []
  const busy = createMemo(() => (sync.data.session_status[props.sessionID]?.type ?? "idle") !== "idle")

  // the session's turns: ONE branch per user prompt. A single ask can span
  // several assistant messages (continuation steps), and charting per
  // assistant message drew duplicate roman-numeral branches — group by the
  // parent user message instead. Prompt text stays out of the turn entirely
  // (the tree charts context, not conversation).
  const turns = createMemo<ContextTurn[]>(() => {
    const byPrompt = new Map<string, ContextTurn>()
    const out: ContextTurn[] = []
    for (const m of messages()) {
      if (m.role !== "assistant") continue
      const key = m.parentID ?? m.id
      let turn = byPrompt.get(key)
      if (!turn) {
        turn = { id: key, refs: [], busy: false }
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
    if (!node.path || node.locked) return
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

  const tree = createMemo(() => buildContextTree(turns(), { vaultLocked }))
  createEffect(() => {
    const brain = engine()
    if (!brain) return
    brain.setTree(tree())
  })

  // keyboard navigation: a flat traversal of the same tree the canvas draws
  // (turns then their leaves, in order); arrows walk it, Enter/Space opens
  const flatNodes = createMemo(() => {
    const out: ContextTreeSelection[] = []
    const walk = (n: ContextTreeNodeInput) => {
      if (n.kind !== "root")
        out.push({ id: n.id, label: n.label, kind: n.kind, path: n.path, vault: n.vault, locked: n.locked })
      for (const c of n.children ?? []) walk(c)
    }
    walk(tree())
    return out
  })
  const [kbIndex, setKbIndex] = createSignal(-1)
  const [announce, setAnnounce] = createSignal("")
  const kbFocus = (index: number) => {
    const list = flatNodes()
    if (!list.length) return
    const next = Math.min(Math.max(index, 0), list.length - 1)
    setKbIndex(next)
    const node = list[next]
    engine()?.focus(node.id)
    setAnnounce(
      `${node.label} — ${node.kind}${
        node.locked ? ", locked — this vault does not allow browsing" : node.path ? ", press Enter to open" : ""
      }`,
    )
  }
  const onCanvasKeyDown = (e: KeyboardEvent) => {
    const list = flatNodes()
    if (!list.length) return
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault()
        kbFocus(kbIndex() + 1)
        return
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault()
        kbFocus(kbIndex() - 1)
        return
      case "Home":
        e.preventDefault()
        kbFocus(0)
        return
      case "End":
        e.preventDefault()
        kbFocus(list.length - 1)
        return
      case "Enter":
      case " ": {
        if (kbIndex() < 0) return
        e.preventDefault()
        onSelect(list[kbIndex()])
        return
      }
    }
  }
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
          <div class="ml-2 hidden items-center gap-3 sm:flex">
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
          role="application"
          aria-roledescription="context tree"
          aria-label={language.t("amicode.contextTree.canvasLabel")}
          tabIndex={0}
          onKeyDown={onCanvasKeyDown}
          onBlur={() => setKbIndex(-1)}
          class="block h-full w-full focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-border-focus-base"
        />
      </div>
      <div aria-live="polite" class="sr-only">
        {announce()}
      </div>
      </div>
    </Show>
  )
}
