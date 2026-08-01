import { createPromptProjectController } from "@/components/prompt-project-selector"
import { useTitlebarRightMount } from "@/components/titlebar"
import { useSettings } from "@/context/settings"
import { createEffect, createMemo, createResource } from "solid-js"
import { createNewSessionDraftController } from "./new-session/new-session-draft-controller"
import { NewSessionStatus, NewSessionView } from "./new-session/new-session-view"
import { createNewSessionWorkspaceController } from "./new-session/new-session-workspace-controller"
import { useNewSessionCommands } from "./new-session/use-new-session-commands"
import { usePrompt } from "@/context/prompt"
import { useServer } from "@/context/server"
import { startPrompt as startPromptWith } from "@/utils/start-prompt"
import { amicodeGet } from "@/utils/amicode-fetch"
import { parseProblemsResponse } from "@opencode-ai/ui/amicode-problem-switcher"
import { AmicodeStarterChips } from "@opencode-ai/ui/amicode-getting-started"
import { useAmicodeCommands } from "@/pages/session/use-amicode-commands"

/** The draft-only V2 session page. Submitting promotes the draft into a real session. */
export default function NewSessionPage() {
  const settings = useSettings()
  const rightMount = useTitlebarRightMount()
  const workspace = createNewSessionWorkspaceController()
  const draft = createNewSessionDraftController({
    worktree: workspace.selection.value,
    resetWorktree: workspace.selection.reset,
  })
  const project = createPromptProjectController({
    controls: draft.project.controls,
    onDone: draft.input.restoreFocus,
  })
  useNewSessionCommands({
    restoreFocus: draft.input.restoreFocus,
    project: {
      empty: project.empty,
      open: () => project.setOpen(true),
    },
  })

  // amicode: register the Amico ops commands here too — the draft page has no
  // palette, so restart/update-memory are reachable via their direct keybinds.
  useAmicodeCommands()

  // amicode: starter chips fill this page's composer and submit (start-prompt.ts).
  const prompt = usePrompt()
  const startPrompt = (text: string) => startPromptWith(prompt, text)

  // amicode: Resume verb (spec B) — most-recent non-archived problem workspace,
  // or undefined (no chip) on fetch failure / empty. Mirrors session-new-view.
  const server = useServer()
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

  createEffect(() => {
    if (!draft.prompt.ready()) return
    draft.input.restoreFocus()
  })
  const ready = Promise.resolve()
  const [suspendUntilPromptReady] = createResource(
    () => draft.prompt.readyPromise() ?? ready,
    (promise) => promise.then(() => true),
  )

  return (
    <div class="relative size-full overflow-hidden flex flex-col">
      {suspendUntilPromptReady()}
      <NewSessionStatus mount={rightMount} visible={settings.visibility.status} />
      <div class="flex-1 min-h-0 flex flex-col gap-2 p-2">
        <NewSessionView input={draft.input} project={project} workspace={workspace} />
        {/*
          amicode: starter chips + Resume chip (Kate: no jump — they persist
          while typing and disappear on submit, when this page navigates to the
          real session; no dirty()-gated fade that yanks the layout
          mid-keystroke). Mounted from the page, below the hero view, because
          upstream's NewSessionView has no getting-started slot.
        */}
        <div class="flex shrink-0 justify-center pb-1">
          <AmicodeStarterChips
            onStart={startPrompt}
            resumeName={resumeProblem()?.name}
            onResume={() => {
              const name = resumeProblem()?.name
              if (name) startPrompt(`Open the problem "${name}" and continue where we left off`)
            }}
          />
        </div>
      </div>
    </div>
  )
}
