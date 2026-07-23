import { createEffect, createMemo, createResource, createSignal, onMount, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"
import { NewSessionDesignView } from "@/components/session"
import { parseProfileResponse } from "@opencode-ai/ui/amicode-home-cards"
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

  // First-run setup nudge (ADR 0001): non-gating. Shown on the landing when the
  // researcher profile is still the default/unset, until they dismiss it. The
  // action is conversational — onboarding rides the chat (the overture interview)
  // rather than a modal wizard. Per-step (vault/Julia/connection) progress needs
  // an extension→app bridge and is deferred.
  const [profileRaw] = createResource(() => amicodeGet(server.current, "/amicode/profile").catch(() => undefined))
  const [nudgeDismissed, setNudgeDismissed] = createSignal(
    typeof localStorage !== "undefined" && localStorage.getItem("amicode.setupNudgeDismissed") === "1",
  )
  const needsSetup = createMemo(() => {
    const raw = profileRaw()
    if (raw === undefined) return false
    const view = parseProfileResponse(raw)
    if (!view.ok) return false
    return !view.you.affiliation || view.you.name === "Practitioner"
  })
  const showSetupNudge = () => needsSetup() && !nudgeDismissed()
  const dismissNudge = () => {
    setNudgeDismissed(true)
    try {
      localStorage.setItem("amicode.setupNudgeDismissed", "1")
    } catch {
      /* private mode / no storage — nudge simply reappears next launch */
    }
  }

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
                // Chips persist while typing (Kate: no jump). They disappear on
                // submit, when this page navigates to the real session — so no
                // dirty()-gated fade that yanks the layout mid-keystroke.
                <>
                  <Show when={showSetupNudge()}>
                    <div class="w-full flex justify-center mb-4">
                      <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-background-stronger text-13-regular">
                        <span class="text-text-base">Finish setting up Amico — profile, backend, and vault.</span>
                        <button
                          type="button"
                          class="text-text-strong font-medium hover:underline"
                          onClick={() =>
                            startPrompt(
                              "Help me finish setting up Amico: my researcher profile, a backend connection, and a vault.",
                            )
                          }
                        >
                          Start setup
                        </button>
                        <button
                          type="button"
                          aria-label="Dismiss setup nudge"
                          class="text-text-weak hover:text-text-base"
                          onClick={dismissNudge}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </Show>
                  <AmicodeStarterChips
                    onStart={startPrompt}
                    resumeName={resumeProblem()?.name}
                    onResume={() => {
                      const name = resumeProblem()?.name
                      if (name) startPrompt(`Open the problem "${name}" and continue where we left off`)
                    }}
                  />
                </>
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
