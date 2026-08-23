// AMICODE: the per-session tab status dot.
//
// Replaces the Amico mark that used to sit on every tab. The mark was identical
// on all of them, so it cost a slot and carried no information; a dot in that
// slot says what the session is doing at a glance down the whole tab strip.
//
// The states are the ones the session store can actually report. There is no
// per-session error signal today — `globalStore.error` is server-wide — so an
// "error" tone is deliberately absent rather than added as a dot that never
// lights. When a per-session failure signal exists, add it here as `danger`.

export type SessionTabStatus = "idle" | "running" | "attention" | "done"

export function sessionTabStatus(input: {
  loading: boolean
  needsAttention: boolean
  unread: boolean
}): SessionTabStatus {
  // Blocked beats busy: a permission or question needs the user before anything
  // else can happen, so it must not be masked by a spinner.
  if (input.needsAttention) return "attention"
  if (input.loading) return "running"
  if (input.unread) return "done"
  return "idle"
}

const TONE: Record<SessionTabStatus, { color: string; label: string }> = {
  // a quiet neutral, so the dot still holds its slot and the strip stays aligned
  idle: { color: "var(--v2-icon-icon-muted)", label: "Idle" },
  // the brand's live hue — same language the brain uses for active thought
  running: { color: "var(--accent)", label: "Working" },
  attention: { color: "var(--v2-state-fg-warning)", label: "Needs you" },
  done: { color: "var(--v2-state-fg-success)", label: "Finished — unread" },
}

export function SessionTabStatusDot(props: { status: SessionTabStatus }) {
  const tone = () => TONE[props.status]
  return (
    <span
      data-component="session-tab-status"
      data-status={props.status}
      role="img"
      aria-label={tone().label}
      title={tone().label}
      class="relative inline-flex size-4 shrink-0 items-center justify-center"
    >
      <span
        aria-hidden="true"
        class="block size-1.5 rounded-full"
        style={{
          background: tone().color,
          // Brand yellow is 1.27:1 on a light ground, so the running dot would
          // vanish there without an edge. Every state takes the same ring so the
          // dots stay the same size and the strip does not shift between states.
          "box-shadow": `0 0 0 1px color-mix(in srgb, ${tone().color} 55%, transparent)`,
        }}
      />
    </span>
  )
}
