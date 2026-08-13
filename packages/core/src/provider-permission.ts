export * as ProviderPermissionService from "./provider-permission"

import { Context, Effect, Layer, Schema } from "effect"
import { ProviderPermission } from "@opencode-ai/schema/provider-permission"
import { Config } from "./config"
import { makeLocationNode } from "./effect/app-node"

export type EffectResult = ProviderPermission.Effect

// Re-export helpers
export const tierSummary = ProviderPermission.tierSummary
export const actionToGroup = ProviderPermission.actionToGroup
export const mostSpecificMatch = ProviderPermission.mostSpecificMatch
export const resolveEffect = ProviderPermission.resolveEffect
export const DEFAULT_TIERS = ProviderPermission.DEFAULT_TIERS
export const DEFAULT_CONFIG = ProviderPermission.DEFAULT_CONFIG

export interface Interface {
  readonly config: () => Effect.Effect<ProviderPermission.Config>
  readonly resolve: (modelId: string, action: string, resource: string) => Effect.Effect<ProviderPermission.Effect>
  readonly tierForModel: (modelId: string) => Effect.Effect<ProviderPermission.TrustTier>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/ProviderPermission") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const configService = yield* Config.Service

    const getConfig = Effect.fn("ProviderPermission.config")(function* () {
      const entries = yield* configService.entries()
      const raw = Config.latest(entries, "providerPermissions")
      if (!raw) return ProviderPermission.DEFAULT_CONFIG
      // Validate via schema, fallback to default on failure
      const decoded = yield* Schema.decodeUnknown(ProviderPermission.Config)(raw).pipe(
        Effect.catchAll(() => Effect.succeed(ProviderPermission.DEFAULT_CONFIG)),
      )
      return decoded
    })

    const resolve = Effect.fn("ProviderPermission.resolve")(function* (
      modelId: string,
      action: string,
      resource: string,
    ) {
      const cfg = yield* getConfig()
      const effect = ProviderPermission.resolveEffect(cfg, modelId, action, resource)
      // If no group mapping, fall through to ask
      return effect ?? ("ask" as const)
    })

    const tierForModel = Effect.fn("ProviderPermission.tierForModel")(function* (modelId: string) {
      const cfg = yield* getConfig()
      const tierId = cfg.assignments[modelId] ?? cfg.defaultTier
      const tier = cfg.tiers.find((t) => t.id === tierId) ?? cfg.tiers.find((t) => t.id === cfg.defaultTier)
      if (!tier) return cfg.tiers.find((t) => t.id === "unassigned")!
      return tier
    })

    return Service.of({
      config: getConfig,
      resolve,
      tierForModel,
    })
  }),
)

export const locationLayer = layer.pipe(Layer.provideMerge(Config.locationLayer))

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node],
})

// ---- Pure helpers for history redaction / context filtering ----

export function shouldRedactPath(
  config: ProviderPermission.Config,
  modelId: string,
  sourcePath: string,
): boolean {
  // Only read access matters for redaction
  const effect = ProviderPermission.resolveEffect(config, modelId, "read", sourcePath)
  return effect === "deny"
}

export function redactHistoryMessage(
  content: string,
  sourcePath: string,
  tierLabel: string,
): string {
  return `[Content from ${sourcePath} filtered — trust tier "${tierLabel}" does not have read access]`
}

// Source-path tagging: attach metadata to tool results
export type TaggedToolResult = {
  content: string
  sourcePath?: string
  metadata?: Record<string, unknown>
}

export function tagToolResult(content: string, sourcePath?: string): TaggedToolResult {
  return sourcePath ? { content, sourcePath, metadata: { sourcePath } } : { content }
}

export type MessageWithSource = {
  id: string
  role: string
  content: string
  metadata?: Record<string, unknown> & { sourcePath?: string }
  sourcePath?: string
}

export function resolveTierLabel(config: ProviderPermission.Config, modelId: string): string {
  const tierId = config.assignments[modelId] ?? config.defaultTier
  const tier = config.tiers.find((t) => t.id === tierId) ?? config.tiers.find((t) => t.id === config.defaultTier)
  return tier?.label ?? tierId
}

export function isDeniedForModel(
  config: ProviderPermission.Config,
  modelId: string,
  sourcePath: string,
): boolean {
  const effect = ProviderPermission.resolveEffect(config, modelId, "read", sourcePath)
  return effect === "deny"
}

// History redaction: filter at send-time only, does NOT mutate stored history
export function redactHistory(
  messages: readonly MessageWithSource[],
  config: ProviderPermission.Config,
  activeModelId: string,
): MessageWithSource[] {
  const tierLabel = resolveTierLabel(config, activeModelId)
  return messages.map((msg) => {
    const sourcePath = (msg.metadata?.sourcePath as string | undefined) ?? msg.sourcePath
    if (!sourcePath) return msg
    if (!isDeniedForModel(config, activeModelId, sourcePath)) return msg
    return {
      ...msg,
      content: `[Content from ${sourcePath} filtered — trust tier "${tierLabel}" does not have read access]`,
      metadata: { ...msg.metadata, redacted: true, originalSourcePath: sourcePath },
    }
  })
}

// Context filtering: suppress denied auto-context (instructions, system prompt sources)
export function filterContextFiles(
  files: readonly { path: string; content: string }[],
  config: ProviderPermission.Config,
  activeModelId: string,
): readonly { path: string; content: string }[] {
  return files.filter((file) => !isDeniedForModel(config, activeModelId, file.path))
}

// Source-path tagging helper: annotate tool results
export function tagResult(content: string, sourcePath?: string): { content: string; metadata?: Record<string, unknown> } {
  if (!sourcePath) return { content }
  return { content, metadata: { sourcePath } }
}
