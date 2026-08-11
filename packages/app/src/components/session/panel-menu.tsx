import { For, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PanelMenuItem {
  id: string
  label: string
  icon: string
  available: () => boolean
  active?: () => boolean
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PanelMenu(props: {
  items: PanelMenuItem[]
  onSelect: (id: string) => void
  openFileKeybind?: () => string[][]
  v2?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger class="flex items-center justify-center">
        <Show
          when={props.v2}
          fallback={
            <IconButton
              icon="plus-small"
              variant="ghost"
              iconSize="large"
              class="!rounded-md"
              aria-label="Open panel"
            />
          }
        >
          <IconButtonV2
            icon={<Icon name="plus-small" />}
            variant="ghost-muted"
            size="large"
            aria-label="Open panel"
          />
        </Show>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          class="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border-base bg-background-base p-1 shadow-md animate-in fade-in-0 zoom-in-95"
        >
          <For each={props.items.filter((item) => item.available())}>
            {(item) => (
              <DropdownMenu.Item
                class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-12-regular text-text-base cursor-pointer outline-none hover:bg-background-stronger focus:bg-background-stronger transition-colors"
                classList={{
                  "opacity-60": item.active?.() ?? false,
                }}
                onSelect={() => props.onSelect(item.id)}
              >
                <Icon name={item.icon as any} size="small" class="text-text-weak" />
                <span>{item.label}</span>
                <Show when={item.active?.()}>
                  <Icon name="check-small" size="small" class="ml-auto text-text-weak" />
                </Show>
              </DropdownMenu.Item>
            )}
          </For>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}
