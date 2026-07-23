import { Show, type JSX } from "solid-js"
import { MarkDetailed } from "@opencode-ai/ui/logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

// amicode#chat-redesign (Kate): composer-as-hero, Kimi-style. Vertically
// centered column — brand mark + wordmark (tight), then the composer as the
// dominant element, then a quiet row of starter chips BELOW it. No tagline /
// how-it-works block: the chips carry that story, everything else is air.
export function NewSessionDesignView(props: { children: JSX.Element; gettingStarted?: JSX.Element }) {
  // bg-base, not bg-deep — the deep tier read too dark/high-contrast in dark
  // mode (Kate).
  return (
    <div data-component="session-new-design" class="relative size-full overflow-y-auto bg-v2-background-bg-base">
      <div class="min-h-full flex items-center justify-center px-6 py-16">
        <div class={`${NEW_SESSION_CONTENT_WIDTH} flex flex-col items-center`}>
          {/* amicode chat-redesign (Kate): mark only — no wordmark. Neutral +
              very LOW-CONTRAST in both themes: the muted-icon grey nudged well
              toward the background so the mark barely lifts off the surface. */}
          <MarkDetailed
            class="w-24 h-auto mb-6"
            style={{ color: "color-mix(in srgb, var(--v2-icon-icon-muted) 45%, var(--v2-background-bg-base))" }}
          />
          {/* chips sit directly below the mark, above the composer (Kate) */}
          <Show when={props.gettingStarted}>
            <div class="w-full flex justify-center mb-6">{props.gettingStarted}</div>
          </Show>
          <div class="w-full">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
