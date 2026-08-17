import { randomUUID } from "node:crypto"

/** A random identifier generated fresh on each `refresh()` call. Clients persist
 *  this alongside the server URL and detect restarts by comparing it to the
 *  `bootId` emitted in the `server.connected` SSE event. */
let _bootId: string | undefined

export function refresh() {
  _bootId = randomUUID()
}

export function get(): string | undefined {
  return _bootId
}

export * as BootId from "./boot-id"
