// amicode/opencode#117: the bug-report dock — a member of the composer's dock
// family (todo / question / permission / revert), hosting the bug session in
// an iframe above the composer. Lifecycle (amicode ADR 0004): the chevron
// collapses and keeps the session alive; the close control posts
// bug-report-closed and ends it; the sentinel watcher switches the dock to
// its terminal end-state until the extension closes it. All state lives in
// the module-singleton bugDockController (one dock per window); bridge
// down-messages reach it at app level (AmicodeThemeBridge in app.tsx) — this
// component is the thin Solid shell: the revealNonce re-expand effect, the
// sentinel watcher, and the family-idiom animation. Logic is unit-tested in
// bug-dock-controller.test.ts; the visual contract lives in
// session-bug-dock.stories.tsx (no component-render test surface — see the
// issue's Testing Decisions). en-only chrome, per the amicode precedent.
import { Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useSpring } from "@opencode-ai/ui/motion-spring"
import { usePlatform } from "@/context/platform"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { usePermission } from "@/context/permission"
import { bugReportEnabled } from "@/utils/amicode-bug-report"
import { bugDock } from "./bug-dock"
import { bugDockController, bugProgress, findBugFiledUrl, findLiveBugSession } from "./bug-dock-controller"
import { sessionPermissionRequest, sessionQuestionRequest } from "./session-request-tree"
import { SessionQuestionDock } from "./session-question-dock"
import { SessionPermissionDock } from "./session-permission-dock"

const HEADER_HEIGHT = 42

export function SessionBugDock() {
  const controller = bugDockController
  const sync = useSync()
  const platform = usePlatform()

  // Bridge down-messages (open-bug-report / close-bug-report) are handled at
  // app level (AmicodeThemeBridge in app.tsx) → the controller, so an open
  // can't be missed between pages. This component owns the dock-local seams.

  // The report-bug button's reveal() bumps the #116 seam's nonce — re-expand
  // an open-but-collapsed dock. Never a bridge post.
  createEffect(
    on(
      () => bugDock.revealNonce(),
      () => controller.reveal(),
      { defer: true },
    ),
  )

  // The sentinel watcher — observes ONLY the hosted bug session's streamed
  // message parts, matched per text part; file() latches (exactly one
  // bug-filed post). Torn down with the dock.
  createEffect(() => {
    const id = controller.sessionID()
    if (!id || controller.phase() !== "chat") return
    const messages = sync().data.message[id] ?? []
    const parts = messages.flatMap((message) => sync().data.part[message.id] ?? [])
    const url = findBugFiledUrl(parts)
    if (url) controller.file(url)
  })

  // The sync watch — the open path that cannot be lost (QA: amicode#249
  // preview). The bridge's open-bug-report rides a fire-and-forget webview
  // postMessage (a cold-boot reload ate it in the preview); a bug session in
  // the app's OWN synced session map (serverSync.session.data.info — fed by
  // session.created/updated/deleted events, metadata-carrying) is ground
  // truth. When one appears and no dock is open, adopt it through the same
  // idempotent path as the bridge message. Abandoned sessions are
  // hard-deleted (they vanish from the map), filed ones archive (excluded) —
  // so a dismissed or terminal dock never re-opens from the watch.
  const serverSync = useServerSync()
  createEffect(() => {
    if (!bugReportEnabled()) return
    if (bugDockController.phase() !== "closed") return
    const id = findLiveBugSession(Object.values(serverSync().session.data.info ?? {}))
    if (!id) return
    bugDockController.handleBridgeMessage({ source: "amicode", kind: "open-bug-report", sessionID: id })
  })

  // The agent's latest visible message (amicode#249 QA — the dialogue body):
  // the last text part from the bug session's most recent assistant turn
  // that produced one — the draft under review at the confirm gate, or what
  // the agent last said. Clamped for the dock.
  const lastAssistantText = createMemo(() => {
    const id = controller.sessionID()
    if (!id || controller.phase() !== "chat") return undefined
    const messages = sync().data.message[id] ?? []
    for (let m = messages.length - 1; m >= 0; m--) {
      const message = messages[m]
      if (message.role !== "assistant") continue
      const parts = sync().data.part[message.id] ?? []
      for (let p = parts.length - 1; p >= 0; p--) {
        const part = parts[p]
        if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          const text = part.text.trim()
          return text.length > 1600 ? `…${text.slice(-1600)}` : text
        }
      }
    }
    return undefined
  })

  // The answer surface (amicode#249 QA): the bug session's question and
  // permission cards render IN THE DOCK — the dialogue box IS the window
  // where the user answers "what happened / what did you expect". Replies
  // route by the request's own sessionID.
  const sdk = useSDK()
  const permission = usePermission()
  const bugQuestion = createMemo(() => {
    const id = controller.sessionID()
    if (!id || controller.phase() !== "chat") return undefined
    return sessionQuestionRequest(sync().data.session, sync().data.question, id)
  })
  const bugPermission = createMemo(() => {
    const id = controller.sessionID()
    if (!id || controller.phase() !== "chat") return undefined
    return sessionPermissionRequest(sync().data.session, sync().data.permission, id, (item) => {
      return !permission.autoResponds(item, sdk().directory)
    })
  })
  const [deciding, setDeciding] = createSignal<string>()
  const decide = (response: "once" | "always" | "reject") => {
    const perm = bugPermission()
    if (!perm || deciding() === perm.id) return
    setDeciding(perm.id)
    sdk()
      .api.permission.reply({ sessionID: perm.sessionID, requestID: perm.id, reply: response })
      .finally(() => setDeciding((id) => (id === perm.id ? undefined : id)))
  }

  // The progress strip: narrate the agent's phase from the bug session's own
  // streamed tool calls (dedup → upstream → submit), priority to anything
  // blocked on the user. Cancel reuses the close path — the extension aborts
  // and hard-deletes the unfiled session; no orphans.
  const progress = createMemo(() => {
    const id = controller.sessionID()
    if (!id || controller.phase() !== "chat") return undefined
    const messages = sync().data.message[id] ?? []
    const parts = messages.flatMap((message) => sync().data.part[message.id] ?? [])
    return bugProgress({ questionPending: !!bugQuestion(), permissionPending: !!bugPermission(), parts })
  })

  const footer = () => {
    const question = bugQuestion()
    const perm = bugPermission()
    if (!question && !perm) return undefined
    return (
      <div data-slot="bug-dock-answer" class="border-t-[0.5px] border-v2-border-border-base">
        <Show when={question} keyed>
          {(request) => <SessionQuestionDock request={request} onSubmit={() => {}} />}
        </Show>
        <Show when={perm} keyed>
          {(request) => (
            <SessionPermissionDock request={request} responding={deciding() === request.id} onDecide={decide} />
          )}
        </Show>
      </div>
    )
  }

  return (
    <Show when={controller.phase() !== "closed"}>
      <div class="pb-2">
        <BugDockView
          phase={controller.phase() === "filed" ? "filed" : "chat"}
          collapsed={controller.collapsed()}
          agentText={lastAssistantText()}
          filedUrl={controller.filedUrl()}
          progress={progress()}
          onCancel={controller.requestClose}
          onToggle={controller.toggleCollapsed}
          onClose={controller.requestClose}
          onOpenLink={(url) => platform.openExternal(url)}
          footer={footer()}
        />
      </div>
    </Show>
  )
}

/** The presentational dock — exported for the Storybook state matrix. */
export function BugDockView(props: {
  phase: "chat" | "filed"
  collapsed: boolean
  agentText?: string
  filedUrl?: string
  progress?: { step: string; label: string }
  onCancel?: () => void
  onToggle: () => void
  onClose: () => void
  onOpenLink: (url: string) => void
  footer?: JSX.Element
}) {
  const [store, setStore] = createStore({ height: HEADER_HEIGHT + 120 })
  let contentRef: HTMLDivElement | undefined

  // The dock family's animated max-height idiom (the todo dock's shape):
  // measure the collapse-independent content, spring between full and header.
  const collapse = useSpring(() => (props.collapsed ? 1 : 0), { visualDuration: 0.3, bounce: 0 })
  const value = createMemo(() => Math.max(0, Math.min(1, collapse())))
  const off = createMemo(() => value() > 0.98)
  const full = createMemo(() => Math.max(HEADER_HEIGHT, store.height))

  createEffect(() => {
    const el = contentRef
    if (!el) return
    const update = () => setStore("height", el.scrollHeight)
    update()
    createResizeObserver(el, update)
  })

  const status = createMemo(() => (props.phase === "filed" ? "Issue filed" : "In progress"))

  const onHeaderKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    props.onToggle()
  }

  return (
    <div
      data-component="session-bug-dock"
      data-phase={props.phase}
      class="w-full overflow-hidden rounded-xl border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-01"
      style={{
        "overflow-x": "visible",
        "overflow-y": "hidden",
        "max-height": `${full() - value() * (full() - HEADER_HEIGHT)}px`,
      }}
    >
      <div ref={(el) => (contentRef = el)}>
        <div
          data-slot="bug-dock-header"
          class="flex h-[42px] items-center gap-2 pl-4 pr-2"
          role="button"
          tabIndex={0}
          onClick={props.onToggle}
          onKeyDown={onHeaderKeyDown}
        >
          <IconV2 name="bug" size="small" class="shrink-0 text-v2-state-fg-danger" />
          <span class="shrink-0 cursor-default text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base">
            Bug Report
          </span>
          <Show when={props.collapsed}>
            <span class="min-w-0 flex-1 cursor-default truncate text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-faint">
              {status()}
            </span>
          </Show>
          <div class="ml-auto flex shrink-0 items-center">
            <TooltipV2 placement="top" value={props.collapsed ? "Expand" : "Collapse"}>
              <IconButtonV2
                type="button"
                data-action="bug-dock-toggle"
                data-collapsed={props.collapsed ? "true" : "false"}
                variant="ghost-muted"
                size="large"
                icon={<IconV2 name="outline-chevron-down" size="small" />}
                style={{ transform: `rotate(${value() * 180}deg)` }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  props.onToggle()
                }}
                aria-label={props.collapsed ? "Expand bug report" : "Collapse bug report"}
              />
            </TooltipV2>
            <TooltipV2 placement="top" value="Close bug report">
              <IconButtonV2
                type="button"
                data-action="bug-dock-close"
                variant="ghost-muted"
                size="large"
                icon={<IconV2 name="outline-xmark" size="small" />}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  props.onClose()
                }}
                aria-label="Close bug report"
              />
            </TooltipV2>
          </div>
        </div>

        {/* The progress strip (amicode#249 QA): where the agent is, narrated
            from its own tool calls, plus the always-available cancel — the
            labeled, discoverable sibling of the header's close control. */}
        <Show when={props.phase === "chat" && props.progress}>
          {(progress) => (
            <div
              data-slot="bug-dock-progress"
              data-step={progress().step}
              aria-hidden={props.collapsed || off()}
              class="flex items-center gap-2 border-t-[0.5px] border-v2-border-border-base px-4 py-1.5"
              style={{ visibility: off() ? "hidden" : "visible" }}
            >
              <span
                class="size-1.5 shrink-0 rounded-full bg-v2-state-fg-warning"
                style={{ animation: "pulse 1.6s ease-in-out infinite" }}
              />
              <span class="min-w-0 flex-1 truncate text-[12px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
                {progress().label}
              </span>
              <Show when={props.onCancel}>
                <button
                  type="button"
                  data-action="bug-dock-cancel"
                  class="shrink-0 cursor-pointer rounded-md px-2 py-0.5 text-[12px] font-[480] leading-5 text-v2-text-text-muted hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onCancel?.()
                  }}
                >
                  Cancel
                </button>
              </Show>
            </div>
          )}
        </Show>

        <div
          data-slot="bug-dock-body"
          aria-hidden={props.collapsed || off()}
          classList={{ "pointer-events-none": value() > 0.1 }}
          style={{
            visibility: off() ? "hidden" : "visible",
            opacity: `${Math.max(0, Math.min(1, 1 - value()))}`,
          }}
        >
          <Show
            when={props.phase === "chat"}
            fallback={
              <div data-slot="bug-dock-filed" class="flex items-center gap-2 px-4 pt-1 pb-3">
                <IconV2 name="check" size="small" class="shrink-0 text-v2-state-fg-success" />
                <span class="text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-muted">
                  Issue filed — this session is archived.
                </span>
                <Show when={props.filedUrl && props.filedUrl !== "filed-via-browser" ? props.filedUrl : undefined}>
                  {(url) => (
                    <ButtonV2
                      type="button"
                      size="small"
                      variant="neutral"
                      class="shrink-0"
                      onClick={() => props.onOpenLink(url())}
                    >
                      <span class="flex items-center gap-1.5">
                        <IconV2 name="outline-square-arrow" size="small" />
                        Open issue
                      </span>
                    </ButtonV2>
                  )}
                </Show>
              </div>
            }
          >
            {/* The dialogue body (amicode#249 QA): NATIVE, no embedded app —
                the agent's latest message (the draft under review, or what it
                last said), then the answer cards below. */}
            <Show when={props.agentText}>
              {(text) => (
                <div
                  data-slot="bug-dock-agent"
                  class="max-h-44 overflow-y-auto whitespace-pre-wrap border-t-[0.5px] border-v2-border-border-base px-4 py-2.5 text-[13px] leading-5 text-v2-text-text-base"
                >
                  {text()}
                </div>
              )}
            </Show>
            {props.footer}
          </Show>
        </div>
      </div>
    </div>
  )
}
