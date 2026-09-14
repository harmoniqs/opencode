import { Global } from "@opencode-ai/core/global"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

/** Host-local receipt evidence. Contents never enter the session database. */
export namespace SessionEvidence {
  export type Entry = { receiptID: string; content: string }

  const root = () => path.join(Global.Path.data, "session-receipt-evidence")
  const directory = (rootID: string) => path.join(root(), encodeURIComponent(rootID))
  const file = (rootID: string, operationID: string) =>
    path.join(directory(rootID), `${encodeURIComponent(operationID)}.json`)

  export function write(rootID: string, operationID: string, entries: ReadonlyArray<Entry>, maxBytes: number) {
    const bytes = entries.reduce((total, entry) => total + new TextEncoder().encode(entry.content).byteLength, 0)
    if (bytes > maxBytes) return false
    const target = file(rootID, operationID)
    mkdirSync(path.dirname(target), { recursive: true })
    const temporary = `${target}.${crypto.randomUUID()}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, entries }))
      renameSync(temporary, target)
      return true
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
  }

  export function exists(rootID: string, operationID: string) {
    return existsSync(file(rootID, operationID))
  }

  export function read(rootID: string, operationID: string): Entry[] | undefined {
    try {
      const parsed: unknown = JSON.parse(readFileSync(file(rootID, operationID), "utf8"))
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("version" in parsed) ||
        parsed.version !== 1 ||
        !("entries" in parsed) ||
        !Array.isArray(parsed.entries) ||
        !parsed.entries.every(
          (entry: unknown): entry is Entry =>
            typeof entry === "object" &&
            entry !== null &&
            "receiptID" in entry &&
            typeof entry.receiptID === "string" &&
            "content" in entry &&
            typeof entry.content === "string",
        )
      )
        return
      return parsed.entries
    } catch {
      return
    }
  }

  export function has(rootID: string, operationID: string, receiptID: string) {
    return read(rootID, operationID)?.some((entry) => entry.receiptID === receiptID) ?? false
  }

  export function removeRoot(rootID: string) {
    rmSync(directory(rootID), { recursive: true, force: true })
  }

  /** Remove evidence left by interrupted publication; committed operation IDs retain their sidecars. */
  export function sweep(rootID: string, committedOperationIDs: ReadonlySet<string>) {
    const dir = directory(rootID)
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      const operationID = entry.endsWith(".json") ? decodeURIComponent(entry.slice(0, -".json".length)) : undefined
      if (!operationID || !committedOperationIDs.has(operationID))
        rmSync(path.join(dir, entry), { recursive: true, force: true })
    }
  }
}
