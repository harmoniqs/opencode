import type { JSX } from "solid-js"
import { DockShell, DockTray } from "./dock-surface"

export function DockPrompt(props: {
  kind: "question" | "permission"
  header: JSX.Element
  children: JSX.Element
  footer: JSX.Element
  ref?: (el: HTMLDivElement) => void
  onKeyDown?: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent>
}) {
  const slot = (name: string) => `${props.kind}-${name}`

  return (
    <div
      data-component="dock-prompt"
      data-kind={props.kind}
      // amicode #61 follow-up: the question panel floats on standard Glass over
      // the Brain (ADR 0002); other kinds keep their opaque surfaces for now.
      data-glass={props.kind === "question" ? "standard" : undefined}
      ref={props.ref}
      onKeyDown={props.onKeyDown}
    >
      <DockShell data-slot={slot("body")}>
        <div data-slot={slot("header")}>{props.header}</div>
        <div data-slot={slot("content")}>{props.children}</div>
      </DockShell>
      <DockTray data-slot={slot("footer")}>{props.footer}</DockTray>
    </div>
  )
}
