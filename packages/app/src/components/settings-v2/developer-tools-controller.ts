import { createSignal, onCleanup } from "solid-js"
import { useSettings } from "@/context/settings"
import { inAmicode } from "@/utils/amicode-bridge"

export interface DevToolsStatus {
  opencodeValid: boolean
  opencodeError?: string
  amicodeValid: boolean
  amicodeError?: string
  serverRestarted: boolean
  reloadNeeded: boolean
}

export function createDeveloperToolsController() {
  const settings = useSettings()
  const [status, setStatus] = createSignal<DevToolsStatus | undefined>(undefined)
  const [pending, setPending] = createSignal(false)

  // Listen for the extension host's validation reply
  const handleMessage = (event: MessageEvent) => {
    const d = event.data
    if (d && d.source === "amicode" && d.kind === "dev-tools-status") {
      setStatus({
        opencodeValid: d.opencodeValid ?? true,
        opencodeError: d.opencodeError,
        amicodeValid: d.amicodeValid ?? true,
        amicodeError: d.amicodeError,
        serverRestarted: d.serverRestarted ?? false,
        reloadNeeded: d.reloadNeeded ?? false,
      })
      setPending(false)
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("message", handleMessage)
    onCleanup(() => window.removeEventListener("message", handleMessage))
  }

  const sendUpdate = () => {
    if (!inAmicode()) return
    setPending(true)
    setStatus(undefined)
    window.parent.postMessage(
      {
        source: "amicode",
        kind: "dev-tools-update",
        enabled: settings.developer.enabled(),
        opencodePath: settings.developer.opencodePath(),
        amicodePath: settings.developer.amicodePath(),
      },
      "*",
    )
  }

  return {
    enabled: settings.developer.enabled,
    setEnabled: (value: boolean) => {
      settings.developer.setEnabled(value)
      sendUpdate()
    },
    opencodePath: settings.developer.opencodePath,
    setOpencodePath: (value: string) => {
      settings.developer.setOpencodePath(value)
    },
    amicodePath: settings.developer.amicodePath,
    setAmicodePath: (value: string) => {
      settings.developer.setAmicodePath(value)
    },
    /** Trigger validation + apply on blur */
    commitOpencodePath: () => sendUpdate(),
    commitAmicodePath: () => sendUpdate(),
    status,
    pending,
  }
}

export type DeveloperToolsController = ReturnType<typeof createDeveloperToolsController>
