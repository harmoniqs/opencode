import { createSignal, onCleanup, onMount } from "solid-js"
import { useSettings } from "@/context/settings"
import { inAmicode } from "@/utils/amicode-bridge"

export interface DevToolsStatus {
  opencodeValid: boolean
  opencodeError?: string
  amicodeValid: boolean
  amicodeError?: string
  serverRestarted: boolean
  reloadNeeded: boolean
  building?: boolean
  buildError?: string
}

export type RebuildState = "idle" | "rebuilding" | "rebuilt" | "failed"

/** Default repo paths autofilled when the toggle is turned ON with empty fields. */
const DEFAULT_OPENCODE_PATH = "~/harmoniqs/opencode"
const DEFAULT_AMICODE_PATH = "~/harmoniqs/amicode"

export function createDeveloperToolsController() {
  const settings = useSettings()
  const [status, setStatus] = createSignal<DevToolsStatus | undefined>(undefined)
  const [pending, setPending] = createSignal(false)
  const [rebuildState, setRebuildState] = createSignal<RebuildState>("idle")
  const [rebuildError, setRebuildError] = createSignal<string | undefined>(undefined)

  // On mount, check if we just came back from a successful rebuild reload
  onMount(() => {
    try {
      if (localStorage.getItem("amicode:devtools-rebuilt") === "1") {
        localStorage.removeItem("amicode:devtools-rebuilt")
        setRebuildState("rebuilt")
        // Clear the "rebuilt" badge after 5 seconds
        setTimeout(() => setRebuildState("idle"), 5000)
      }
    } catch {
      // non-critical
    }
  })

  // Listen for the extension host's replies
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
        building: d.building ?? false,
        buildError: d.buildError,
      })
      setPending(false)

      // When a reload is needed (extension was rebuilt), set a flag so the app
      // reopens settings at the developer tools section after the reload.
      if (d.reloadNeeded) {
        try {
          localStorage.setItem("amicode:devtools-reopen", "1")
          localStorage.setItem("amicode:devtools-rebuilt", "1")
        } catch {
          // localStorage unavailable — non-critical
        }
      }
    }

    // Rebuild status messages
    if (d && d.source === "amicode" && d.kind === "dev-tools-rebuild-status") {
      if (d.state === "rebuilding") {
        setRebuildState("rebuilding")
        setRebuildError(undefined)
      } else if (d.state === "failed") {
        setRebuildState("failed")
        setRebuildError(d.error ?? "Unknown error")
      }
      // "done" state triggers a reload — the "rebuilt" flag is read on next mount
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

  const rebuild = (mode: "local" | "remote") => {
    if (!inAmicode()) return
    if (rebuildState() === "rebuilding") return // prevent double-clicks
    setRebuildState("rebuilding")
    setRebuildError(undefined)
    try {
      localStorage.setItem("amicode:devtools-reopen", "1")
      localStorage.setItem("amicode:devtools-rebuilt", "1")
    } catch {
      // non-critical
    }
    window.parent.postMessage(
      {
        source: "amicode",
        kind: "dev-tools-rebuild",
        mode,
        opencodePath: settings.developer.opencodePath(),
        amicodePath: settings.developer.amicodePath(),
      },
      "*",
    )
  }

  return {
    enabled: settings.developer.enabled,
    setEnabled: (value: boolean) => {
      // Autofill paths with defaults when toggling ON with empty fields
      if (value) {
        if (!settings.developer.opencodePath()) {
          settings.developer.setOpencodePath(DEFAULT_OPENCODE_PATH)
        }
        if (!settings.developer.amicodePath()) {
          settings.developer.setAmicodePath(DEFAULT_AMICODE_PATH)
        }
      }
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
    /** Trigger a full rebuild (local = from disk, remote = git pull first) */
    rebuild,
    status,
    pending,
    rebuildState,
    rebuildError,
  }
}

export type DeveloperToolsController = ReturnType<typeof createDeveloperToolsController>
