import { createPromptProjectController } from "@/components/prompt-project-selector"
import { useTitlebarRightMount } from "@/components/titlebar"
import { useSettings } from "@/context/settings"
import { createEffect, createMemo, createResource, onMount } from "solid-js"
import { useLocation } from "@solidjs/router"
import { createNewSessionDraftController } from "./new-session/new-session-draft-controller"
import { NewSessionStatus, NewSessionView } from "./new-session/new-session-view"
import { createNewSessionWorkspaceController } from "./new-session/new-session-workspace-controller"
import { useNewSessionCommands } from "./new-session/use-new-session-commands"
import { usePrompt } from "@/context/prompt"
import { useServer } from "@/context/server"
import { startPrompt as startPromptWith } from "@/utils/start-prompt"
import { postRouteInfo } from "@/utils/amicode-route-info"
import { amicodeGet } from "@/utils/amicode-fetch"
import { parseProblemsResponse } from "@opencode-ai/ui/amicode-problem-switcher"
import { AmicodeStarterChips, AMICODE_STARTERS, type StarterChip } from "@opencode-ai/ui/amicode-getting-started"
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
  const location = useLocation()

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

  // amicode: dynamic chip ranking (2026-08-01 — chips under the composer,
  // earned not static). Problem workspaces are all status "designing", so the
  // rank keys off recency + entity_kinds: a `pulse` entity means a banked
  // pulse (warm-startable); a `run` without a `pulse` means the attempt
  // stalled (retry-able); anything recent is resume-able. Capped at 4, padded
  // to 3 with the static starters when history is thin, static-only when
  // there's no history at all.
  const chips = createMemo((): StarterChip[] => {
    const raw = problemsRaw()
    if (raw === undefined) return AMICODE_STARTERS.map((s) => ({ label: s.label, prompt: s.prompt }))
    const view = parseProblemsResponse(raw)
    if (!view.ok) return AMICODE_STARTERS.map((s) => ({ label: s.label, prompt: s.prompt }))
    const open = [...view.problems.filter((p) => p.status !== "archived")].sort((a, b) =>
      (b.recorded ?? "").localeCompare(a.recorded ?? ""),
    )
    const out: StarterChip[] = []
    const seen = new Set<string>()
    const resume = open[0]
    if (resume) {
      out.push({
        label: `Resume ${resume.name}`,
        prompt: `Open the problem "${resume.name}" and continue where we left off`,
        dataSlot: "amicode-gs-resume",
      })
      seen.add(resume.slug)
    }
    const banked = open.find((p) => !seen.has(p.slug) && p.entityKinds.includes("pulse"))
    if (banked) {
      out.push({
        label: `Warm-start from ${banked.name}`,
        prompt: `Warm-start a new solve from the banked pulse on "${banked.name}"`,
        dataSlot: "amicode-gs-warmstart",
      })
      seen.add(banked.slug)
    }
    const stalled = open.find(
      (p) => !seen.has(p.slug) && p.entityKinds.includes("run") && !p.entityKinds.includes("pulse"),
    )
    if (stalled) {
      out.push({
        label: `Retry ${stalled.name}`,
        prompt: `Pick back up "${stalled.name}" — the last attempt stalled without a banked pulse. Diagnose what happened and try again`,
        dataSlot: "amicode-gs-retry",
      })
      seen.add(stalled.slug)
    }
    for (const starter of AMICODE_STARTERS) {
      if (out.length >= 3) break
      out.push({ label: starter.label, prompt: starter.prompt })
    }
    return out.slice(0, 4)
  })

  createEffect(() => {
    if (!draft.prompt.ready()) return
    draft.input.restoreFocus()
  })

  onMount(() => {
    // amicode(deck): label the framing pane tab; the draftId rides the search
    // so the shell can rebuild this pane with its draft text intact.
    postRouteInfo(`${location.pathname}${location.search}`, "New session")
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
        {/*
          amicode: chips ride inside the hero view now (Kimi ordering — brand →
          composer → chips), ranked from the problem history: Resume →
          Warm-start → Retry → static pad. They persist while typing and
          disappear on submit, when this page navigates to the real session.
        */}
        <NewSessionView
          input={draft.input}
          project={project}
          workspace={workspace}
          gettingStarted={<AmicodeStarterChips onStart={startPrompt} chips={chips()} />}
        />
      </div>
    </div>
  )
}
