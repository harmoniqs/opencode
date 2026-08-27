import { createSignal, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { formatElapsed, formatTokens } from "./thinking"

// AMICODE: the "thinking" meta line — a single-row block shown while a reply
// streams (app TimelineThinkingRow; session-ui lane in message-part.tsx).
// Shows elapsed time, token count, and interrupt hint.
//
// The wave + cycling gerund were removed in #261: the thought-rail's morphing
// spherical-harmonic dot is now the sole working indicator. This component
// retains only the metadata that the dot cannot communicate — timing and
// token volume.
//
// Layout: a single inline row. The meta NEVER wraps mid-phrase (nowrap).
// The elapsed counter ticks from mount, so the block's height is constant.
//
// a11y: the ticking parts are aria-hidden and a single sr-only role=status
// announces the working state ONCE.

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

  return (
    <span
      class={`amc-thinking${props.class ? " " + props.class : ""}`}
      data-slot="amc-thinking"
      style={props.style}
    >
      <span class="sr-only" role="status">
        Amico is working…
      </span>
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
