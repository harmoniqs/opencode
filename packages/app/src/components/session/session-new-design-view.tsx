import { Show, type JSX } from "solid-js"
import { WordmarkV2 } from "@opencode-ai/ui/v2/wordmark-v2"
import { Mark } from "@opencode-ai/ui/logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

// amicode: the new-session design view carries the full brand + getting-started
// block — H-bot mark, wordmark, then (below the composer) the tagline + starter
// chips. This keeps the "come in and get straight to work" feel of the classic
// NewSessionView while retaining the new centered-composer layout and the
// session tabs. The chips are the one-tap path to the next likely task.
export function NewSessionDesignView(props: { children: JSX.Element; gettingStarted?: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-y-auto bg-v2-background-bg-deep">
      <div class="absolute inset-x-0 top-[16%] flex justify-center px-6 pb-24">
        <div class={NEW_SESSION_CONTENT_WIDTH}>
          <div class="flex justify-center mb-5">
            <Mark class="w-16 h-auto" />
          </div>
          <WordmarkV2 class="h-auto w-full text-v2-icon-icon-base" />
          <div class="mt-8">{props.children}</div>
          <Show when={props.gettingStarted}>
            <div class="mt-6 flex justify-center">{props.gettingStarted}</div>
          </Show>
        </div>
      </div>
    </div>
  )
}
