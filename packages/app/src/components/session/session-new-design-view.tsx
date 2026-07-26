import { Show, type JSX } from "solid-js"

// amicode#chat-redesign (Kate 2026-07-25): the composer is a full-bleed dock
// stuck to the BOTTOM of the screen, ~40% of the viewport tall, edge-to-edge
// (no radius, no border). The rotating latent constellation fills the space
// above it; the starter chips sit just above the dock. No brand mark/wordmark.
export function NewSessionDesignView(props: { children: JSX.Element; gettingStarted?: JSX.Element }) {
  // amicode latent-constellation: NO opaque fill here — a full-bleed background
  // would occlude the Brain entirely (the pane's base coat lives below the
  // canvas in the host page). Content floats on its own glass.
  return (
    <div data-component="session-new-design" class="relative size-full overflow-hidden flex flex-col">
      {/* upper region: the constellation shows through; chips anchor just above
          the docked composer */}
      <div class="flex-1 min-h-0 flex items-end justify-center px-6 pb-8">
        <Show when={props.gettingStarted}>
          <div class="flex justify-center">{props.gettingStarted}</div>
        </Show>
      </div>
      {/* composer: full-width, bottom-stuck, ~35% of the viewport height,
          edge-to-edge (radius/border zeroed on the composer itself) */}
      <div data-slot="new-session-composer-dock" class="h-[35%] shrink-0 w-full flex flex-col">
        {props.children}
      </div>
    </div>
  )
}
