import { Show, type JSX } from "solid-js"
import { Logo, Mark } from "@opencode-ai/ui/logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

// amicode: new-session start screen, top→bottom — H-bot mark (hero), the AMICODE
// wordmark, tagline + how-it-works + starter chips, then the composer. Sizing
// mirrors the classic NewSessionView (Mark w-36 / Logo w-72); keeps the session
// tabs and centered composer. The chips are the one-tap path to the next task.
export function NewSessionDesignView(props: { children: JSX.Element; gettingStarted?: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-y-auto bg-v2-background-bg-deep">
      <div class="absolute inset-x-0 top-[12%] flex justify-center px-6 pb-24">
        <div class={`${NEW_SESSION_CONTENT_WIDTH} flex flex-col items-center`}>
          <Mark class="w-36 h-auto mb-4" />
          <Logo class="w-72 max-w-full h-auto mb-6" />
          <Show when={props.gettingStarted}>
            <div class="w-full flex justify-center mb-6">{props.gettingStarted}</div>
          </Show>
          <div class="w-full">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
