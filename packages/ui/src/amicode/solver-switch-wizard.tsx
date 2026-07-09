import { For, Show, createSignal, onCleanup, onMount } from "solid-js"
import { Mark } from "../components/logo"

// AMICODE: the solver-switch wizard — a staged overlay shown while the
// extension performs a REAL solver switch (entitlement grant → session-server
// restart → ready). Stage progress is driven by polling GET /amicode/solver-mode
// through the restart window (connection failures are EXPECTED mid-switch and
// advance the "restarting" stage rather than erroring). Honest theater: every
// stage corresponds to something actually happening on the other side of the
// solver-mode.json contract.

export type SwitchTarget = "piccolo" | "hp"

const STAGES: Record<SwitchTarget, string[]> = {
  hp: ["Unlocking Piccolissimo (issimo entitlement)", "Restarting session server", "Piccolissimo ready"],
  piccolo: ["Reverting to the public stack", "Restarting session server", "Piccolo ready"],
}

export function AmicodeSolverSwitchWizard(props: {
  target: SwitchTarget
  /** Poll fn: resolves {mode, status} or rejects while the server restarts. */
  poll: () => Promise<{ mode: string; status: string }>
  onDone: () => void
}) {
  const [stage, setStage] = createSignal(0)
  const [done, setDone] = createSignal(false)
  let timer: ReturnType<typeof setInterval> | undefined
  let sawRestart = false

  onMount(() => {
    const started = Date.now()
    timer = setInterval(async () => {
      try {
        const state = await props.poll()
        if (sawRestart || Date.now() - started > 1500) setStage((s) => Math.max(s, sawRestart ? 2 : 1))
        if (state.mode === props.target && state.status === "ready") {
          setStage(STAGES[props.target].length - 1)
          setDone(true)
          if (timer) clearInterval(timer)
          setTimeout(() => props.onDone(), 1400)
        }
      } catch {
        // server down mid-restart — that IS stage 2
        sawRestart = true
        setStage((s) => Math.max(s, 1))
      }
      // safety valve: never trap the user behind theater
      if (Date.now() - started > 90_000) {
        if (timer) clearInterval(timer)
        props.onDone()
      }
    }, 900)
  })
  onCleanup(() => {
    if (timer) clearInterval(timer)
  })

  return (
    <div
      data-component="amicode-solver-switch-wizard"
      style={{
        position: "fixed",
        inset: "0",
        "z-index": "80",
        background: "color-mix(in srgb, #000 62%, transparent)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
      }}
    >
      <div
        style={{
          width: "min(440px, calc(100vw - 48px))",
          "border-radius": "16px",
          border: "1px solid var(--v2-border-border-base)",
          "border-top": "4px solid var(--v2-icon-icon-accent)",
          background: "var(--v2-background-bg-base)",
          padding: "26px 30px",
          display: "flex",
          "flex-direction": "column",
          gap: "16px",
          "align-items": "center",
        }}
      >
        <Mark class="w-10 h-auto" />
        <div style={{ "font-size": "16px", "font-weight": "700", color: "var(--v2-text-text-base)" }}>
          {props.target === "hp" ? "Switching to High-Performance Solver" : "Switching to Piccolo"}
        </div>
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px", "align-self": "stretch" }}>
          <For each={STAGES[props.target]}>
            {(label, i) => (
              <div style={{ display: "flex", "align-items": "center", gap: "8px", "font-size": "13px" }}>
                <span
                  style={{
                    width: "16px",
                    "text-align": "center",
                    color:
                      i() < stage() || done()
                        ? "var(--v2-state-fg-success)"
                        : i() === stage()
                          ? "var(--v2-icon-icon-accent)"
                          : "var(--v2-text-text-faint)",
                  }}
                >
                  {i() < stage() || done() ? "✓" : i() === stage() ? "◌" : "·"}
                </span>
                <span
                  style={{ color: i() <= stage() || done() ? "var(--v2-text-text-base)" : "var(--v2-text-text-faint)" }}
                >
                  {label}
                </span>
              </div>
            )}
          </For>
        </div>
        <Show when={!done()}>
          <div style={{ "font-size": "11px", color: "var(--v2-text-text-faint)" }}>
            the chat will reconnect automatically
          </div>
        </Show>
      </div>
    </div>
  )
}
