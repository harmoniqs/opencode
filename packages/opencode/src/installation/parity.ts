import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import { InstallationChannel, InstallationSha, InstallationVersion } from "@opencode-ai/core/installation/version"
import { Context, Duration, Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

// D3 (spec-20260905-045114): binary currency is asserted at boot on EVERY
// client and the hub — base behavior, present without any entitlement. The
// build (channel + version + sha) is compared against the release channel's
// dist-tags, and the outcome is recorded in the log as exactly one of
//
//   parity-ok | parity-drift | channel-unreachable
//
// The check FAILS OPEN: an unreachable channel never blocks boot — but it is
// recorded as its own outcome, so an assertion that never ran is never
// mistaken for one that passed. A build with channel "local" has no release
// channel to assert against and records channel-unreachable too.

export type Outcome = "parity-ok" | "parity-drift" | "channel-unreachable"

export interface Build {
  readonly channel: string
  readonly version: string
  readonly sha: string
}

const DistTags = Schema.Record(Schema.String, Schema.String)

const PROBE_URL = "https://registry.npmjs.org/-/package/opencode-ai/dist-tags"

export function resolveParity(local: Build, channelLatest: string | undefined): Outcome {
  if (local.channel === "local") return "channel-unreachable"
  if (channelLatest === undefined) return "channel-unreachable"
  return channelLatest === local.version ? "parity-ok" : "parity-drift"
}

export interface Interface {
  /**
   * Assert the running build against the release channel and record the
   * outcome in the log. Never fails and never blocks boot: any channel
   * failure (unreachable, error status, malformed answer, timeout) resolves
   * to "channel-unreachable".
   */
  readonly assert: (options?: { local?: Build; timeout?: Duration.Input }) => Effect.Effect<Outcome>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/InstallationParity") {}

export const use = serviceUse(Service)

const layer: Layer.Layer<Service, never, HttpClient.HttpClient> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    const probe = Effect.fnUntraced(function* (local: Build) {
      if (local.channel === "local") return undefined
      const response = yield* http.execute(HttpClientRequest.get(PROBE_URL))
      const body = yield* response.text
      const tags = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(DistTags))(body)
      return tags[local.channel]
    })

    const assert = Effect.fn("Parity.assert")(function* (options?: { local?: Build; timeout?: Duration.Input }) {
      const local = options?.local ?? {
        channel: InstallationChannel,
        version: InstallationVersion,
        sha: InstallationSha,
      }
      const latest = yield* probe(local).pipe(
        Effect.timeout(options?.timeout ?? "5 seconds"),
        Effect.catch(() => Effect.succeed(undefined)),
      )
      const outcome = resolveParity(local, latest)
      yield* Effect.logInfo("build parity", {
        outcome,
        channel: local.channel,
        version: local.version,
        sha: local.sha,
        latest: latest ?? "unknown",
      })
      return outcome
    })

    return Service.of({ assert })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [httpClient] })

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const assertBoot = (options?: { timeout?: Duration.Input }) => runPromise((s) => s.assert(options))

export * as Parity from "./parity"
