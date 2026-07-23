import { AmicoSpinner } from "@opencode-ai/ui/amico-spinner"
import type { Session } from "@opencode-ai/sdk/v2/client"
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  createSignal,
} from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createStore } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { useTabs } from "@/context/tabs"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { useLayout, type LocalProject } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useDirectoryPicker } from "@/components/directory-picker"
import { DialogSelectServer, useServerManagementController } from "@/components/dialog-select-server"
import { DialogServerV2 } from "@/components/settings-v2/dialog-server-v2"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import {
  closeHomeProject,
  displayName,
  homeProjectDirectories,
  homeProjectNavigation,
  type HomeProjectSelection,
  projectForSession,
  sortedRootSessions,
  toggleHomeProjectSelection,
} from "@/pages/layout/helpers"
import { sessionTitle } from "@/utils/session-title"
import { showToast } from "@/utils/toast"
import { hiddenProjectWorktree } from "@/utils/amicode-hidden-project"
import { announceChromeDropdown, chromeDropdownOpenId, clearChromeDropdown } from "@/utils/chrome-dropdown"
import { pathKey } from "@/utils/path-key"
import { useGlobal } from "@/context/global"
import { useCommand } from "@/context/command"
import { useSettings } from "@/context/settings"
import { ServerRowMenu } from "@/components/server/server-row-menu"
import { ServerHealthIndicator } from "@/components/server/server-row"
import { type ServerHealth } from "@/utils/server-health"
import { amicodeGet, amicodePost } from "@/utils/amicode-fetch"
import { AmicodeRunGallery } from "@opencode-ai/ui/amicode-run-gallery"
import { AmicodeOnboardingWizard, shouldShowWizard } from "@opencode-ai/ui/amicode-onboarding-wizard"
import { AMICODE_MANAGE_VAULTS_PROMPT } from "@opencode-ai/ui/amicode-vaults-tab"
import { AmicodeDefaultsCapsule, type AmicodeComputeControl } from "@/components/amicode-defaults-capsule"
import { createAmicodeConnectionsState } from "@/components/status-popover-body"
import { COMPANY_COMPUTE_ID } from "@opencode-ai/ui/amicode-connections-tab"
import { GlobalConnectionsPopover } from "@/components/status-popover"
import { parseRunCardsResponse } from "@opencode-ai/ui/amicode-run-card"
import { AmicodeHomeCards, parseProfileResponse, type HomeLiveRun } from "@opencode-ai/ui/amicode-home-cards"
import {
  WidgetGrid,
  parseWidgetsResponse,
  parseDashboardResponse,
  resolveTokens,
  densityForViewport,
  suggestInstitutions,
  resolveBrandLogo,
  type DashboardState,
  type Density,
  type WidgetHostCallbacks,
} from "@opencode-ai/ui/amicode-widget-grid"
import { parseRunSeriesResponse } from "@opencode-ai/ui/amicode-run-window"
import { parseProblemsResponse } from "@opencode-ai/ui/amicode-problem-switcher"
import { parseProblemResponse } from "@opencode-ai/ui/amicode-entity-view"
import { Mark } from "@opencode-ai/ui/logo"
import { AmicodeFooter } from "@opencode-ai/ui/amicode-footer"

const HOME_SESSION_LIMIT = 64
const HOME_ROW_LAYOUT =
  "flex min-w-0 w-full shrink-0 cursor-default items-center rounded-[6px] bg-transparent text-left transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out focus-visible:outline-none"
const HOME_PROJECT_NAV_LABEL = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
// amicode#203: session rows share the project row's rhythm (h-7, px-1.5, rounded)
// but read as CHILDREN — lighter weight, muted until hover, and (when nested)
// indented to align under the project name. A plain overlay hover, vs the
// project row's bordered select, keeps the parent/child hierarchy legible.
const HOME_SESSION_ROW = `${HOME_ROW_LAYOUT} h-7 gap-2 px-1.5 [font-weight:440] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base`
// amicode#203 (Kate): no border on hover/selected — background-only treatment.
const HOME_PROJECT_NAV_ROW = `${HOME_ROW_LAYOUT} h-7 gap-2 px-1.5 [font-weight:440] text-v2-text-text-muted hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base data-[selected]:bg-v2-background-bg-layer-02 data-[selected]:text-v2-text-text-base data-[selected]:hover:bg-v2-background-bg-layer-02 focus-visible:bg-v2-background-bg-layer-01 focus-visible:text-v2-text-text-base`
const HOME_SECTION_LABEL = "text-v2-text-text-muted [font-weight:440]"

type HomeSessionRecord = {
  session: Session
  project: LocalProject
  projectName: string
}


const HOME_SESSION_SEARCH_RESULTS_ID = "home-session-search-results"
const HOME_SEARCH_RESULT_ROW =
  "flex h-10 w-full shrink-0 cursor-default items-center gap-2 border-0 py-3 pl-4 pr-6 text-left transition-[background-color] duration-[120ms] ease-in-out hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
const HOME_SEARCH_RESULT_TITLE =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-base [font-weight:530]"
const HOME_SEARCH_RESULT_META =
  "min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]"

let pendingHomeNavigation: { server: ServerConnection.Key; href: string } | undefined

function buildHomeSessionRecords(input: {
  sync: Pick<ReturnType<typeof useServerSync>, "child">
  projectDirectories: () => string[]
  projects: () => LocalProject[]
}) {
  return [
    ...new Map(
      input
        .projectDirectories()
        .flatMap((directory) => sortedRootSessions(input.sync.child(directory, { bootstrap: false })[0], Date.now()))
        .map((session) => [`${pathKey(session.directory)}:${session.id}`, session] as const),
    ).values(),
  ]
    .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    .flatMap((session) => {
      // amicode#203: resolve by DIRECTORY, not projectID. opencode lumps every
      // amicode directory under a single `global` project id, so id-based
      // resolution (projectForSession's default) collapses all sessions onto one
      // project. The dashboard's projects ARE directories, so an empty byID map
      // forces projectForSession to match session.directory → project.worktree.
      const project = projectForSession(session, input.projects(), new Map())
      // amicode#203 AC7: a session whose directory matches no registered
      // project is an ORPHAN — surfaced under its directory, never dropped
      // (the old `return []` silently hid ghost sessions).
      if (!project) {
        const dir = session.directory
        const base = dir.split("/").filter(Boolean).pop() ?? dir
        return {
          session,
          project: { worktree: dir, expanded: false } as LocalProject,
          projectName: base,
        }
      }
      return {
        session,
        project,
        // amicode#203: sessions in the extension's scaffold project show
        // unlabeled (the scaffold is hidden from the switcher; its name never
        // surfaces). Real projects keep their display name.
        projectName: project.worktree === hiddenProjectWorktree() ? "" : displayName(project),
      }
    })
}

function matchesHomeSessionSearch(record: HomeSessionRecord, query: string) {
  return `${record.session.title} ${record.projectName}`.toLowerCase().includes(query)
}

function homeSessionSearchKey(record: HomeSessionRecord) {
  return `${pathKey(record.session.directory)}:${record.session.id}`
}

export default function Home() {
  const settings = useSettings()
  return (
    <Show when={settings.general.newLayoutDesigns()} fallback={<LegacyHome />}>
      <HomeDesign />
    </Show>
  )
}

function HomeDesign() {
  const sync = useServerSync()
  const layout = useLayout()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const global = useGlobal()
  const command = useCommand()
  const notification = useNotification()

  // amicode#200: the defaults capsule owns the Company Compute connection —
  // an always-warm connections instance so the HP dot is truthful from mount
  // (popover instances stay open-gated; mutations reconcile via fresh GETs).
  const chromeConnections = createAmicodeConnectionsState(() => true)
  const computeControl: AmicodeComputeControl = {
    view: () => chromeConnections.connectionsView()?.connections.find((c) => c.id === COMPANY_COMPUTE_ID),
    // capsule mount: the connect form sits directly under the status line, so
    // the "— enter a key to connect" guidance is redundant there (Kate). The
    // Connections tab keeps the full copy.
    labels: () => {
      const base = chromeConnections.connectionsLabels()
      return { ...base, states: { ...base.states, "needs-key": "Not connected" } }
    },
    actionError: chromeConnections.connectionsActionError,
    onSubmit: chromeConnections.onSubmitCredential,
    onDisconnect: chromeConnections.onDisconnectConnection,
    onRevalidate: chromeConnections.onRevalidateConnection,
    refetch: chromeConnections.refetchConnections,
  }
  let focusSessionSearch: (() => void) | undefined
  const [state, setState] = createStore({
    search: "",
    selection: { server: server.key } as HomeProjectSelection,
    searchFocused: false,
  })

  const focusedServer = createMemo(
    () => global.servers.list().find((conn) => ServerConnection.key(conn) === state.selection.server) ?? server.current,
  )
  const focusedServerCtx = createMemo(() => {
    const conn = focusedServer()
    if (!conn) return
    return global.createServerCtx(conn)
  })
  const focusedSync = () => focusedServerCtx()?.sync ?? sync
  const projects = createMemo(() => focusedServerCtx()?.projects.list() ?? layout.projects.list())
  // amicode#203: the project SWITCHER hides the extension's scaffold project
  // (it's the server's cwd, not a user project) — but records()/projectDirectories
  // still use the full `projects()`, so the sessions that land in the scaffold by
  // default stay visible in Recent (labeled neutrally, see buildHomeSessionRecords).
  // Only set in the amicode webview; standalone opencode is untouched.
  const visibleProjects = createMemo(() => {
    const hidden = hiddenProjectWorktree()
    return hidden ? projects().filter((p) => p.worktree !== hidden) : projects()
  })
  const selectedProject = createMemo(() => projects().find((project) => project.worktree === state.selection.directory))
  const newSessionProject = createMemo(
    () =>
      selectedProject() ??
      projects().find((project) => project.worktree === focusedServerCtx()?.projects.last()) ??
      projects()[0],
  )
  const directories = (project: LocalProject) => [project.worktree, ...(project.sandboxes ?? [])]
  // amicode#203: the dashboard shows ONE flat "all sessions" list PLUS per-project
  // lists, so it must load EVERY project's sessions regardless of selection.
  // Scoping to the selected project (the old behavior) made the flat list flip
  // empty/populated with selection and hid non-selected projects' sessions.
  const projectDirectories = createMemo(() => projects().flatMap(directories))
  const search = createMemo(() => state.search.trim())
  const sessionLoad = useQuery(() => ({
    queryKey: ["home", "sessions", state.selection.server, ...projectDirectories()] as const,
    queryFn: async () => {
      await Promise.all(
        projectDirectories().map((directory) =>
          focusedSync().project.loadSessions(directory, { limit: HOME_SESSION_LIMIT }),
        ),
      )
      return null
    },
  }))

  const allRecords = createMemo(() =>
    buildHomeSessionRecords({
      sync: focusedSync(),
      projectDirectories,
      projects,
    }),
  )
  const records = createMemo(() => allRecords().slice(0, HOME_SESSION_LIMIT))
  const searchResults = createMemo(() => {
    const query = search().toLowerCase()
    if (!query) return []
    return allRecords().filter((record) => matchesHomeSessionSearch(record, query))
  })
  const searchOpen = createMemo(() => state.searchFocused && search().length > 0)
  const tabs = useTabs()

  // amicode: home-card data. All read from the focused server's /amicode/* raw
  // routes (~/.amico). Each degrades to undefined on failure so a card simply
  // doesn't render (no empty chrome) rather than erroring the whole page.
  const [profileRaw, { refetch: refetchProfile }] = createResource(
    () => state.selection.server,
    () => amicodeGet(focusedServer(), "/amicode/profile").catch(() => undefined),
  )
  const profileView = createMemo(() => {
    const raw = profileRaw()
    return raw === undefined ? undefined : parseProfileResponse(raw)
  })
  const [problemsRaw] = createResource(
    () => state.selection.server,
    () => amicodeGet(focusedServer(), "/amicode/problems").catch(() => undefined),
  )
  const resumeProblem = createMemo(() => {
    const raw = problemsRaw()
    if (raw === undefined) return undefined
    const view = parseProblemsResponse(raw)
    if (!view.ok) return undefined
    const open = view.problems.filter((p) => p.status !== "archived")
    if (open.length === 0) return undefined
    return [...open].sort((a, b) => (b.recorded ?? "").localeCompare(a.recorded ?? ""))[0]
  })
  const [resumeDetailRaw] = createResource(
    () => resumeProblem()?.slug,
    (slug) => amicodeGet(focusedServer(), `/amicode/problem?slug=${encodeURIComponent(slug)}`).catch(() => undefined),
  )
  const resumeMeta = createMemo(() => {
    const raw = resumeDetailRaw()
    if (raw === undefined) return undefined
    const view = parseProblemResponse(raw) as { ok: boolean; entities?: Record<string, any> }
    if (!view.ok || !view.entities) return undefined
    const parts = [
      view.entities.system?.platform,
      view.entities.formulation?.target,
      view.entities.formulation?.objective,
    ].filter((v): v is string => typeof v === "string" && v.trim() !== "")
    return parts.length > 0 ? parts.join(" · ") : undefined
  })

  // amicode (spec C): "Now solving" — light live readout of the active problem's
  // in-flight run. Polls run-status + run-series only while a run is solving; the
  // interval self-terminates once status leaves "solving". All failures collapse
  // to undefined so the card simply doesn't render.
  // amicode: run gallery (shareable solve cards) — fetched on open, newest first.
  const [galleryOpen, setGalleryOpen] = createSignal(false)
  const [runCardsRaw] = createResource(
    () => (galleryOpen() ? state.selection.server : undefined),
    () => amicodeGet(focusedServer(), "/amicode/run-cards").catch(() => undefined),
  )
  const runCards = createMemo(() => {
    if (!galleryOpen()) return undefined
    const raw = runCardsRaw()
    return raw === undefined ? undefined : parseRunCardsResponse(raw)
  })
  // PNG save: downloads are dead inside the webview iframe — route through the
  // extension's save-file bridge; plain browsers use the gallery's <a download>.
  const saveCardPng = (filename: string, dataUrl: string) => {
    window.parent.postMessage({ source: "amicode", kind: "save-file", filename, dataUrl }, "*")
  }

  const [runStatusRaw, { refetch: refetchRunStatus }] = createResource(
    () => state.selection.server,
    () => amicodeGet(focusedServer(), "/amicode/run-status").catch(() => undefined),
  )
  const solvingRun = createMemo(() => {
    const raw = runStatusRaw()
    if (typeof raw !== "object" || raw === null) return undefined
    const view = raw as { ok?: boolean; runs?: any[] }
    if (view.ok !== true || !Array.isArray(view.runs)) return undefined
    const solving = view.runs.find((r) => r && typeof r.run_id === "string" && r.status === "solving")
    if (!solving) return undefined
    return {
      runId: solving.run_id as string,
      iteration: typeof solving.iteration === "number" ? solving.iteration : null,
      fidelity: typeof solving.fidelity === "number" ? solving.fidelity : null,
    }
  })
  const solvingRunId = createMemo(() => solvingRun()?.runId)
  const [runSeriesRaw, { refetch: refetchRunSeries }] = createResource(
    () => solvingRunId(),
    (runId) =>
      amicodeGet(focusedServer(), `/amicode/run-series?run=${encodeURIComponent(runId)}`).catch(() => undefined),
  )
  const liveRun = createMemo<HomeLiveRun | undefined>(() => {
    const solving = solvingRun()
    if (!solving) return undefined
    const raw = runSeriesRaw()
    const view = raw === undefined ? undefined : parseRunSeriesResponse(raw)
    const run = view?.ok ? view.run : undefined
    // convergence curve = log10 of the objective (spans orders of magnitude)
    const series = run ? run.series.map((p) => Math.log10(Math.max(p.f, 1e-12))) : []
    // Only show F once it's a valid fidelity (final, or 1 - f with f < 1). Early
    // in a solve the objective f ≫ 1, so leave F blank rather than misleading.
    const derivedF = run?.fidelity ?? (run && run.lastF !== null && run.lastF < 1 ? 1 - run.lastF : null)
    return {
      name: resumeProblem()?.name,
      iteration: run?.iteration ?? solving.iteration,
      fidelity: derivedF,
      series,
      // pulse-first sparkline: the tile shows the artifact once a snapshot streams
      pulse: run?.pulse?.values,
      drives: run?.pulseMeta?.drives,
    }
  })
  createEffect(() => {
    // Standing slow poll while Home is mounted (a solve STARTED from chat must
    // surface here without a remount), tightening to 2.5s while one is live.
    const live = Boolean(solvingRunId())
    const timer = setInterval(
      () => {
        void refetchRunStatus()
        if (live) void refetchRunSeries()
      },
      live ? 2500 : 5000,
    )
    onCleanup(() => clearInterval(timer))
  })

  // Shared by the About-You card and the onboarding wizard: identity fields
  // ride query params on the raw POST route; refetch renders the saved state.
  async function saveProfileFields(fields: Record<string, string | undefined>) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) q.set(k, v)
    await amicodePost(focusedServer(), `/amicode/profile?${q.toString()}`)
    await refetchProfile()
  }

  // Onboarding wizard (session zero): decided ONCE when the profile first
  // resolves — the mid-wizard profile refetch must not unmount the preview
  // step, and a dismiss is remembered per install (localStorage).
  // Library (papers that make Amico smarter): count + latest for the card.
  const [libraryRaw, { refetch: refetchLibrary }] = createResource(
    () => state.selection.server,
    () => amicodeGet(focusedServer(), "/amicode/library").catch(() => undefined),
  )
  const libraryView = createMemo(() => {
    const raw = libraryRaw() as { ok?: boolean; papers?: { name?: string; path?: string }[] } | undefined
    if (!raw || raw.ok !== true || !Array.isArray(raw.papers)) return undefined
    return {
      count: raw.papers.length,
      latestName: typeof raw.papers[0]?.name === "string" ? raw.papers[0].name : undefined,
      latestPath: typeof raw.papers[0]?.path === "string" ? raw.papers[0].path : undefined,
    }
  })
  async function uploadPaper(filename: string, dataB64: string) {
    const res = await amicodePost(focusedServer(), "/amicode/library", { filename, data_b64: dataB64 })
    if ((res as { ok?: boolean } | undefined)?.ok !== true) throw new Error("library save rejected")
    await refetchLibrary()
  }
  // Onboarding-wizard finale: attach an existing vault (clone repo / symlink a
  // local vault dir into the vaults root). The server returns {ok,name,error};
  // map failures to a human-readable message for the wizard to surface.
  async function attachVault(ref: string): Promise<{ name: string }> {
    const res = (await amicodePost(focusedServer(), "/amicode/vaults", { ref })) as
      | { ok?: boolean; name?: string; error?: string }
      | undefined
    if (res?.ok === true && typeof res.name === "string") return { name: res.name }
    const code = (res?.error ?? "").split(":")[0]
    const message =
      code === "exists"
        ? "That vault is already attached."
        : code === "not_a_vault"
          ? "That folder isn't a vault (no .amico-vault.toml marker)."
          : code === "clone_failed"
            ? "Couldn't clone that repo — check the name and that you have access."
            : code === "bad_request"
              ? "Enter a repo (owner/repo), a git URL, or a local path."
              : "Couldn't attach that vault."
    throw new Error(message)
  }

  // amicode (widget kernel): registry + dashboard state + per-widget module
  // code. Everything degrades to undefined → the page falls back to the
  // legacy hardcoded cards, so a server without the widget routes still
  // renders a full home.
  const [widgetsRaw, { refetch: refetchWidgets }] = createResource(
    () => state.selection.server,
    () => amicodeGet(focusedServer(), "/amicode/widgets").catch(() => undefined),
  )
  const widgetInfos = createMemo(() => {
    const raw = widgetsRaw()
    return raw === undefined ? [] : parseWidgetsResponse(raw)
  })
  const [dashboardRaw] = createResource(
    () => state.selection.server,
    () => amicodeGet(focusedServer(), "/amicode/dashboard").catch(() => undefined),
  )
  // local state wins after a save (POST returns the stored merged result)
  const [savedDashboard, setSavedDashboard] = createSignal<DashboardState | undefined>(undefined)
  const dashboard = createMemo<DashboardState | undefined>(() => {
    const local = savedDashboard()
    if (local) return local
    const raw = dashboardRaw()
    return raw === undefined ? undefined : parseDashboardResponse(raw)
  })
  // Frame documents are server-served (own CSP header — srcdoc would inherit
  // the app CSP and kill the inline runtime). The registry hash rides the URL
  // so a widget edit busts the frame cache.
  const widgetFrameSrcs = createMemo(() => {
    const conn = focusedServer()
    if (!conn) return {}
    const out: Record<string, string> = {}
    for (const w of widgetInfos())
      out[w.id] = new URL(`/amicode/widget-frame?id=${encodeURIComponent(w.id)}&h=${w.hash}`, conn.http.url).toString()
    return out
  })

  // --amc-* theme tokens + density: recomputed on resize and on root-element
  // attribute flips (theme toggle). Widgets receive updates over the bridge.
  const readTokens = () => {
    const style = getComputedStyle(document.documentElement)
    // panel-first (spec T3.4): width axis matters when Amicode is half an editor
    const density: Density = densityForViewport(window.innerWidth, window.innerHeight)
    return { tokens: resolveTokens((name) => style.getPropertyValue(name), density), density }
  }
  const [themeState, setThemeState] = createSignal(readTokens())
  createEffect(() => {
    const refresh = () => setThemeState(readTokens())
    window.addEventListener("resize", refresh)
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, { attributes: true })
    onCleanup(() => {
      window.removeEventListener("resize", refresh)
      observer.disconnect()
    })
  })

  const widgetContext = createMemo(() => ({
    resume: resumeProblem()?.name ? { name: resumeProblem()!.name, meta: resumeMeta() } : undefined,
    liveRun: liveRun(),
    library: libraryView(),
  }))

  const widgetCallbacks: WidgetHostCallbacks = {
    fetch: (path) => amicodeGet(focusedServer(), path),
    action: async (verb, payload) => {
      const p = (payload ?? {}) as Record<string, unknown>
      const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "")
      switch (verb) {
        case "resume-session": {
          const name = resumeProblem()?.name
          if (name) startWithPrompt(`Open the problem "${name}" and continue where we left off`)
          return { ok: true }
        }
        case "save-profile": {
          await saveProfileFields({
            name: str("name") || undefined,
            affiliation: str("affiliation") || undefined,
            focus: str("focus") || undefined,
            scholar: str("scholar") || undefined,
            affiliation_logo: str("affiliation_logo") || undefined,
          })
          return { ok: true }
        }
        case "lookup-institution":
          return suggestInstitutions(str("query"))
        case "resolve-logo":
          return { logo: await resolveBrandLogo(str("name"), str("domain")) }
        case "open-external": {
          const url = str("url")
          if (url && window.parent !== window)
            window.parent.postMessage({ source: "amicode", kind: "open-external", url }, "*")
          return { ok: true }
        }
        case "upload-library":
          await uploadPaper(str("filename"), str("dataB64"))
          return { ok: true }
        case "open-gallery":
          setGalleryOpen(true)
          return { ok: true }
        case "warm-start":
          startWithPrompt("warm-start a new solve from my pulse bank")
          return { ok: true }
        default:
          throw new Error(`unknown action: ${verb}`)
      }
    },
    prompt: startWithPrompt,
    open: (entity) => {
      if (entity === "run") {
        const name = resumeProblem()?.name
        if (name) startWithPrompt(`Open the problem "${name}" and show me the running solve`)
      }
    },
  }

  const saveDashboard = (next: DashboardState) => {
    setSavedDashboard(next) // optimistic — instant reorder/hide feedback
    void amicodePost(focusedServer(), "/amicode/dashboard", next)
      .then((res) => {
        const merged = parseDashboardResponse(res)
        if (merged) setSavedDashboard(merged)
      })
      .catch(() => {})
  }
  const WIZARD_DISMISS_KEY = "amicode-onboarding-dismissed"
  const [wizardOpen, setWizardOpen] = createSignal(false)
  let wizardDecided = false
  createEffect(() => {
    const view = profileView()
    if (wizardDecided || view === undefined || !view.ok) return
    wizardDecided = true
    let dismissed = false
    try {
      dismissed = localStorage.getItem(WIZARD_DISMISS_KEY) === "1"
    } catch {
      /* storage unavailable → treat as not dismissed */
    }
    setWizardOpen(shouldShowWizard(view.you, dismissed))
  })
  const dismissWizard = () => {
    try {
      localStorage.setItem(WIZARD_DISMISS_KEY, "1")
    } catch {
      /* best-effort */
    }
    setWizardOpen(false)
  }

  function startWithPrompt(prompt: string) {
    const project = newSessionProject()
    if (project) {
      tabs.newDraft({ server: server.key, directory: project.worktree }, prompt)
      return
    }
    // No tracked projects (fresh profile against a bare `opencode serve`):
    // openNewSession() would dead-end silently here — it needs the same
    // newSessionProject() that just came back empty. Fall back to the server's
    // own working directory (path.directory, synced from GET /path; "" until
    // loaded) and start tracking it, so the home CTAs work on first visit.
    // Deliberately NOT sync.data.project: its "global" record has worktree "/".
    const conn = focusedServer()
    const directory = focusedSync().data.path.directory
    if (!conn || !directory) return
    const ctx = global.createServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    tabs.newDraft({ server: ServerConnection.key(conn), directory }, prompt)
  }

  function setSelection(next: HomeProjectSelection) {
    batch(() => {
      if (state.selection.server !== next.server) setState("selection", "server", next.server)
      if (state.selection.directory !== next.directory) setState("selection", "directory", next.directory)
    })
  }

  function closeSearch() {
    setState("search", "")
    setState("searchFocused", false)
  }

  function selectSearchSession(session: Session) {
    openSession(session)
    closeSearch()
  }

  // Chrome strip state (spec T3.3): sessions flyout. Grid editing is the
  // WidgetGrid's own affair now (uncontrolled — it renders its own customize).
  const [sessionsOpen, setSessionsOpenRaw] = createSignal(false)
  // amicode#203: one chrome dropdown at a time — announce on open, close when
  // another announces.
  const setSessionsOpen = (next: boolean) => {
    setSessionsOpenRaw(next)
    if (next) announceChromeDropdown("projects")
    else clearChromeDropdown("projects")
  }
  createEffect(() => {
    if (chromeDropdownOpenId() !== "projects" && sessionsOpen()) setSessionsOpenRaw(false)
  })
  let flyoutRoot: HTMLDivElement | undefined
  createEffect(() => {
    if (!sessionsOpen()) return
    const onDown = (e: MouseEvent) => {
      if (flyoutRoot && !flyoutRoot.contains(e.target as Node)) setSessionsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSessionsOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    })
  })

  // Chrome collapse (nav redesign): below the container breakpoint the strip's
  // actions fold behind a hamburger; menuOpen drives that dropdown. Same
  // outside-click / Escape dismissal as the sessions flyout above.
  const [menuOpen, setMenuOpen] = createSignal(false)
  let chromeRoot: HTMLDivElement | undefined
  createEffect(() => {
    if (!menuOpen()) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // Portaled popover content (the Connections entry, #174) counts as
      // inside: closing the dropdown would display:none the popover's anchor
      // mid-interaction. The in-flow panels (capsule, sessions) are already
      // covered by the contains() check.
      if (target instanceof Element && target.closest('[data-component="popover-content"]')) return
      if (chromeRoot && !chromeRoot.contains(target)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    })
  })
  command.register("home", () => [
    {
      id: "home.sessions.search.focus",
      title: language.t("home.sessions.search.placeholder"),
      keybind: "mod+f",
      hidden: true,
      onSelect: () => {
        setSessionsOpen(true) // search lives in the flyout now
        setTimeout(() => focusSessionSearch?.(), 0)
      },
    },
  ])

  createEffect(() => {
    const list = global.servers.list()
    if (list.some((conn) => ServerConnection.key(conn) === state.selection.server)) return
    const conn = list.find((conn) => ServerConnection.key(conn) === server.key) ?? list[0]
    if (conn) setSelection({ server: ServerConnection.key(conn) })
  })

  createEffect(() => {
    const pending = pendingHomeNavigation
    if (!pending || pending.server !== server.key) return
    pendingHomeNavigation = undefined
    navigate(pending.href)
  })

  function focusServer(conn: ServerConnection.Any) {
    setSelection({ server: ServerConnection.key(conn) })
  }

  function selectProject(conn: ServerConnection.Any, directory: string) {
    const key = ServerConnection.key(conn)
    if (
      !global
        .createServerCtx(conn)
        .projects.list()
        .some((project) => project.worktree === directory)
    )
      return
    setSelection(toggleHomeProjectSelection(state.selection, key, directory))
  }

  function addProjects(conn: ServerConnection.Any, directories: string[]) {
    const directory = directories[0]
    if (!directory) return
    const ctx = global.createServerCtx(conn)
    directories.forEach(ctx.projects.open)
    ctx.projects.touch(directory)
    setSelection({ server: ServerConnection.key(conn), directory })
  }

  function openNewSession() {
    const conn = focusedServer()
    const project = newSessionProject()
    if (!conn || !project) return
    openProjectNewSession(conn, project.worktree)
  }

  function navigateOnServer(conn: ServerConnection.Any, href: string) {
    const next = homeProjectNavigation(server.key, ServerConnection.key(conn), href)
    if (!next.server) {
      navigate(next.href)
      return
    }
    pendingHomeNavigation = next
    server.setActive(next.server)
  }

  function openProjectNewSession(conn: ServerConnection.Any, directory: string) {
    const ctx = global.createServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    navigateOnServer(conn, `/${base64Encode(directory)}/session`)
  }

  function editProject(conn: ServerConnection.Any, project: LocalProject) {
    void import("@/components/dialog-edit-project").then((x) => {
      dialog.show(() => <x.DialogEditProject server={conn} project={project} />)
    })
  }

  function unseenCount(conn: ServerConnection.Any, project: LocalProject) {
    if (ServerConnection.key(conn) !== server.key) return 0
    return directories(project).reduce((total, directory) => total + notification.project.unseenCount(directory), 0)
  }

  function clearNotifications(conn: ServerConnection.Any, project: LocalProject) {
    if (ServerConnection.key(conn) !== server.key) return
    directories(project)
      .filter((directory) => notification.project.unseenCount(directory) > 0)
      .forEach((directory) => notification.project.markViewed(directory))
  }

  function openSession(session: Session) {
    // amicode#203: resolve by directory (empty byID) — projectID collapses to
    // `global` across all amicode dirs, so id-resolution would open the wrong
    // project's worktree. Navigation already uses session.directory.
    const project = projectForSession(session, projects(), new Map())
    const conn = focusedServer()
    if (!conn) return
    const directory = project?.worktree ?? session.directory
    const ctx = global.createServerCtx(conn)
    ctx.projects.open(directory)
    ctx.projects.touch(directory)
    navigateOnServer(conn, `/${base64Encode(session.directory)}/session/${session.id}`)
  }

  function chooseProject(conn: ServerConnection.Any) {
    function resolve(result: string | string[] | null) {
      addProjects(conn, homeProjectDirectories(result))
    }

    const server = global.createServerCtx(conn)

    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: resolve,
    })
  }

  // amicode#203: true project creation — the New-project dialog names + creates
  // the directory (server does mkdir + best-effort git init), then we register
  // it and open a first session. "Open existing folder instead…" falls back to
  // chooseProject. git-absent is non-blocking (AC4): a toast, project still opens.
  function newProject(conn: ServerConnection.Any) {
    void import("@/components/dialog-new-project").then((x) => {
      dialog.show(() => (
        <x.DialogNewProject
          server={conn}
          onCreated={({ path, gitInitialized }) => {
            openProjectNewSession(conn, path)
            if (!gitInitialized)
              showToast({
                variant: "default",
                title: "Project created",
                description: "Change tracking is off — git wasn't found on your PATH.",
              })
          }}
          onOpenExisting={() => chooseProject(conn)}
        />
      ))
    })
  }

  function openSettings() {
    void import("@/components/settings-v2").then((x) => {
      dialog.show(() => <x.DialogSettings />)
    })
  }

  return (
    <div class="rounded-[10px] shadow-[var(--v2-elevation-raised)] m-2 min-h-0 md:overflow-hidden bg-v2-background-bg-base self-stretch flex-1">
      <div
        data-slot="amicode-home-shell"
        class="mx-auto flex w-full h-full min-h-0 max-w-[1440px] flex-col gap-6 overflow-y-auto px-8 pt-10 pb-6"
      >
        {/* Chrome strip (nav redesign, Kate 2026-07-15): brand mark | defaults
            capsule · sessions · settings, inline on one row at comfortable
            widths. Below the container breakpoint (amicode.css) the three
            controls fold behind a hamburger and re-flow into a dropdown.
            Model+solver live in the capsule popover; "customize" moved home to
            the widget grid it edits. */}
        <div
          data-slot="amicode-chrome"
          ref={chromeRoot}
          style={{
            position: "relative",
            // Collapse-to-hamburger keys off the home panel's OWN width, not the
            // viewport: the panel narrows when the sidebar/inspector open, so a
            // container query is the honest signal (rules in amicode.css).
            container: "amicode-chrome / inline-size",
            // Never let a shrinking home height (e.g. the inspector panel
            // opening) compress this row (#21's guard, carried into the
            // redesigned strip) — the cards below scroll instead.
            "flex-shrink": "0",
          }}
        >
          <div
            data-slot="amicode-chrome-strip"
            style={{ display: "flex", "align-items": "center", gap: "12px", "min-height": "34px" }}
          >
            <div style={{ display: "flex", "align-items": "center", gap: "8px", "min-width": "0", flex: "0 1 auto" }}>
              {/* Brand mark only — the "Amicode" wordmark beside it was redundant
                  (the app already names itself in the window chrome). */}
              <Mark class="size-6 shrink-0" />
            </div>
            <div style={{ flex: "1 1 0", "min-width": "8px" }} />
            {/* Actions — an inline row at comfortable widths; below the container
                breakpoint they fold behind the hamburger and re-flow into a
                vertical dropdown (amicode.css). Rendered ONCE, so each control
                keeps its own popover state across the reflow. */}
            <div data-slot="amicode-chrome-actions" data-open={menuOpen() ? "true" : "false"}>
              <AmicodeDefaultsCapsule compute={computeControl} />
              <div ref={flyoutRoot} data-slot="amicode-chrome-sessions" style={{ position: "relative" }}>
                <button
                  type="button"
                  data-action="home-sessions-toggle-flyout"
                  onClick={() => setSessionsOpen(!sessionsOpen())}
                  style={{
                    display: "inline-flex",
                    "align-items": "center",
                    gap: "6px",
                    border: "1px solid var(--v2-border-border-base)",
                    "border-radius": "7px",
                    background: "var(--v2-background-bg-layer-01)",
                    color: "var(--v2-text-text-base)",
                    padding: "4px 10px",
                    "font-size": "12px",
                    "font-weight": "600",
                    cursor: "pointer",
                  }}
                >
                  Projects
                  {/* amicode#203: no counter/badge on the entry — just the label. */}
                  <span aria-hidden="true" style={{ "font-size": "9px", color: "var(--v2-text-text-muted)" }}>
                    ▾
                  </span>
                </button>
                <Show when={sessionsOpen()}>
                  {/* Sessions flyout (spec T3.3): servers + projects (all existing
                  affordances preserved via HomeProjectColumn) above the
                  search + grouped sessions list. */}
                  {/* Panel styling mirrors the defaults capsule popover
                  (amicode-defaults-pop): bg-base surface, same floating
                  shadow, 14px padding, 12px gap, dialog semantics. Width and
                  max-height stay flyout-specific — the list needs the room. */}
                  <div
                    data-slot="amicode-sessions-flyout"
                    role="dialog"
                    aria-label={language.t("sidebar.project.recentSessions")}
                    style={{
                      position: "absolute",
                      right: "0",
                      top: "calc(100% + 8px)",
                      "z-index": "40",
                      width: "min(440px, 88vw)",
                      "max-height": "min(70vh, 680px)",
                      display: "flex",
                      "flex-direction": "column",
                      gap: "12px",
                      overflow: "hidden auto",
                      border: "1px solid var(--v2-border-border-base)",
                      "border-radius": "10px",
                      background: "var(--v2-background-bg-base)",
                      "box-shadow": "0 14px 40px -18px rgba(0, 0, 0, 0.55)",
                      padding: "14px",
                    }}
                  >
                    {/* amicode#203 (Kate): Projects section at the top, then the
                        search + Recent-sessions list below. */}
                    <HomeProjectColumn
                      compact
                      projects={visibleProjects()}
                      selected={state.selection}
                      focusServer={focusServer}
                      selectProject={selectProject}
                      openNewSession={openProjectNewSession}
                      chooseProject={(conn) => void chooseProject(conn)}
                      newProject={(conn) => void newProject(conn)}
                      editProject={editProject}
                      closeProject={(conn, directory) => {
                        const next = closeHomeProject(
                          state.selection,
                          ServerConnection.key(conn),
                          global.createServerCtx(conn).projects,
                          directory,
                        )
                        if (next) setSelection(next)
                      }}
                      clearNotifications={clearNotifications}
                      unseenCount={unseenCount}
                      sessionsFor={(worktree) => allRecords().filter((r) => r.project.worktree === worktree)}
                      onOpenSession={openSession}
                      activeServerKey={server.key}
                      openSettings={openSettings}
                      language={language}
                    />
                    <div style={{ height: "1px", background: "var(--v2-border-border-base)", "flex-shrink": "0" }} />
                    <section
                      class="isolate min-h-0 min-w-0 flex flex-col"
                      aria-label={language.t("sidebar.project.recentSessions")}
                    >
                      <HomeSessionSearch
                        value={state.search}
                        placeholder={language.t("home.sessions.search.placeholder")}
                        open={searchOpen()}
                        loading={sessionLoad.isLoading}
                        results={searchResults()}
                        server={state.selection.server}
                        activeServer={state.selection.server === server.key}
                        noResultsLabel={language.t("home.sessions.search.noResults", { query: search() })}
                        bindFocus={(focus) => {
                          focusSessionSearch = focus
                        }}
                        onInput={(value) => setState("search", value)}
                        onFocus={() => setState("searchFocused", true)}
                        onClose={closeSearch}
                        onSelect={selectSearchSession}
                      />
                      {/* The scroll container must be this element itself (used flex
                      size + overflow-y), NOT ScrollView: its viewport needs
                      height:100%, and percentage heights never resolve under the
                      flyout's max-height-only auto-height chain — the viewport
                      inflates to content size and the root just clips it. Same
                      pattern as the project list / search results lists. */}
                      <div class="min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div class="pt-3 flex flex-col gap-6">
                          <Show
                            when={!sessionLoad.isLoading}
                            fallback={<HomeSessionSkeleton label={language.t("common.loading")} />}
                          >
                            <div class="flex min-w-0 flex-col gap-1">
                              {/* amicode#203 (Kate): header matches the PROJECTS
                                  header — uppercase faint label + ghost icon button. */}
                              <div class="flex h-7 min-w-0 items-center justify-between">
                                <span
                                  style={{
                                    "font-size": "10px",
                                    "font-weight": "700",
                                    "letter-spacing": "0.08em",
                                    "text-transform": "uppercase",
                                    color: "var(--v2-text-text-faint)",
                                  }}
                                >
                                  {language.t("sidebar.project.recentSessions")}
                                </span>
                                <Show when={newSessionProject()}>
                                  <IconButtonV2
                                    data-action="home-new-session"
                                    variant="ghost-muted"
                                    size="large"
                                    class="titlebar-icon [&_[data-slot=icon-svg]]:text-v2-icon-icon-muted"
                                    icon={<IconV2 name="edit" />}
                                    onClick={openNewSession}
                                    aria-label={language.t("command.session.new")}
                                  />
                                </Show>
                              </div>
                              <Show
                                when={records().length > 0}
                                fallback={
                                  <div class="pl-1.5 text-v2-text-text-faint" style={{ "font-size": "12px" }}>
                                    {language.t("home.sessions.empty")}
                                  </div>
                                }
                              >
                                <div class="flex min-w-0 flex-col gap-px">
                                  <For each={records()}>
                                    {(record) => (
                                      <HomeSessionRow
                                        record={record}
                                        server={state.selection.server}
                                        activeServer={state.selection.server === server.key}
                                        openSession={openSession}
                                      />
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </section>
                  </div>
                </Show>
              </div>
              {/* amicode (#174 AC1): global Connections entry — Connections are
                  global credentials, so they must be reachable from a fresh
                  boot with no session open. Opens the same Vaults+Connections
                  surface the session-header status popover hosts (one wiring,
                  two mounts), with Connections pre-selected. Manage-vaults
                  hands off to a fresh draft session (home has no composer). */}
              <GlobalConnectionsPopover onManageVaults={() => startWithPrompt(AMICODE_MANAGE_VAULTS_PROMPT)} />
              <IconButtonV2
                data-action="home-open-settings"
                variant="ghost-muted"
                size="small"
                icon={<IconV2 name="settings-gear" />}
                onClick={() => {
                  setMenuOpen(false)
                  openSettings()
                }}
                aria-label={language.t("sidebar.settings")}
              />
            </div>
            {/* Hamburger — hidden until the container breakpoint (amicode.css),
                where it becomes the one control that opens the folded actions. */}
            <div data-slot="amicode-chrome-hamburger">
              <IconButtonV2
                data-action="home-chrome-menu-toggle"
                variant="ghost-muted"
                size="small"
                icon={<IconV2 name="menu" />}
                onClick={() => setMenuOpen(!menuOpen())}
                aria-expanded={menuOpen()}
                aria-label={language.t("sidebar.menu.toggle")}
              />
            </div>
          </div>
        </div>
        {/* Cards: full width across, sized to content so they never scroll */}
        <div class="relative z-[1] flex-none pt-1">
          <Show
            when={widgetInfos().length > 0 && dashboard()}
            fallback={
              /* legacy fallback: server without the widget routes (or a failed
                 registry fetch) still gets the full hardcoded home */
              <AmicodeHomeCards
                profile={profileView()}
                onStart={startWithPrompt}
                library={libraryView()}
                onUploadPaper={uploadPaper}
                onEditProfile={() => startWithPrompt("update my profile — my name, affiliation, and what I work on")}
                onSaveProfile={saveProfileFields}
                resumeName={resumeProblem()?.name}
                resumeMeta={resumeMeta()}
                onResume={() => {
                  const name = resumeProblem()?.name
                  if (name) startWithPrompt(`Open the problem "${name}" and continue where we left off`)
                }}
                onWarmStart={() => startWithPrompt("warm-start a new solve from my pulse bank")}
                onOpenGallery={() => setGalleryOpen(true)}
                liveRun={liveRun()}
                onOpenLiveRun={() => {
                  const name = resumeProblem()?.name
                  if (name) startWithPrompt(`Open the problem "${name}" and show me the running solve`)
                }}
              />
            }
          >
            {(dash) => (
              <WidgetGrid
                widgets={widgetInfos()}
                dashboard={dash()}
                frameSrcs={widgetFrameSrcs()}
                tokens={themeState().tokens}
                density={themeState().density}
                context={widgetContext()}
                callbacks={widgetCallbacks}
                onSave={saveDashboard}
                onNewWidget={() =>
                  // Authoring is a conversation: hand off to a fresh chat with the
                  // composer prefilled (not auto-sent — the user completes the
                  // sentence). amicode_author_widget takes it from there and the
                  // preview card's "Pin to dashboard" closes the loop.
                  startWithPrompt("I want to create a new widget for my home dashboard. It should show ")
                }
              />
            )}
          </Show>
        </div>
        <AmicodeFooter />
        <Show when={wizardOpen()}>
          <AmicodeOnboardingWizard
            initialName={(() => {
              const v = profileView()
              return v?.ok ? v.you.name : ""
            })()}
            onComplete={saveProfileFields}
            onUploadPaper={uploadPaper}
            onAttachVault={attachVault}
            onDismiss={dismissWizard}
            onOpenChat={() => {
              dismissWizard()
              startWithPrompt("")
            }}
          />
        </Show>
        <Show when={galleryOpen()}>
          <AmicodeRunGallery
            cards={runCards()}
            onClose={() => setGalleryOpen(false)}
            onSave={window.parent !== window ? saveCardPng : undefined}
          />
        </Show>
      </div>
    </div>
  )
}

function HomeProjectColumn(props: {
  projects: LocalProject[]
  selected: HomeProjectSelection
  /** flyout mode (spec T3.3): brand + settings live in the chrome strip, hide them here */
  compact?: boolean
  focusServer: (server: ServerConnection.Any) => void
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  chooseProject: (server: ServerConnection.Any) => void
  newProject: (server: ServerConnection.Any) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  unseenCount: (server: ServerConnection.Any, project: LocalProject) => number
  // amicode#203: per-project dedicated session lists (flow through to HomeProjectList)
  sessionsFor: (worktree: string) => HomeSessionRecord[]
  onOpenSession: (session: Session) => void
  activeServerKey: ServerConnection.Key
  openSettings: () => void
  language: ReturnType<typeof useLanguage>
}) {
  const global = useGlobal()
  const dialog = useDialog()
  const controller = useServerManagementController({ navigateOnAdd: false })
  return (
    // Flyout mode: never let the sessions list below squeeze this column into
    // visible overflow — keep natural height (capped, scrolling internally if
    // a pathological project count exceeds the cap).
    <aside
      class="isolate flex min-h-0 min-w-0 flex-col"
      classList={{
        "gap-4": !props.compact,
        "gap-3 shrink-0 max-h-[38vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden":
          props.compact,
      }}
      aria-label={props.language.t("home.projects")}
    >
      <div class="flex h-7 min-w-0 items-center justify-between" classList={{ "mt-2 pl-1.5": !props.compact }}>
        {/* amicode: brand block replaces the bare "Projects" label — the lone
            letter-avatar project row underneath read as a stray "A amicode".
            In flyout mode (compact) the strip owns the brand: show a quiet
            "Projects" label instead. */}
        <Show
          when={!props.compact}
          fallback={
            // Same section-label spec as the capsule popover's "Solver".
            <span
              style={{
                "font-size": "10px",
                "font-weight": "700",
                "letter-spacing": "0.08em",
                "text-transform": "uppercase",
                color: "var(--v2-text-text-faint)",
              }}
            >
              {props.language.t("home.projects")}
            </span>
          }
        >
          <div class="flex min-w-0 items-center gap-2">
            <Mark class="size-6 shrink-0" />
            <div class="min-w-0">
              <div
                style={{
                  "font-size": "15px",
                  "font-weight": "650",
                  "line-height": "18px",
                  color: "var(--v2-text-text-base)",
                }}
              >
                Amicode
              </div>
              <div style={{ "font-size": "11px", "line-height": "14px", color: "var(--v2-text-text-faint)" }}>
                by Harmoniqs
              </div>
            </div>
          </div>
        </Show>
        <Show when={global.servers.list().length === 1}>
          <IconButtonV2
            data-action="home-add-project"
            variant="ghost-muted"
            size="large"
            class="titlebar-icon [&_[data-slot=icon-svg]]:text-v2-icon-icon-muted"
            icon={<IconV2 name="folder-add-left" />}
            onClick={() => props.newProject(global.servers.list()[0]!)}
            aria-label={props.language.t("home.project.add")}
          />
        </Show>
      </div>
      <Show
        when={global.servers.list().length > 1}
        fallback={<HomeProjectList {...props} server={global.servers.list()[0]!} />}
      >
        <For each={global.servers.list()}>
          {(item) => {
            const key = ServerConnection.key(item)
            const healthy = () => !!global.servers.health[key]?.healthy
            const serverCtx = global.createServerCtx(item)
            return (
              <div class="flex max-h-[min(572px,calc(100vh_-_300px))] min-w-0 flex-col gap-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <HomeServerRow
                  server={item}
                  selected={props.selected.server === key && !props.selected.directory}
                  healthy={healthy()}
                  health={global.servers.health[key]}
                  controller={controller}
                  focusServer={props.focusServer}
                  chooseProject={props.chooseProject}
                  newProject={props.newProject}
                  openEdit={(server) => dialog.show(() => <DialogServerV2 mode="edit" server={server} />)}
                  language={props.language}
                />
                <Show when={healthy()}>
                  <div class="mx-3 h-px bg-v2-border-border-base" />
                  <HomeProjectList {...props} server={item} projects={serverCtx.projects.list()} />
                </Show>
              </div>
            )
          }}
        </For>
      </Show>
      <Show when={!props.compact}>
        <div class="mt-4 flex min-w-0 flex-col gap-1">
          <button
            type="button"
            class={`${HOME_PROJECT_NAV_ROW} text-v2-text-text-faint [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted`}
            onClick={props.openSettings}
          >
            <IconV2 name="settings-gear" size="small" />
            <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("sidebar.settings")}</span>
          </button>
        </div>
      </Show>
    </aside>
  )
}

function HomeServerRow(props: {
  server: ServerConnection.Any
  selected: boolean
  healthy: boolean
  health: ServerHealth | undefined
  controller: ReturnType<typeof useServerManagementController>
  focusServer: (server: ServerConnection.Any) => void
  chooseProject: (server: ServerConnection.Any) => void
  newProject: (server: ServerConnection.Any) => void
  openEdit: (server: ServerConnection.Http) => void
  language: ReturnType<typeof useLanguage>
}) {
  const [state, setState] = createStore({ menuOpen: false })
  return (
    <div class="group/server relative flex h-7 min-w-0 items-center rounded-[6px]">
      <button
        type="button"
        class={`${HOME_PROJECT_NAV_ROW} pr-16 disabled:opacity-60`}
        data-selected={props.selected ? "" : undefined}
        disabled={!props.healthy}
        onClick={() => props.focusServer(props.server)}
      >
        <div class="flex size-4 shrink-0 items-center justify-center">
          <ServerHealthIndicator health={props.health} />
        </div>
        <span class="flex min-w-0 items-center gap-1">
          <span class={HOME_PROJECT_NAV_LABEL}>{props.server.displayName ?? new URL(props.server.http.url).host}</span>
          <Show when={props.server.label}>
            {(label) => (
              <span class="shrink-0 rounded-[3px] border border-v2-border-border-base px-1 py-0.5 text-[9px] leading-none text-v2-text-text-muted">
                {label()}
              </span>
            )}
          </Show>
        </span>
      </button>
      <div
        class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/server:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
        data-menu={state.menuOpen}
      >
        <ServerRowMenu
          server={props.server}
          controller={props.controller}
          onEdit={props.openEdit}
          open={state.menuOpen}
          onOpenChange={(open) => setState("menuOpen", open)}
        />
        <IconButtonV2
          data-action="home-add-project"
          variant="ghost-muted"
          size="small"
          icon={<IconV2 name="folder-add-left" />}
          aria-label={props.language.t("home.project.add")}
          onClick={() => props.newProject(props.server)}
        />
      </div>
    </div>
  )
}

function HomeProjectList(props: {
  server: ServerConnection.Any
  projects: LocalProject[]
  selected: HomeProjectSelection
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  unseenCount: (server: ServerConnection.Any, project: LocalProject) => number
  // amicode#203: each project owns a dedicated session list, shown nested when
  // the project is selected. Flat "all sessions" lives above this (the flyout).
  sessionsFor: (worktree: string) => HomeSessionRecord[]
  onOpenSession: (session: Session) => void
  activeServerKey: ServerConnection.Key
  language: ReturnType<typeof useLanguage>
}) {
  return (
    <Show when={props.projects.length > 0}>
      <div class="flex min-w-0 flex-col gap-1">
        <For each={props.projects}>
          {(project) => {
            const key = ServerConnection.key(props.server)
            const rowSelected = () => props.selected.server === key && props.selected.directory === project.worktree
            const sessions = () => props.sessionsFor(project.worktree)
            return (
              <div class="flex min-w-0 flex-col gap-px">
                <HomeProjectRow
                  project={project}
                  server={props.server}
                  selected={rowSelected()}
                  unseenCount={props.unseenCount(props.server, project)}
                  selectProject={props.selectProject}
                  openNewSession={props.openNewSession}
                  editProject={props.editProject}
                  closeProject={props.closeProject}
                  clearNotifications={props.clearNotifications}
                  language={props.language}
                />
                {/* selected project expands to its dedicated sessions; others
                    stay collapsed (Kate's model: one flat list above + per-project
                    lists here). */}
                <Show when={rowSelected() && sessions().length > 0}>
                  {/* indent so session titles align under the project NAME (past
                      the folder icon + gap), reading as children of the project. */}
                  <div class="flex min-w-0 flex-col gap-px pl-7">
                    <For each={sessions()}>
                      {(record) => (
                        <HomeSessionRow
                          record={record}
                          server={key}
                          activeServer={key === props.activeServerKey}
                          openSession={props.onOpenSession}
                          hideLabel
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

function HomeProjectRow(props: {
  project: LocalProject
  server: ServerConnection.Any
  selected: boolean
  unseenCount: number
  selectProject: (server: ServerConnection.Any, directory: string) => void
  openNewSession: (server: ServerConnection.Any, directory: string) => void
  editProject: (server: ServerConnection.Any, project: LocalProject) => void
  closeProject: (server: ServerConnection.Any, directory: string) => void
  clearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  language: ReturnType<typeof useLanguage>
}) {
  const [state, setState] = createStore({ menuOpen: false })
  return (
    <div class="group/project relative flex h-7 min-w-0 items-center rounded-[6px]">
      <button
        type="button"
        data-component="home-project-row"
        class={`${HOME_PROJECT_NAV_ROW} pr-16`}
        data-selected={props.selected ? "" : undefined}
        aria-current={props.selected ? "page" : undefined}
        onClick={() => props.selectProject(props.server, props.project.worktree)}
      >
        <HomeProjectAvatar project={props.project} />
        <span class={HOME_PROJECT_NAV_LABEL}>{displayName(props.project)}</span>
      </button>
      <div
        class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/project:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
        data-menu={state.menuOpen}
      >
        <IconButtonV2
          data-action="home-project-new-session"
          variant="ghost-muted"
          size="small"
          icon={<IconV2 name="edit" />}
          aria-label={props.language.t("command.session.new")}
          onClick={() => props.openNewSession(props.server, props.project.worktree)}
        />
        <MenuV2
          gutter={4}
          modal={false}
          placement="bottom-end"
          open={state.menuOpen}
          onOpenChange={(open) => setState("menuOpen", open)}
        >
          <MenuV2.Trigger
            as={IconButtonV2}
            data-action="home-project-menu"
            variant="ghost-muted"
            size="small"
            icon={<IconV2 name="outline-dots" />}
            aria-label={props.language.t("common.moreOptions")}
          />
          <MenuV2.Portal>
            <MenuV2.Content>
              <MenuV2.Item onSelect={() => props.openNewSession(props.server, props.project.worktree)}>
                {props.language.t("command.session.new")}
              </MenuV2.Item>
              <MenuV2.Item onSelect={() => props.editProject(props.server, props.project)}>
                {props.language.t("common.edit")}
              </MenuV2.Item>
              <MenuV2.Item
                disabled={props.unseenCount === 0}
                onSelect={() => props.clearNotifications(props.server, props.project)}
              >
                {props.language.t("sidebar.project.clearNotifications")}
              </MenuV2.Item>
              <MenuV2.Separator />
              <MenuV2.Item onSelect={() => props.closeProject(props.server, props.project.worktree)}>
                {props.language.t("common.close")}
              </MenuV2.Item>
            </MenuV2.Content>
          </MenuV2.Portal>
        </MenuV2>
      </div>
    </div>
  )
}

function HomeProjectAvatar(_props: { project: LocalProject }) {
  // amicode#203 (Kate): a sleek folder glyph, not the first-letter avatar.
  return (
    <span class="inline-flex size-5 shrink-0 items-center justify-center text-v2-icon-icon-muted">
      <Icon name="folder" class="size-4" />
    </span>
  )
}


function HomeSessionSearch(props: {
  value: string
  placeholder: string
  open: boolean
  loading: boolean
  results: HomeSessionRecord[]
  server: ServerConnection.Key
  activeServer: boolean
  noResultsLabel: string
  bindFocus: (focus: () => void) => void
  onInput: (value: string) => void
  onFocus: () => void
  onClose: () => void
  onSelect: (session: Session) => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ active: "" })
  let root: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined
  let listRef: HTMLDivElement | undefined

  const focusInput = () => {
    input?.focus()
    props.onFocus()
  }

  onMount(() => {
    props.bindFocus(focusInput)
  })

  const syncActive = (results: HomeSessionRecord[]) => {
    if (results.length === 0) {
      setStore("active", "")
      return
    }
    if (!results.some((record) => homeSessionSearchKey(record) === store.active)) {
      setStore("active", homeSessionSearchKey(results[0]))
    }
  }

  createEffect(() => syncActive(props.results))

  createEffect(
    on(
      () => props.value,
      () => syncActive(props.results),
    ),
  )

  const scrollActiveIntoView = () => {
    const key = store.active
    if (!key || !listRef) return
    const element = listRef.querySelector<HTMLElement>(`[data-key="${key}"]`)
    element?.scrollIntoView({ block: "nearest" })
  }

  const moveActive = (delta: number) => {
    const results = props.results
    if (results.length === 0) return
    const index = results.findIndex((record) => homeSessionSearchKey(record) === store.active)
    const start = index === -1 ? 0 : index
    const next = (start + delta + results.length) % results.length
    setStore("active", homeSessionSearchKey(results[next]))
    scrollActiveIntoView()
  }

  const selectActive = () => {
    const record = props.results.find((item) => homeSessionSearchKey(item) === store.active)
    if (!record) return
    props.onSelect(record.session)
  }

  onCleanup(
    makeEventListener(document, "pointerdown", (event) => {
      if (!props.open) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (root?.contains(target)) return
      props.onClose()
    }),
  )

  return (
    <div class="w-full shrink-0">
      <div ref={root} data-component="home-session-search" class="relative z-10 w-full">
        <Show when={props.open}>
          <div
            data-component="home-session-search-panel"
            class="absolute flex flex-col rounded-[12px] bg-v2-background-bg-base shadow-[var(--v2-elevation-floating)]"
            style={{
              top: "-6px",
              left: "-6px",
              width: "calc(100% + 14px)",
            }}
          >
            <div class="flex flex-col pt-9">
              <div id={HOME_SESSION_SEARCH_RESULTS_ID} role="listbox" class="flex flex-col gap-4 pt-4 pb-2">
                <Show
                  when={!props.loading}
                  fallback={
                    <div class="flex items-center justify-center px-4 py-3 text-v2-text-text-muted [font-weight:440]">
                      <AmicoSpinner class="size-4" />
                    </div>
                  }
                >
                  <Show
                    when={props.results.length > 0}
                    fallback={
                      <p class="my-1.5 px-4 text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]">
                        {props.noResultsLabel}
                      </p>
                    }
                  >
                    <div class="flex flex-col">
                      <p class="my-1.5 px-4 text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]">
                        {language.t("home.sessions.search.sessions")}
                      </p>
                      <div ref={listRef} class="flex max-h-80 flex-col gap-px overflow-y-auto">
                        <For each={props.results}>
                          {(record) => (
                            <HomeSessionSearchResultRow
                              record={record}
                              server={props.server}
                              activeServer={props.activeServer}
                              selected={store.active === homeSessionSearchKey(record)}
                              onHighlight={() => setStore("active", homeSessionSearchKey(record))}
                              onSelect={(session) => props.onSelect(session)}
                            />
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          </div>
        </Show>
        <label
          class="relative z-20 flex h-9 w-full items-center gap-2 rounded-[6px] py-1 pl-3 pr-2 text-v2-icon-icon-muted transition-[background-color,box-shadow] duration-[120ms] ease-in-out"
          classList={{
            "bg-v2-background-bg-deep focus-within:bg-v2-background-bg-base focus-within:shadow-[0_0_0_0.5px_var(--v2-border-border-focus),var(--v2-elevation-raised)]":
              !props.open,
            "bg-transparent shadow-[0_0_0_0.5px_var(--v2-border-border-focus)]": props.open,
          }}
        >
          <IconV2 name="magnifying-glass" />
          <input
            ref={input}
            class="relative z-20 min-w-0 flex-1 border-0 bg-transparent text-v2-text-text-base outline-0 [font-weight:440] placeholder:text-v2-text-text-faint"
            value={props.value}
            placeholder={props.placeholder}
            aria-label={props.placeholder}
            aria-expanded={props.open}
            aria-controls={HOME_SESSION_SEARCH_RESULTS_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              store.active && props.open ? `home-session-search-option-${store.active}` : undefined
            }
            onFocus={() => props.onFocus()}
            onInput={(event) => props.onInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                props.onClose()
                input?.blur()
                return
              }
              if (!props.open || props.results.length === 0) return
              if (event.altKey || event.metaKey) return
              if (event.key === "ArrowDown") {
                event.preventDefault()
                moveActive(1)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                moveActive(-1)
                return
              }
              if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault()
                selectActive()
              }
            }}
          />
          <Show when={props.value}>
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              class="relative z-20 shrink-0"
              icon={<IconV2 name="close" size="large" class="text-v2-icon-icon-muted" />}
              aria-label={props.placeholder}
              onClick={() => {
                props.onClose()
                input?.focus()
              }}
            />
          </Show>
        </label>
      </div>
    </div>
  )
}

function HomeSessionSearchResultRow(props: {
  record: HomeSessionRecord
  server: ServerConnection.Key
  activeServer: boolean
  selected: boolean
  onHighlight: () => void
  onSelect: (session: Session) => void
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)

  const key = () => homeSessionSearchKey(props.record)

  return (
    <button
      type="button"
      id={`home-session-search-option-${key()}`}
      data-key={key()}
      data-component="home-session-search-row"
      role="option"
      aria-selected={props.selected}
      classList={{
        [HOME_SEARCH_RESULT_ROW]: true,
        "bg-v2-overlay-simple-overlay-hover": props.selected,
      }}
      onMouseEnter={() => props.onHighlight()}
      onClick={() => props.onSelect(props.record.session)}
    >
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          class={`${HOME_SEARCH_RESULT_TITLE} ${props.record.projectName ? "max-w-[min(70%,480px)] flex-[0_1_auto]" : "flex-[1_1_auto]"}`}
        >
          {title()}
        </span>
        <Show when={props.record.projectName}>
          <span class={HOME_SEARCH_RESULT_META}>{props.record.projectName}</span>
        </Show>
      </div>
    </button>
  )
}


function HomeSessionRow(props: {
  record: HomeSessionRecord
  server: ServerConnection.Key
  activeServer: boolean
  openSession: (session: Session) => void
  /** nested under a project → the project name is redundant, so hide it */
  hideLabel?: boolean
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)
  const showLabel = () => !props.hideLabel && !!props.record.projectName

  return (
    <button
      type="button"
      data-component="home-session-row"
      class={HOME_SESSION_ROW}
      onClick={() => props.openSession(props.record.session)}
    >
      <span
        class={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${showLabel() ? "max-w-[min(70%,480px)] flex-[0_1_auto]" : "flex-[1_1_auto]"}`}
      >
        {title()}
      </span>
      <Show when={showLabel()}>
        <span class="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-v2-text-text-faint [font-weight:440]">
          {props.record.projectName}
        </span>
      </Show>
    </button>
  )
}

function HomeSessionSkeleton(props: { label: string }) {
  return (
    <div class="flex min-w-0 flex-col gap-4">
      <div class="flex h-7 min-w-0 items-center justify-between px-4">
        <div class={HOME_SECTION_LABEL}>{props.label}</div>
      </div>
      <div class="flex min-w-0 flex-col gap-px" aria-hidden="true">
        <For each={[0, 1, 2, 3]}>{() => <div class="h-10 rounded-[6px] bg-v2-background-bg-deep opacity-70" />}</For>
      </div>
    </div>
  )
}

function LegacyHome() {
  const sync = useServerSync()
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const navigate = useNavigate()
  const global = useGlobal()
  const server = useServer()
  const language = useLanguage()
  const homedir = createMemo(() => sync.data.path.home)
  const recent = createMemo(() => {
    return sync.data.project
      .slice()
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .slice(0, 5)
  })

  const serverDotClass = createMemo(() => {
    const healthy = global.servers.health[server.key]?.healthy
    if (healthy === true) return "bg-icon-success-base"
    if (healthy === false) return "bg-icon-critical-base"
    return "bg-border-weak-base"
  })

  function openProject(server: ServerConnection.Any, directory: string) {
    const serverCtx = global.createServerCtx(server)
    serverCtx.projects.open(directory)
    serverCtx.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  function chooseProject() {
    const s = server.current
    if (!s) return

    const resolve = (result: string | string[] | null) => {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(s, directory)
        }
      } else if (result) {
        openProject(s, result)
      }
    }

    pickDirectory({
      server: s,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: resolve,
    })
  }

  return (
    <div class="mx-auto mt-55 w-full md:w-auto px-4">
      <Logo class="md:w-xl opacity-12" />
      <Button
        size="large"
        variant="ghost"
        class="mt-4 mx-auto text-14-regular text-text-weak"
        onClick={() => dialog.show(() => <DialogSelectServer />)}
      >
        <div
          classList={{
            "size-2 rounded-full": true,
            [serverDotClass()]: true,
          }}
        />
        {server.name}
      </Button>
      <Switch>
        <Match when={sync.data.project.length > 0}>
          <div class="mt-20 w-full flex flex-col gap-4">
            <div class="flex gap-2 items-center justify-between pl-3">
              <div class="text-14-medium text-text-strong">{language.t("home.recentProjects")}</div>
              <Button icon="folder-add-left" size="normal" class="pl-2 pr-3" onClick={chooseProject}>
                {language.t("command.project.open")}
              </Button>
            </div>
            <ul class="flex flex-col gap-2">
              <For each={recent()}>
                {(project) => (
                  <Button
                    size="large"
                    variant="ghost"
                    class="text-14-mono text-left justify-between px-3"
                    onClick={() => openProject(server.current!, project.worktree)}
                  >
                    {project.worktree.replace(homedir(), "~")}
                    <div class="text-14-regular text-text-weak">
                      {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                    </div>
                  </Button>
                )}
              </For>
            </ul>
          </div>
        </Match>
        <Match when={!sync.ready}>
          <div class="mt-30 mx-auto flex flex-col items-center gap-3">
            <div class="text-12-regular text-text-weak">{language.t("common.loading")}</div>
            <Button class="px-3" onClick={chooseProject}>
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
        <Match when={true}>
          <div class="mt-30 mx-auto flex flex-col items-center gap-3">
            <Icon name="folder-add-left" size="large" />
            <div class="flex flex-col gap-1 items-center justify-center">
              <div class="text-14-medium text-text-strong">{language.t("home.empty.title")}</div>
              <div class="text-12-regular text-text-weak">{language.t("home.empty.description")}</div>
            </div>
            <Button class="px-3 mt-1" onClick={chooseProject}>
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
