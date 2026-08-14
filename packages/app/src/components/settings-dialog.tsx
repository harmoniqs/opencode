import { useParams } from "@solidjs/router"
import { onCleanup, onMount } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useDialog } from "@opencode-ai/ui/context/dialog"

export function useSettingsDialog(defaultValue?: string, scrollTo?: string) {
  const dialog = useDialog()
  const params = useParams<{ id?: string }>()
  let run = 0
  let dead = false

  onCleanup(() => {
    dead = true
  })

  return () => {
    const current = ++run
    const sessionID = params.id
    void import("@/components/settings-v2").then((module) => {
      if (dead || run !== current) return
      void dialog.show(() => <module.DialogSettings sessionID={sessionID} defaultValue={defaultValue} scrollTo={scrollTo} />)
    })
  }
}

export function useSettingsCommand() {
  const command = useCommand()
  const language = useLanguage()
  const show = useSettingsDialog()

  command.register("settings", () => [
    {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: show,
    },
  ])

  return show
}

/** Renders nothing. On mount, checks if a dev-tools rebuild just completed and
 *  auto-opens the settings dialog scrolled to Developer Tools. Must be placed
 *  inside DialogProvider so it works on every page (dashboard, session, etc). */
export function DevToolsReopenBridge() {
  const dialog = useDialog()

  onMount(() => {
    try {
      if (localStorage.getItem("amicode:devtools-reopen") === "1") {
        localStorage.removeItem("amicode:devtools-reopen")
        setTimeout(() => {
          void import("@/components/settings-v2").then((module) => {
            void dialog.show(() => (
              <module.DialogSettings defaultValue="general" scrollTo="settings-developer-tools" />
            ))
          })
        }, 300)
      }
    } catch {
      // localStorage unavailable — non-critical
    }
  })

  return null
}
