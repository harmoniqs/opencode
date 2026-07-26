import { createEffect, createMemo, createResource, createSignal, onMount, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"
import { BrainAtmosphere } from "@opencode-ai/ui/brain-atmosphere"
import { NewSessionDesignView } from "@/components/session"
import { useComments } from "@/context/comments"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useServer } from "@/context/server"
import { startPrompt as startPromptWith } from "@/utils/start-prompt"
import { amicodeGet } from "@/utils/amicode-fetch"
import { parseProblemsResponse } from "@opencode-ai/ui/amicode-problem-switcher"
import { AmicodeStarterChips } from "@opencode-ai/ui/amicode-getting-started"
import { createSessionComposerState, SessionComposerRegion } from "@/pages/session/composer"
import { useAmicodeCommands } from "@/pages/session/use-amicode-commands"

/**
 * The `/new-session` draft page. Unlike `session.tsx`, this only renders the prompt
 * composer for a brand-new session — no terminal, review pane, file tree, or message
 * timeline. Submitting promotes the draft into a real session (see prompt-input/submit).
 */
export default function NewSessionPage() {
  const prompt = usePrompt()
  const sdk = useSDK()
  const sync = useSync()
  const server = useServer()
  const comments = useComments()
  const [searchParams, setSearchParams] = useSearchParams<{ prompt?: string }>()

  let inputRef: HTMLDivElement | undefined

  const composer = createSessionComposerState()

  // amicode latent-constellation: the first prompt send ignites the handoff —
  // rotation eases to a stop and the latent web starts dissolving. The
  // draft→session promotion remounts the canvas (the session route keys its
  // own Brain), so the visible dissolve is bounded by the session-create
  // round trip; the session then boots its live graph normally, whose core
  // ignition (#fff676) is the "first node ignites" beat of the design.
  const [ignited, setIgnited] = createSignal(false)

  // amicode: register the Amico ops commands here too — the draft page has no
  // palette, so restart/update-memory are reachable via their direct keybinds.
  useAmicodeCommands()

  // amicode: starter chips fill this page's composer and submit (start-prompt.ts).
  const startPrompt = (text: string) => startPromptWith(prompt, text)

  // amicode: Resume verb (spec B) — most-recent non-archived problem workspace,
  // or undefined (no chip) on fetch failure / empty. Mirrors session-new-view.
  const [problemsRaw] = createResource(() => amicodeGet(server.current, "/amicode/problems").catch(() => undefined))
  const resumeProblem = createMemo(() => {
    const raw = problemsRaw()
    if (raw === undefined) return undefined
    const view = parseProblemsResponse(raw)
    if (!view.ok) return undefined
    const open = view.problems.filter((p) => p.status !== "archived")
    if (open.length === 0) return undefined
    return [...open].sort((a, b) => (b.recorded ?? "").localeCompare(a.recorded ?? ""))[0]
  })

  const [store, setStore] = createStore({
    worktree: "main",
  })

  const newSessionWorktree = createMemo(() => {
    if (store.worktree === "create") return "create"
    const project = sync.project
    if (project && sdk.directory !== project.worktree) return sdk.directory
    return "main"
  })

  createEffect(() => {
    if (!prompt.ready()) return
    untrack(() => {
      const text = searchParams.prompt
      if (!text) return
      prompt.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
      setSearchParams({ ...searchParams, prompt: undefined })
    })
  })

  onMount(() => {
    requestAnimationFrame(() => inputRef?.focus())
  })

  return (
    <div class="relative size-full overflow-hidden flex flex-col">
      {/* Kate 2026-07-25: no bottom padding on the landing — the composer dock
          reaches the very bottom of the screen (top corners stay rounded). */}
      <div class="flex-1 min-h-0 flex flex-col gap-2 p-2 pb-0">
        <div class="@container relative flex flex-col min-h-0 h-full bg-background-stronger flex-1">
          {/* relative isolate: own stacking context so the brain layer (-z-10)
              sits above this card's surface but beneath the draft content */}
          <div class="relative isolate flex-1 min-h-0 overflow-hidden rounded-t-[10px]">
            {/* amicode: the draft page's Brain background — the EMPTY landing
                shows the full latent constellation ("everything amico could
                think") rotating at rest; the first prompt send ignites the
                handoff and the promoted session mounts its live graph */}
            <BrainAtmosphere class="-z-10" mode="constellation" ignite={ignited()} />
            {/* Kate 2026-07-25: the starter-chip wall is removed — it competed
                with the constellation + composer. Discovery now lives inside the
                composer as a rotating placeholder that cycles the starter prompts
                (prompt-input.tsx), so the resting landing is just hero + CTA. */}
            <NewSessionDesignView>
              <SessionComposerRegion
                state={composer}
                ready
                centered={false}
                placement="inline"
                inputRef={(el) => {
                  inputRef = el
                }}
                newSessionWorktree={newSessionWorktree()}
                onNewSessionWorktreeReset={() => setStore("worktree", "main")}
                onSubmit={() => {
                  setIgnited(true) // first prompt sent: hand the Brain off
                  comments.clear()
                }}
                onResponseSubmit={() => {}}
                setPromptDockRef={() => {}}
              />
            </NewSessionDesignView>
          </div>
        </div>
      </div>
    </div>
  )
}
