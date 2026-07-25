import { Component, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"

type PromptDragOverlayProps = {
  type: "image" | "@mention" | null
  label: string
}

const kindToIcon = {
  image: "photo",
  "@mention": "link",
} as const

export const PromptDragOverlay: Component<PromptDragOverlayProps> = (props) => {
  return (
    <Show when={props.type !== null}>
      {/* glass sweep (#56): the drop scrim must MASK the composer beneath, so it
          keeps a heavier token tint — but now with the shared blur (glass, just
          denser), never a raw 90%-opaque token alone */}
      <div class="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_srgb,var(--surface-raised-stronger-non-alpha)_80%,transparent)] [backdrop-filter:blur(var(--glass-blur,8px))] [-webkit-backdrop-filter:blur(var(--glass-blur,8px))] pointer-events-none">
        <div class="flex flex-col items-center gap-2 text-text-weak">
          <Icon name={props.type ? kindToIcon[props.type] : kindToIcon.image} class="size-8" />
          <span class="text-14-regular">{props.label}</span>
        </div>
      </div>
    </Show>
  )
}
