import { createEffect, createMemo, createResource, onMount, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"
import { NewSessionDesignView } from "@/components/session"
import { useComments } from "@/context/comments"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useServer } from "@/context/server"
import { startPrompt as startPromptWith } from "@/utils/start-prompt"
import { amicodeGet } from "@/utils/amicode-fetch"
import { parseProblemsResponse } from "@opencode-ai/ui/amicode-problem-switcher"
import { AmicodeGettingStarted } from "@opencode-ai/ui/amicode-getting-started"
import { createSessionComposerState, SessionComposerRegion } from "@/pages/session/composer"

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
      <div class="flex-1 min-h-0 flex flex-col gap-2 p-2">
        <div class="@container relative flex flex-col min-h-0 h-full bg-background-stronger flex-1">
          <div class="flex-1 min-h-0 overflow-hidden rounded-[10px]">
            <NewSessionDesignView
              gettingStarted={
                <AmicodeGettingStarted
                  onStart={startPrompt}
                  showSteps={false}
                  resumeName={resumeProblem()?.name}
                  onResume={() => {
                    const name = resumeProblem()?.name
                    if (name) startPrompt(`Open the problem "${name}" and continue where we left off`)
                  }}
                />
              }
            >
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
                onSubmit={() => comments.clear()}
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
