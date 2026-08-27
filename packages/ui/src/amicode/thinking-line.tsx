import { createSignal, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { formatElapsed, formatTokens } from "./thinking"
import { HarmonicDot } from "./harmonic-dot"

// AMICODE: the "thinking" meta line — shown while a reply streams.
// Contains the harmonic dot positioned in the rail gutter (same x as rail dots)
// during the initial thinking phase. Once content arrives and the real rail dot
// takes over, the inline dot simply disappears.

const TICK_MS = 1000

export function ThinkingLine(props: {
  /** streamed token count so far; when omitted the tokens chip is hidden */
  tokens?: number
  /** show the "esc to interrupt" hint — only pass when the mount site wires esc */
  interruptible?: boolean
  /** @deprecated no-op; kept for call-site compat */
  mark?: boolean
  class?: string
  style?: ComponentProps<"span">["style"]
}) {
  const [elapsedMs, setElapsedMs] = createSignal(0)

  onMount(() => {
    const start = Date.now()
    const clock = setInterval(() => setElapsedMs(Date.now() - start), TICK_MS)
    onCleanup(() => clearInterval(clock))
  })

  // Hide dot once tokens flow (rail dot takes over)
  const hasContent = () => props.tokens != null

  return (
    <span
      class={`amc-thinking${props.class ? " " + props.class : ""}`}
      data-slot="amc-thinking"
      style={props.style}
    >
      <span class="sr-only" role="status">
        Amico is working…
      </span>
      <Show when={!hasContent()}>
        <span class="amc-thinking-dot" aria-hidden="true">
          <HarmonicDot />
        </span>
      </Show>
      <span class="amc-thinking-meta" aria-hidden="true">
        <span class="amc-thinking-elapsed">{formatElapsed(elapsedMs())}</span>
        <Show when={props.tokens != null}>
          <span class="amc-thinking-sep">·</span>
          <span class="amc-thinking-tokens">↑ {formatTokens(props.tokens!)} tokens</span>
        </Show>
        <Show when={props.interruptible}>
          <span class="amc-thinking-sep">·</span>
          <span class="amc-thinking-hint">esc to interrupt</span>
        </Show>
      </span>
    </span>
  )
}
