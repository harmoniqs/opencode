import { createEffect, onCleanup, onMount } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { getFilename } from "@opencode-ai/core/util/path"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSettings } from "@/context/settings"
import { decode64 } from "@/utils/base64"
import { pathKey } from "@/utils/path-key"
import { playSoundById } from "@/utils/sound"
import { dismissToast, showToast } from "@/utils/toast"
import type { ServerScope } from "@/utils/server-scope"
import { Worktree } from "@/utils/worktree"

type WorktreeLifecycleEvent = {
  name: string
  details?: {
    type?: string
    properties?: unknown
  }
}

export function handleWorktreeLifecycleEvent(
  event: WorktreeLifecycleEvent,
  options: {
    scope: ServerScope
    setBusy?: (directory: string, value: boolean) => void
    fallbackMessage: string
  },
) {
  if (event.details?.type === "worktree.ready") {
    options.setBusy?.(event.name, false)
    Worktree.ready(options.scope, event.name)
    return true
  }
  if (event.details?.type !== "worktree.failed") return false
  options.setBusy?.(event.name, false)
  const properties = event.details.properties
  const message =
    properties && typeof properties === "object" && "message" in properties && typeof properties.message === "string"
      ? properties.message
      : options.fallbackMessage
  Worktree.failed(options.scope, event.name, message)
  return true
}

export function useNotificationToasts(options?: { setBusy?: (directory: string, value: boolean) => void }) {
  const params = useParams()
  const navigate = useNavigate()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const platform = usePlatform()
  const settings = useSettings()
  const permission = usePermission()
  const language = useLanguage()

  const currentDir = () => {
    const dir = decode64(params.dir)
    if (!dir) return ""
    return serverSync().peek(dir, { bootstrap: false })[0].path.directory || dir
  }

  onMount(() => {
    const toastBySession = new Map<string, number>()
    const alertedAtBySession = new Map<string, number>()
    const cooldownMs = 5000

    const dismissSessionAlert = (sessionKey: string) => {
      const toastId = toastBySession.get(sessionKey)
      if (toastId === undefined) return
      dismissToast(toastId)
      toastBySession.delete(sessionKey)
      alertedAtBySession.delete(sessionKey)
    }

    const unsub = serverSDK().event.listen((event) => {
      if (
        handleWorktreeLifecycleEvent(event, {
          scope: serverSDK().scope,
          setBusy: options?.setBusy,
          fallbackMessage: language.t("common.requestFailed"),
        })
      )
        return

      if (
        event.details?.type === "question.replied" ||
        event.details?.type === "question.rejected" ||
        event.details?.type === "permission.replied"
      ) {
        const props = event.details.properties as { sessionID: string }
        const sessionKey = `${event.name}:${props.sessionID}`
        dismissSessionAlert(sessionKey)
        return
      }

      if (event.details?.type !== "permission.asked" && event.details?.type !== "question.asked") return
      const title =
        event.details.type === "permission.asked"
          ? language.t("notification.permission.title")
          : language.t("notification.question.title")
      const icon = event.details.type === "permission.asked" ? ("checklist" as const) : ("bubble-5" as const)
      const directory = event.name
      const props = event.details.properties
      if (event.details.type === "permission.asked" && permission.autoResponds(event.details.properties, directory))
        return

      const [store] = serverSync().child(directory, { bootstrap: false })
      const session = store.session.find((session) => session.id === props.sessionID)
      const sessionKey = `${directory}:${props.sessionID}`

      const sessionTitle = session?.title ?? language.t("command.session.new")
      const projectName = getFilename(directory)
      const description =
        event.details.type === "permission.asked"
          ? language.t("notification.permission.description", { sessionTitle, projectName })
          : language.t("notification.question.description", { sessionTitle, projectName })
      const href = `/${base64Encode(directory)}/session/${props.sessionID}`

      const now = Date.now()
      const lastAlerted = alertedAtBySession.get(sessionKey) ?? 0
      if (now - lastAlerted < cooldownMs) return
      alertedAtBySession.set(sessionKey, now)

      if (event.details.type === "permission.asked") {
        if (settings.sounds.permissionsEnabled()) {
          void playSoundById(settings.sounds.permissions())
        }
        if (settings.notifications.permissions()) {
          void platform.notify(title, description, () => navigate(href))
        }
      }

      if (event.details.type === "question.asked") {
        if (settings.notifications.agent()) {
          void platform.notify(title, description, () => navigate(href))
        }
      }

      const currentSession = params.id
      if (pathKey(directory) === pathKey(currentDir()) && props.sessionID === currentSession) return
      if (pathKey(directory) === pathKey(currentDir()) && session?.parentID === currentSession) return

      dismissSessionAlert(sessionKey)

      const toastId = showToast({
        persistent: true,
        icon,
        title,
        description,
        actions: [
          {
            label: language.t("notification.action.goToSession"),
            onClick: () => navigate(href),
          },
          {
            label: language.t("common.dismiss"),
            onClick: "dismiss",
          },
        ],
      })
      toastBySession.set(sessionKey, toastId)
    })
    onCleanup(unsub)

    createEffect(() => {
      const currentSession = params.id
      if (!currentDir() || !currentSession) return
      const sessionKey = `${currentDir()}:${currentSession}`
      dismissSessionAlert(sessionKey)
      const [store] = serverSync().child(currentDir(), { bootstrap: false })
      const childSessions = store.session.filter((session) => session.parentID === currentSession)
      for (const child of childSessions) {
        dismissSessionAlert(`${currentDir()}:${child.id}`)
      }
    })
  })
}
