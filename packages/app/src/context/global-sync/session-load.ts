import type { SessionApi } from "@opencode-ai/client/promise"
import { normalizeSessionInfo } from "@/utils/session"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import type { Session } from "@opencode-ai/sdk/v2/client"

/** One page of the boot session-list fetch. `currency` carries the server's
 *  derived currency token (D2) — undefined for v1 hubs, which predate it. */
export type RootSessionsPage = {
  readonly data: Session[]
  readonly limit: number
  readonly limited: boolean
  readonly currency: string | undefined
}

export async function loadRootSessions(input: {
  api: Pick<SessionApi, "list">
  directory: string
  limit: number
}): Promise<RootSessionsPage> {
  const result = await input.api.list({
    directory: input.directory,
    parentID: null,
    limit: input.limit,
    order: "desc",
  })
  // D2: the derived currency token rides the response so the client can
  // verify its persisted snapshot against the server on boot. The vendored
  // client's generated types predate the additive field — read it
  // structurally until the vendored snapshot is refreshed.
  const currency = (result as { currency?: string | null }).currency ?? undefined
  return {
    data: result.data.map(normalizeSessionInfo),
    limit: input.limit,
    limited: true,
    currency,
  }
}

export async function loadRootSessionsV1(input: {
  client: OpencodeClient
  directory: string
  limit: number
}): Promise<RootSessionsPage> {
  try {
    const result = await input.client.session.list({ directory: input.directory, roots: true, limit: input.limit })
    return { data: result.data ?? [], limit: input.limit, limited: true, currency: undefined }
  } catch {
    const result = await input.client.session.list({ directory: input.directory, roots: true })
    return { data: result.data ?? [], limit: input.limit, limited: false, currency: undefined }
  }
}

export function estimateRootSessionTotal(input: { count: number; limit: number; limited: boolean }) {
  if (!input.limited) return input.count
  if (input.count < input.limit) return input.count
  return input.count + 1
}
