// amicode/opencode#117: the bug-report dock — a member of the composer's dock
// family (todo / question / permission / revert), hosting the bug session in
// an iframe above the composer. Lifecycle (amicode ADR 0004): the chevron
// collapses and keeps the session alive; the close control posts
// bug-report-closed and ends it; the sentinel watcher switches the dock to
// its terminal end-state until the extension closes it. All state lives in
// the module-singleton bugDockController (one dock per window) — this
// component is the thin Solid shell: bridge listener, reveal effect, the
// watcher, and the family-idiom animation. Logic is unit-tested in
// bug-dock-controller.test.ts; the visual contract lives in
// session-bug-dock.stories.tsx (no component-render test surface — see the
// issue's Testing Decisions). en-only chrome, per the amicode precedent.
import { Show, createEffect, createMemo, on, onCleanup, onMount, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useSpring } from "@opencode-ai/ui/motion-spring"
import { useTheme } from "@opencode-ai/ui/theme/context"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { hiddenProjectWorktree } from "@/utils/amicode-hidden-project"
import { authTokenFromCredentials } from "@/utils/server"
import { bugDock } from "./bug-dock"
import { bugDockController, bugDockFrameSrc, findBugFiledUrl } from "./bug-dock-controller"

const HEADER_HEIGHT = 42
const FRAME_HEIGHT = 320

export function SessionBugDock() {
  const controller = bugDockController
  const sync = useSync()
  const server = useServer()
  const theme = useTheme()
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

  // Pinned per hosted session (untracked reads): a theme flip or server-state
  // wobble must NOT reload the iframe mid-report — live theme rides the
  // postMessage forward inside the view (the split-frame idiom).
  const src = createMemo(
    on(controller.sessionID, (id) => {
      if (!id) return undefined
      return untrack(() => {
        const conn = server.current
        return bugDockFrameSrc({
          origin: window.location.origin,
          serverKey: server.key,
          sessionID: id,
          colorScheme: theme.mode(),
          authToken: conn?.http.password
            ? authTokenFromCredentials({ username: conn.http.username, password: conn.http.password })
            : undefined,
          hiddenProject: hiddenProjectWorktree(),
        })
      })
    }),
  )

  return (
    <Show when={controller.phase() !== "closed"}>
      <div class="pb-2">
        <BugDockView
          phase={controller.phase() === "filed" ? "filed" : "chat"}
          collapsed={controller.collapsed()}
          src={src()}
          filedUrl={controller.filedUrl()}
          onToggle={controller.toggleCollapsed}
          onClose={controller.requestClose}
          onOpenLink={(url) => platform.openExternal(url)}
        />
      </div>
    </Show>
  )
}

/** The presentational dock — exported for the Storybook state matrix. */
export function BugDockView(props: {
  phase: "chat" | "filed"
  collapsed: boolean
  src?: string
  filedUrl?: string
  onToggle: () => void
  onClose: () => void
  onOpenLink: (url: string) => void
}) {
  const [store, setStore] = createStore({ height: HEADER_HEIGHT + FRAME_HEIGHT })
  let contentRef: HTMLDivElement | undefined
  let frameRef: HTMLIFrameElement | undefined

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

  // Editor-theme flips reach the main app over the extension bridge; forward
  // them into the pane so both re-theme together (the split-frame idiom) —
  // the frame src stays pinned, no reload mid-report.
  onMount(() => {
    const observer = new MutationObserver(() => {
      const mode = document.documentElement.dataset.colorScheme
      if ((mode === "light" || mode === "dark") && frameRef?.contentWindow) {
        frameRef.contentWindow.postMessage({ source: "amicode", kind: "theme", colorScheme: mode }, window.location.origin)
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] })
    onCleanup(() => observer.disconnect())
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
            Bug report
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
            <iframe
              ref={(el) => (frameRef = el)}
              data-slot="bug-dock-frame"
              src={props.src}
              title="Bug report session"
              class="w-full border-0"
              style={{ height: `${FRAME_HEIGHT}px` }}
              allow="clipboard-read; clipboard-write"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
            />
          </Show>
        </div>
      </div>
    </div>
  )
}
