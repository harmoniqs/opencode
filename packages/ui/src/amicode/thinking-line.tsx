import { createSignal, onCleanup, onMount, Show, type ComponentProps } from "solid-js"
import { wordAt, formatElapsed, formatTokens } from "./thinking"
import { AmicoWave } from "./amico-wave"

// AMICODE: the "thinking" working indicator — a Claude-Code-esque line shown
// beside the AMICO turn signature while a reply streams (message-part.tsx). The
// H-mark glyph beside this line is now static; motion lives here instead, in the
// AmicoWave glyph (amico-wave.tsx) plus the cycling gerund word + a live meta
// line (elapsed · tokens). Pure bits (word rotation, label formatting) live in
// ./thinking for testing.
//
// Motion: the wave animates continuously (CSS, amicode.css) and the word swaps
// on a ~2s timer, with no shimmer. Under prefers-reduced-motion the word is
// static ("Thinking…"); the elapsed counter still advances regardless (it's
// information, not decoration). Timers clear onCleanup so a finished turn stops
// ticking.

const WORD_MS = 2000
const TICK_MS = 1000

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export function ThinkingLine(props: {
  /** streamed token count so far; when omitted the tokens chip is hidden */
  tokens?: number
  /** show the "esc to interrupt" hint — only pass when the mount site wires esc */
  interruptible?: boolean
  class?: string
  style?: ComponentProps<"span">["style"]
}) {
  const still = reducedMotion()
  const [elapsedMs, setElapsedMs] = createSignal(0)
  const [tick, setTick] = createSignal(0)

  onMount(() => {
    const start = Date.now()
    const clock = setInterval(() => setElapsedMs(Date.now() - start), TICK_MS)
    onCleanup(() => clearInterval(clock))
    if (!still) {
      const words = setInterval(() => setTick((n) => n + 1), WORD_MS)
      onCleanup(() => clearInterval(words))
    }
  })

  const word = () => (still ? "Thinking" : wordAt(tick()))

  return (
    <span
      class={`amc-thinking${props.class ? " " + props.class : ""}`}
      data-slot="amc-thinking"
      style={props.style}
      aria-live="polite"
    >
      <AmicoWave />
      <span class="amc-thinking-word">{word()}…</span>
      <span class="amc-thinking-meta">
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
