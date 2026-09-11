import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import * as TestConsole from "effect/testing/TestConsole"
import { Parity } from "../../src/installation/parity"
import { testEffect } from "../lib/effect"

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))))
  return Layer.succeed(HttpClient.HttpClient, client)
}

function failingHttpClient() {
  const client = HttpClient.make((request) =>
    Effect.fail(new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) })),
  )
  return Layer.succeed(HttpClient.HttpClient, client)
}

function hangingHttpClient() {
  const client = HttpClient.make(() => Effect.never)
  return Layer.succeed(HttpClient.HttpClient, client)
}

function distTagsResponse(tags: Record<string, string>) {
  return new Response(JSON.stringify(tags), { status: 200, headers: { "content-type": "application/json" } })
}

function testLayer(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  return LayerNode.compile(Parity.node, [[httpClient, mockHttpClient(handler)]])
}

const local = { channel: "latest", version: "1.2.3", sha: "abc1234" }

// The boot parity record is one structured log entry: an object carrying the
// outcome plus the build identity it was asserted for.
function isRecord(line: unknown): line is { outcome: string; channel: string; version: string; sha: string } {
  return typeof line === "object" && line !== null && "outcome" in line && "channel" in line
}

function recordedLines() {
  return Effect.map(TestConsole.logLines, (lines) => lines.filter(isRecord))
}

describe("installation parity", () => {
  testEffect(testLayer(() => distTagsResponse({ latest: "1.2.3", dev: "1.3.0" }))).effect(
    "channel in parity with the local build records exactly one parity-ok",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local })
        expect(outcome).toBe("parity-ok")
        const records = yield* recordedLines()
        expect(records).toHaveLength(1)
        expect(records[0]?.outcome).toBe("parity-ok")
        expect(records[0]?.version).toBe("1.2.3")
        expect(records[0]?.sha).toBe("abc1234")
      }),
  )

  testEffect(testLayer(() => distTagsResponse({ latest: "9.9.9", dev: "1.2.3" }))).effect(
    "the channel tag is picked by the local build's channel, not by latest",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local: { ...local, channel: "dev" } })
        expect(outcome).toBe("parity-ok")
      }),
  )

  testEffect(testLayer(() => distTagsResponse({ latest: "2.0.0" }))).effect(
    "a lagging build records parity-drift against the channel",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local })
        expect(outcome).toBe("parity-drift")
        const records = yield* recordedLines()
        expect(records).toHaveLength(1)
        expect(records[0]?.outcome).toBe("parity-drift")
      }),
  )

  testEffect(testLayer(() => distTagsResponse({ latest: "9.9.9" }))).effect(
    "a channel tag missing the local build's channel records channel-unreachable",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local: { ...local, channel: "dev" } })
        expect(outcome).toBe("channel-unreachable")
      }),
  )

  testEffect(testLayer(() => new Response("gateway timeout", { status: 504 }))).effect(
    "a channel that answers with an error status records channel-unreachable and fails open",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local })
        expect(outcome).toBe("channel-unreachable")
        const records = yield* recordedLines()
        expect(records).toHaveLength(1)
        expect(records[0]?.outcome).toBe("channel-unreachable")
      }),
  )

  testEffect(testLayer(() => new Response("<html>not json</html>", { status: 200 }))).effect(
    "a channel answering garbage records channel-unreachable and fails open",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local })
        expect(outcome).toBe("channel-unreachable")
      }),
  )

  testEffect(LayerNode.compile(Parity.node, [[httpClient, failingHttpClient()]])).effect(
    "an unreachable channel records channel-unreachable and never fails the boot",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local })
        expect(outcome).toBe("channel-unreachable")
        const records = yield* recordedLines()
        expect(records).toHaveLength(1)
        expect(records[0]?.outcome).toBe("channel-unreachable")
      }),
  )

  testEffect(LayerNode.compile(Parity.node, [[httpClient, hangingHttpClient()]])).live(
    "a hung channel is bounded and records channel-unreachable",
    () =>
      Effect.gen(function* () {
        const outcome = yield* Parity.use.assert({ local, timeout: "100 millis" })
        expect(outcome).toBe("channel-unreachable")
      }),
    5_000,
  )

  const probeCalls: string[] = []
  testEffect(
    testLayer((request) => {
      probeCalls.push(request.url)
      return distTagsResponse({ latest: "1.2.3" })
    }),
  ).effect("a local build has no release channel — recorded channel-unreachable, never parity-ok, no probe", () =>
    Effect.gen(function* () {
      const outcome = yield* Parity.use.assert({
        local: { channel: "local", version: "0.0.0", sha: "dev" },
      })
      expect(outcome).toBe("channel-unreachable")
      expect(probeCalls).toHaveLength(0)
    }),
  )

  const distTagCalls: string[] = []
  testEffect(
    testLayer((request) => {
      distTagCalls.push(request.url)
      return distTagsResponse({ latest: "1.2.3" })
    }),
  ).effect("the probe hits the release channel dist-tags endpoint", () =>
    Effect.gen(function* () {
      yield* Parity.use.assert({ local })
      expect(distTagCalls).toContain("https://registry.npmjs.org/-/package/opencode-ai/dist-tags")
    }),
  )
})
