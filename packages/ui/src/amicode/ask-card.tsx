import { For, Show, createSignal } from "solid-js"
import { amicodeAskBridge } from "./ask-bridge"
import type { AskInput } from "./ask"

// AMICODE: question card for amicode_ask tool parts — question text + one
// button per option (with optional dim detail line under each label). Click
// submits the option string as the user's next chat message through the ask
// bridge, then locks the card. Buttons are also disabled once the user has
// replied AFTER this card's message (assistant text streamed after the ask
// does NOT lock it — live-demo fix 2026-07-03), or when no bridge is
// registered. Display label is AMICO (the persona); component/data-*
// identifiers stay amicode-*.

export function AmicodeAskCard(props: { ask: AskInput; messageID?: string }) {
  const [picked, setPicked] = createSignal<string | undefined>(undefined)

  const active = () => {
    if (picked()) return false
    const bridge = amicodeAskBridge()
    if (!bridge || !props.messageID) return false
    return !bridge.hasUserReplyAfter(props.messageID)
  }

  const submit = (option: string) => {
    const bridge = amicodeAskBridge()
    if (!bridge || !active()) return
    setPicked(option)
    bridge.send(option)
  }

  return (
    <div
      data-component="amicode-ask-card"
      style={{
        "display": "flex",
        "flex-direction": "column",
        "gap": "8px",
        "min-width": "0",
        "border": "1px solid var(--v2-border-border-base)",
        "border-left": "3px solid var(--v2-icon-icon-accent)",
        "border-radius": "6px",
        "background": "var(--v2-background-bg-layer-01)",
        "padding": "8px 12px",
        "font-size": "12px",
        "line-height": "16px",
      }}
    >
      <div style={{ display: "flex", "align-items": "baseline", gap: "8px" }}>
        <span
          style={{
            "font-weight": "700",
            "letter-spacing": "0.08em",
            "color": "var(--v2-text-text-accent)",
          }}
        >
          AMICODE
        </span>
        <span style={{ color: "var(--v2-text-text-faint)" }}>·</span>
        <span style={{ "font-weight": "600", "color": "var(--v2-text-text-base)" }}>Question</span>
      </div>
      <div data-slot="amicode-ask-question" style={{ "font-size": "13px", "color": "var(--v2-text-text-base)" }}>
        {props.ask.question}
      </div>
      <div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px" }}>
        <For each={props.ask.options}>
          {(option, index) => (
            <button
              type="button"
              data-slot="amicode-ask-option"
              data-picked={picked() === option ? "true" : undefined}
              disabled={!active()}
              onClick={() => submit(option)}
              style={{
                "display": "flex",
                "flex-direction": "column",
                "align-items": "flex-start",
                "gap": "2px",
                "text-align": "left",
                "border":
                  picked() === option
                    ? "1px solid var(--v2-icon-icon-accent)"
                    : "1px solid var(--v2-border-border-strong)",
                "border-radius": "6px",
                "background": "var(--v2-background-bg-layer-02)",
                "color": "var(--v2-text-text-base)",
                "padding": "3px 10px",
                "font-size": "12px",
                "line-height": "16px",
                "cursor": active() ? "pointer" : "default",
                "opacity": active() || picked() === option ? "1" : "0.55",
              }}
            >
              <span>{option}</span>
              <Show when={props.ask.details?.[index()]}>
                {(detail) => (
                  <span
                    data-slot="amicode-ask-option-detail"
                    style={{
                      "font-size": "11px",
                      "line-height": "14px",
                      "color": "var(--v2-text-text-faint)",
                    }}
                  >
                    {detail()}
                  </span>
                )}
              </Show>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
