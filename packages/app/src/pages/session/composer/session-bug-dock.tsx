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
import { useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { usePermission } from "@/context/permission"
import { bugReportEnabled } from "@/utils/amicode-bug-report"
import { bugDock } from "./bug-dock"
import { bugDockController, findBugFiledUrl, findLiveBugSession } from "./bug-dock-controller"
import { sessionPermissionRequest } from "./session-request-tree"
import { SessionPermissionDock } from "./session-permission-dock"

const HEADER_HEIGHT = 42

export function SessionBugDock() {
  const controller = bugDockController
  const sync = useSync()
  const server = useServer()
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

  // Self-contained close (amicode#249 QA): the bridge's bug-report-closed
  // postMessage can be lost (the relay, the extension, the window). The dock
  // deletes the session directly through the app's own server API — abort
  // the in-flight turn, then hard-delete. The bridge still posts
  // (best-effort); the sync watch never resurrects (dismissed guard).
  const selfClose = async () => {
    const id = controller.sessionID()
    if (!id) return
    controller.requestClose()
    const origin = window.location.origin
    const creds = server.current?.http.password
      ? btoa(`${server.current.http.username ?? "opencode"}:${server.current.http.password}`)
      : undefined
    const headers = creds ? { Authorization: `Basic ${creds}` } as Record<string, string> : undefined
    const doFetch = async (method: string, path: string) => {
      try { await fetch(`${origin}${path}`, { method, headers }) } catch {}
    }
    await doFetch("POST", `/session/${id}/abort`)
    await doFetch("DELETE", `/session/${id}`)
  }

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

  // Whether the bug-session agent is working. Plain session_working —
  // the same signal the thinking indicator uses. No overrides needed:
  // the bug reporter no longer uses the question tool (which blocks
  // execution and keeps session_working pinned to true).
  const busy = createMemo(() => {
    const id = controller.sessionID()
    if (!id || controller.phase() !== "chat") return false
    return sync().data.session_working(id)
  })

  // The answer surface (amicode#249 QA): the bug session's question and
  // permission cards render IN THE DOCK — the dialogue box IS the window
  // where the user answers "what happened / what did you expect". Replies
  // route by the request's own sessionID.
  const sdk = useSDK()
  const permission = usePermission()
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
    // Scoped by the requesting session's directory (amicode#249 QA) — the
    // permission registry is instance-per-directory, same as questions.
    const directory = serverSync().session.data.info[perm.sessionID]?.directory
    sdk()
      .api.permission.reply({ sessionID: perm.sessionID, requestID: perm.id, location: { directory }, reply: response })
      .finally(() => setDeciding((id) => (id === perm.id ? undefined : id)))
  }

  // The answer input — a plain textarea so it's never clipped by the
  // nested DockPrompt's animation fighting the dock's own max-height.
  const [answerText, setAnswerText] = createSignal("")
  const [answering, setAnswering] = createSignal(false)

  // Send a free-form follow-up to the bug session — the only send path
  // now that the question tool is gone from the bug reporter skill.
  const sendFreeform = async () => {
    const id = controller.sessionID()
    if (!id || !answerText().trim()) return
    const text = answerText()
    setAnswerText("")
    setAnswering(true)
    try {
      await sdk().api.session.prompt({
        sessionID: id,
        id: crypto.randomUUID(),
        text,
      })
    } catch {
      setAnswerText(text)
    } finally {
      setAnswering(false)
    }
  }

  const handleSubmit = () => {
    if (answering()) return
    sendFreeform()
  }

  return (
    <>
      <Show when={controller.phase() !== "closed"}>
        <div class="pb-2">
          <BugDockView
            phase={controller.phase() === "filed" ? "filed" : "chat"}
            collapsed={controller.collapsed()}
            busy={busy()}
            agentText={lastAssistantText()}
            filedUrl={controller.filedUrl()}
            answerText={answerText()}
            answering={answering()}
            questionText={lastAssistantText()}
            onAnswerChange={(v) => setAnswerText(v)}
            onAnswerSubmit={handleSubmit}
            onToggle={controller.toggleCollapsed}
            onClose={selfClose}
            onOpenLink={(url) => platform.openExternal(url)}
          />
        </div>
      </Show>
      <Show when={bugPermission()} keyed>
        {(perm) => (
          <div class="pb-2">
            <SessionPermissionDock request={perm} responding={deciding() === perm.id} onDecide={decide} />
          </div>
        )}
      </Show>
    </>
  )
}

/** The presentational dock — exported for the Storybook state matrix. */
export function BugDockView(props: {
  phase: "chat" | "filed"
  collapsed: boolean
  busy: boolean
  agentText?: string
  filedUrl?: string
  answerText: string
  answering: boolean
  questionText?: string
  onAnswerChange: (value: string) => void
  onAnswerSubmit: () => void
  onToggle: () => void
  onClose: () => void
  onOpenLink: (url: string) => void
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

        <div
          data-slot="bug-dock-body"
          aria-hidden={props.collapsed || off()}
          classList={{ "pointer-events-none": value() > 0.1 }}
          style={{
            visibility: off() ? "hidden" : "visible",
            opacity: `${Math.max(0, Math.min(1, 1 - value()))}`,
          }}
        >
          {/* Startup placeholder — the model hasn't spoken yet. */}
          <Show when={props.phase === "chat" && !props.agentText}>
            <div
              data-slot="bug-dock-init"
              class="border-t-[0.5px] border-v2-border-border-base px-4 py-2.5 text-[13px] leading-5 text-v2-text-text-muted"
            >
              Starting bug reporter…
            </div>
          </Show>
          <Show
            when={props.phase === "chat"}
            fallback={
              <div data-slot="bug-dock-filed" class="flex flex-col gap-1 px-4 pt-1 pb-3">
                <div class="flex items-center gap-2">
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
                <span class="text-[12px] font-[440] leading-5 text-v2-text-text-faint">
                  Feel free to close this bug session.
                </span>
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
            {/* The permanent textarea — always visible in chat phase. */}
            <div data-slot="bug-dock-input" class="flex flex-col gap-1 border-t-[0.5px] border-v2-border-border-base px-4 pt-1.5 pb-2.5">
              <Show when={props.questionText}>
                <p class="text-[13px] leading-5 text-v2-text-text-base">{props.questionText}</p>
              </Show>
              <span class="text-[11px] leading-4 text-v2-text-text-faint">
                {props.busy ? "The reporter is working…" : "The reporter is ready — send a reply or follow-up."}
              </span>
              <div class="flex gap-2">
                <textarea
                  value={props.answerText}
                  onInput={(e) => props.onAnswerChange(e.currentTarget.value)}
                  placeholder="Type your answer…"
                  disabled={props.answering}
                  classList={{
                    "flex-1 resize-none rounded-md border-[0.5px] bg-v2-background-bg-layer-02 px-3 py-1.5 text-[13px] leading-5 text-v2-text-text-base placeholder:text-v2-text-text-faint focus:outline-none": true,
                    "border-v2-state-fg-warning shadow-[0_0_0_1px_var(--v2-state-fg-warning)]": !props.busy,
                    "border-v2-border-border-base": props.busy,
                  }}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      if (props.answerText.trim()) props.onAnswerSubmit()
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={props.answering || !props.answerText.trim()}
                  onClick={props.onAnswerSubmit}
                  class="shrink-0 self-end cursor-pointer rounded-md bg-v2-background-accent px-3 py-1.5 text-[13px] font-[480] leading-5 text-v2-text-text-on-accent hover:opacity-90"
                >
                  {props.answering ? "…" : "Send"}
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
