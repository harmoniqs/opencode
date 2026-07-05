import { Show, type JSX } from "solid-js"
import { WordmarkV2 } from "@opencode-ai/ui/v2/wordmark-v2"
import { Mark } from "@opencode-ai/ui/logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

// amicode: new-session start screen, top→bottom — H-bot mark (hero), a smaller
// AMICODE wordmark, the tagline + starter chips, then the composer. Keeps the
// centered-composer layout and the session tabs while making it "come in and get
// straight to work": the chips are the one-tap path to the next likely task.
export function NewSessionDesignView(props: { children: JSX.Element; gettingStarted?: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-y-auto bg-v2-background-bg-deep">
      <div class="absolute inset-x-0 top-[12%] flex justify-center px-6 pb-24">
        <div class={`${NEW_SESSION_CONTENT_WIDTH} flex flex-col items-center`}>
          <Mark class="w-28 h-auto mb-3" />
          <WordmarkV2 class="h-auto w-44 max-w-full text-v2-icon-icon-base mb-5" />
          <Show when={props.gettingStarted}>
            <div class="w-full flex justify-center mb-6">{props.gettingStarted}</div>
          </Show>
          <div class="w-full">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
