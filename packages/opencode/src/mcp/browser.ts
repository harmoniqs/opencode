import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import open from "open"

export interface Interface {
  readonly open: (url: string) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/McpBrowser") {}

const layer = Layer.succeed(
  Service,
  Service.of({
    open: Effect.fn("McpBrowser.open")(function* (url: string) {
      // VS Code remote: BROWSER points at the helper that does `code --openExternal`
      // via VSCODE_IPC_HOOK_CLI. `open` on Linux uses xdg-open, which is absent
      // or mis-configured in minimal containers, so the browser never opens.
      // Respect BROWSER first when it is set (the extension host propagates it
      // to the server via ServerManager's env inheritance). Fallback to `open`
      // preserves the existing desktop behavior.
      const browserCmd = process.env.BROWSER?.trim()
      if (browserCmd) {
        const { spawn } = yield* Effect.tryPromise({
          try: () => import("node:child_process"),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        })
        const subprocess = yield* Effect.tryPromise({
          try: () =>
            new Promise((resolve, reject) => {
              try {
                const child = spawn(browserCmd, [url], { stdio: "ignore", detached: true })
                child.unref()
                resolve(child)
              } catch (e) {
                reject(e)
              }
            }),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        })
        yield* Effect.callback<void, Error>((resume) => {
          const timer = setTimeout(() => resume(Effect.void), 800)
          subprocess.on("error", (error) => {
            clearTimeout(timer)
            resume(Effect.fail(error))
          })
          subprocess.on("exit", (code) => {
            if (code === null || code === 0) return
            clearTimeout(timer)
            resume(Effect.fail(new Error(`Browser open failed with exit code ${code} (BROWSER=${browserCmd})`)))
          })
        })
        return
      }
      const subprocess = yield* Effect.tryPromise({
        try: () => open(url),
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      })
      yield* Effect.callback<void, Error>((resume) => {
        const timer = setTimeout(() => resume(Effect.void), 500)
        subprocess.on("error", (error) => {
          clearTimeout(timer)
          resume(Effect.fail(error))
        })
        subprocess.on("exit", (code) => {
          if (code === null || code === 0) return
          clearTimeout(timer)
          resume(Effect.fail(new Error(`Browser open failed with exit code ${code}`)))
        })
      })
    }),
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [] })

export * as McpBrowser from "./browser"
