import { Show, type JSX } from "solid-js"
import { Logo, MarkDetailed } from "@opencode-ai/ui/logo"
import { NEW_SESSION_CONTENT_WIDTH } from "@/pages/session/new-session-layout"

// amicode#chat-redesign (Kate): composer-as-hero, Kimi-style. Vertically
// centered column — brand mark + wordmark (tight), then the composer as the
// dominant element, then a quiet row of starter chips BELOW it. No tagline /
// how-it-works block: the chips carry that story, everything else is air.
export function NewSessionDesignView(props: { children: JSX.Element; gettingStarted?: JSX.Element }) {
  // amicode latent-constellation: NO opaque fill here — a full-bleed
  // background would occlude the Brain entirely (the pane's base coat lives
  // below the canvas in the host page). Content floats on its own glass.
  return (
    <div data-component="session-new-design" class="relative size-full overflow-y-auto">
      <div class="min-h-full flex items-center justify-center px-6 py-16">
        <div class={`${NEW_SESSION_CONTENT_WIDTH} flex flex-col items-center`}>
          {/* Kimi-style hero: the low-contrast mark + the AMICODE wordmark
              (Logo), full-ink in the neutral text color. */}
          {/* mark + wordmark share one ink (Kate 2026-07-23): the Logo wordmark
              fills with var(--icon-base) in logo.tsx, so the mark matches it. */}
          {/* latent-constellation: the brand block floats on its own glass
              above the rotating web (glass vars — the #60 recipe) */}
          <div class="flex flex-col items-center rounded-xl border border-[var(--glass-edge)] bg-[var(--glass-standard-bg)] shadow-[var(--glass-shadow)] [backdrop-filter:blur(var(--glass-blur))_brightness(var(--glass-brightness,1))] [-webkit-backdrop-filter:blur(var(--glass-blur))_brightness(var(--glass-brightness,1))] px-10 py-6 mb-8">
            <MarkDetailed class="w-24 h-auto mb-4" style={{ color: "var(--icon-base)" }} />
            <Logo class="w-52 max-w-full h-auto" />
          </div>
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
