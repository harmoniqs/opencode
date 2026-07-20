// AMICODE: Connections ROUTE tests (amicode#165 AC6, plus AC2/AC3/AC5 at the
// route level) — the full Company Compute lifecycle against the same route
// tree standalone serve binds, with NO VSCode/extension host involved. A local
// node:http stub stands in for the solve service; the only network is
// loopback. Auth rides the same registration wrapper as every amicode route
// (per #163), asserted here with a configured password.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ConfigProvider, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiApp } from "@/server/routes/instance/httpapi/server"
import { ServerAuth } from "@/server/auth"
import { readCredential } from "@/server/amicode/credentials"
import {
  connectionsFile,
  entitlementsFile,
  inflightOverlay,
  sessionOnlyOverlay,
  setBindHostname,
  solverModeFile,
  PASQAL_CONFIG_WARNING,
} from "@/server/amicode/connections"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances } from "../fixture/fixture"

// --- the in-process app over the SAME routes standalone serve binds
// (httpapi-instance-route-auth.test.ts idiom) ---
function app(input: { password?: string; username?: string } = {}) {
  const handler = HttpRouter.toWebHandler(
    HttpApiApp.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            OPENCODE_SERVER_PASSWORD: input.password,
            OPENCODE_SERVER_USERNAME: input.username,
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler

  return {
    fetch: (request: Request) => handler(request, HttpApiApp.context),
    request(input: string | URL | Request, init?: RequestInit) {
      return this.fetch(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init))
    },
  }
}

function basic(username: string, password: string) {
  return ServerAuth.header({ username, password }) ?? ""
}

// --- local stub solve service: answers the probe with a scripted status and
// records what it saw, so tests can assert the token rode the header only ---
type StubSeen = { method: string; url: string; authorization: string | undefined }
async function stubSolveService(status: () => number) {
  const seen: StubSeen[] = []
  const server = createServer((req, res) => {
    seen.push({ method: req.method ?? "", url: req.url ?? "", authorization: req.headers.authorization })
    res.statusCode = status()
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) })

const ENV_KEYS = [
  "AMICO_CLOUD_FILE",
  "AMICO_PASQAL_FILE",
  "AMICODE_CONNECTIONS_FILE",
  "AMICODE_OPS_DIR",
  "AMICO_PYTHON",
  "AMICO_PASQAL_VALIDATOR",
] as const
let savedEnv: Record<string, string | undefined>
let dir: string

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  dir = mkdtempSync(path.join(tmpdir(), "amicode-conn-routes-"))
  process.env.AMICO_CLOUD_FILE = path.join(dir, "cloud.json")
  process.env.AMICO_PASQAL_FILE = path.join(dir, "pasqal.json")
  process.env.AMICODE_CONNECTIONS_FILE = path.join(dir, "connections.json")
  process.env.AMICODE_OPS_DIR = path.join(dir, "amicode-ops") // flip artifacts (#167) stay hermetic
  inflightOverlay.clear()
  sessionOnlyOverlay.clear()
  setBindHostname(undefined) // isolation from any listener another test file bound
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  inflightOverlay.clear()
  sessionOnlyOverlay.clear()
  setBindHostname(undefined)
})

describe("connections routes — full lifecycle, no extension host (AC6)", () => {
  test("needs-key → submit → connected → revalidate → disconnect → needs-key, one round trip each", async () => {
    const server = app()
    let probeStatus = 404 // authorizer passed; fake task not found → valid
    const stub = await stubSolveService(() => probeStatus)
    try {
      const initial = await (await server.request("/amicode/connections")).json()
      expect(initial.ok).toBe(true)
      expect(initial.connections).toEqual([
        { id: "company-compute", state: "needs-key", validated_at: null, stale: false },
        { id: "pasqal-cloud", state: "needs-key", validated_at: null, stale: false },
      ])

      // submit: secret rides the POST body (library idiom), never a query param
      const submitted = await (
        await server.request(
          "/amicode/connections/credential",
          post({ id: "company-compute", base_url: stub.url, token: "tok-lifecycle" }),
        )
      ).json()
      expect(submitted.ok).toBe(true)
      expect(submitted.connection.state).toBe("connected") // terminal status in the SAME response (AC1)
      expect(readCredential("company-compute")).toEqual({ base_url: stub.url, token: "tok-lifecycle" })
      expect(stub.seen).toHaveLength(1)
      expect(stub.seen[0].url).toBe("/solves/__validate__/status")
      expect(stub.seen[0].url).not.toContain("tok-lifecycle")
      expect(stub.seen[0].authorization).toBe("Bearer tok-lifecycle")

      const connected = await (await server.request("/amicode/connections")).json()
      expect(connected.connections[0].state).toBe("connected")
      expect(connected.connections[0].stale).toBe(false)

      // revalidate: id-only body — the stored secret never rides the request (AC4)
      probeStatus = 200
      const revalidated = await (
        await server.request("/amicode/connections/revalidate", post({ id: "company-compute" }))
      ).json()
      expect(revalidated.connection.state).toBe("connected")
      expect(stub.seen).toHaveLength(2)
      expect(stub.seen[1].authorization).toBe("Bearer tok-lifecycle")

      const disconnected = await (
        await server.request("/amicode/connections/disconnect", post({ id: "company-compute" }))
      ).json()
      expect(disconnected.connection.state).toBe("needs-key")
      expect(readCredential("company-compute")).toBeUndefined()

      const final = await (await server.request("/amicode/connections")).json()
      expect(final.connections[0].state).toBe("needs-key")
    } finally {
      await stub.close()
    }
  })

  test("authorizer-rejecting service → invalid over the route; nothing written (AC2)", async () => {
    const server = app()
    const stub = await stubSolveService(() => 401)
    try {
      const rejected = await (
        await server.request(
          "/amicode/connections/credential",
          post({ id: "company-compute", base_url: stub.url, token: "tok-rejected" }),
        )
      ).json()
      expect(rejected.ok).toBe(true)
      expect(rejected.connection.state).toBe("invalid")
      expect(readCredential("company-compute")).toBeUndefined()
    } finally {
      await stub.close()
    }
  })

  test("a poisoned status-cache file never leaks through the GET route (AC3)", async () => {
    writeFileSync(
      connectionsFile(),
      JSON.stringify({
        "company-compute": {
          state: "connected",
          validated_at: new Date().toISOString(),
          token: "POISON-file",
          password: "POISON-password",
        },
      }),
    )
    const response = await app().request("/amicode/connections")
    expect(await response.text()).not.toContain("POISON")
  })
})

describe("connections routes — HP flip artifacts over the route tree (167 AC1, AC3, AC4)", () => {
  test("valid submit over the route → both flip artifacts; disconnect leaves them (one-way); 401 never flips", async () => {
    const server = app()
    let probeStatus = 404
    const stub = await stubSolveService(() => probeStatus)
    try {
      // valid save over the REAL route tree → both ops-dir artifacts (AC1),
      // durable with no extension host anywhere in this process (AC3)
      const submitted = await (
        await server.request(
          "/amicode/connections/credential",
          post({ id: "company-compute", base_url: stub.url, token: "tok-flip" }),
        )
      ).json()
      expect(submitted.ok).toBe(true)
      expect(submitted.connection.state).toBe("connected")
      expect(submitted.error).toBeNull() // flip succeeded — no partial-failure warning
      expect(readFileSync(entitlementsFile(), "utf8")).toBe('codes = ["issimo"]\n')
      expect(JSON.parse(readFileSync(solverModeFile(), "utf8"))).toEqual({ mode: "hp", status: "switching" })

      // disconnect reverts NOTHING solver-side — the flip is one-way on connect
      await server.request("/amicode/connections/disconnect", post({ id: "company-compute" }))
      expect(readFileSync(entitlementsFile(), "utf8")).toBe('codes = ["issimo"]\n')
      expect(JSON.parse(readFileSync(solverModeFile(), "utf8"))).toEqual({ mode: "hp", status: "switching" })
    } finally {
      await stub.close()
    }

    // a rejected key over the route produces no flip artifacts at all (AC4)
    process.env.AMICODE_OPS_DIR = path.join(dir, "amicode-ops-rejected")
    const rejecting = await stubSolveService(() => 401)
    try {
      const rejected = await (
        await server.request(
          "/amicode/connections/credential",
          post({ id: "company-compute", base_url: rejecting.url, token: "tok-bad" }),
        )
      ).json()
      expect(rejected.connection.state).toBe("invalid")
      expect(existsSync(entitlementsFile())).toBe(false)
      expect(existsSync(solverModeFile())).toBe(false)
    } finally {
      await rejecting.close()
    }
  })
})

// --- Pasqal over the route tree (amicode#169): the REAL spawn path — the
// default (non-injected) spawner launches an actual child against a stub
// validator honoring the #164 contract, staged where $AMICO_PASQAL_VALIDATOR
// points and interpreted by $AMICO_PYTHON (the test binds it to the bun
// executable, proving the interpreter is a plain argv[0]).

const PASQAL = {
  username: "kate@example.com",
  password: "hunter2-P0ison-pa55word",
  project_id: "proj-0000-aaaa-bbbb",
}
const validatorLine = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    ok: true,
    project_id: PASQAL.project_id,
    devices: ["EMU_FREE", "FRESNEL"],
    token: "tok-pasqal-minted",
    expires_at: "2026-08-01T00:00:00+00:00",
    ...over,
  })

/** Stage a stub validator OUTSIDE the scanned credential tree: it records the
 *  child's env view (keys + the PASQAL_* values) into the harness dir and
 *  answers the scenario file — exit code + optional stdout line. */
function stageStubValidator() {
  const harness = mkdtempSync(path.join(tmpdir(), "amicode-pasqal-stub-"))
  const scenarioFile = path.join(harness, "scenario.json")
  const recordFile = path.join(harness, "record.json")
  const script = path.join(harness, "pasqal_validate_stub.mjs")
  writeFileSync(
    script,
    [
      `import { readFileSync, writeFileSync } from "node:fs"`,
      `writeFileSync(${JSON.stringify(recordFile)}, JSON.stringify({`,
      `  keys: Object.keys(process.env).sort(),`,
      `  username: process.env.PASQAL_USERNAME ?? null,`,
      `  password: process.env.PASQAL_PASSWORD ?? null,`,
      `  project_id: process.env.PASQAL_PROJECT_ID ?? null,`,
      `  argv: process.argv.slice(2),`,
      `}))`,
      `const scenario = JSON.parse(readFileSync(${JSON.stringify(scenarioFile)}, "utf8"))`,
      `if (scenario.stdout) console.log(scenario.stdout)`,
      `process.exit(scenario.exitCode)`,
    ].join("\n"),
  )
  process.env.AMICO_PYTHON = process.execPath // "interpreter" = the bun binary
  process.env.AMICO_PASQAL_VALIDATOR = script
  return {
    scenario(exitCode: number, stdout = "") {
      writeFileSync(scenarioFile, JSON.stringify({ exitCode, stdout }))
    },
    record(): { keys: string[]; username: string | null; password: string | null; project_id: string | null } {
      return JSON.parse(readFileSync(recordFile, "utf8"))
    },
    recordExists: () => existsSync(recordFile),
    clearRecord: () => rmSync(recordFile, { force: true }),
    cleanup: () => rmSync(harness, { recursive: true, force: true }),
  }
}

/** every byte of every file under the credential/ops tree (raw) */
const scanTree = (root: string): string => {
  if (!existsSync(root)) return ""
  const chunks: string[] = []
  for (const entry of readdirSync(root, { recursive: true }) as string[]) {
    const full = path.join(root, String(entry))
    if (statSync(full).isFile()) chunks.push(readFileSync(full, "latin1"))
  }
  return chunks.join("\n")
}

describe("pasqal over the route tree — REAL spawn against a staged stub validator (169 AC1/AC2/AC3/AC4)", () => {
  test("full lifecycle: submit(valid) → connected + devices; revalidate never respawns; disconnect scrubs", async () => {
    const server = app()
    const stub = stageStubValidator()
    process.env.AMICODE_ROUTE_CANARY = "canary-route-full-spread" // a process.env spread would leak this
    try {
      stub.scenario(0, validatorLine())
      const submitted = await (
        await server.request("/amicode/connections/credential", post({ id: "pasqal-cloud", ...PASQAL }))
      ).json()
      expect(submitted.ok).toBe(true)
      expect(submitted.error).toBeNull()
      expect(submitted.connection.state).toBe("connected")
      expect(submitted.connection.identity).toBe(PASQAL.project_id)
      expect(submitted.connection.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }])

      // the child saw EXACTLY the minimal declared env — the real spawn spreads nothing
      const record = stub.record()
      expect(record.keys).toEqual(["PASQAL_PASSWORD", "PASQAL_PROJECT_ID", "PASQAL_USERNAME", "PATH"])
      expect(record.username).toBe(PASQAL.username)
      expect(record.password).toBe(PASQAL.password)
      expect(record.project_id).toBe(PASQAL.project_id)
      expect(record.argv).toEqual([]) // nothing beyond <interpreter> <script> — no secret rides argv

      // token-only at rest; the password exists NOWHERE under the credential/ops tree
      expect(readCredential("pasqal-cloud")).toEqual({
        project_id: PASQAL.project_id,
        token: "tok-pasqal-minted",
        expires_at: "2026-08-01T00:00:00+00:00",
      })
      const bytes = scanTree(dir)
      expect(bytes).toContain("tok-pasqal-minted")
      expect(bytes).not.toContain(PASQAL.password)
      expect(bytes).not.toContain(PASQAL.username)

      // revalidate is a token-mode freshness check — the validator must NOT run again
      stub.clearRecord()
      const revalidated = await (
        await server.request("/amicode/connections/revalidate", post({ id: "pasqal-cloud" }))
      ).json()
      expect(revalidated.connection.state).toBe("connected")
      expect(stub.recordExists()).toBe(false)

      const disconnected = await (
        await server.request("/amicode/connections/disconnect", post({ id: "pasqal-cloud" }))
      ).json()
      expect(disconnected.connection.state).toBe("needs-key")
      expect(readCredential("pasqal-cloud")).toBeUndefined()
      expect(scanTree(dir)).not.toContain("tok-pasqal-minted")
    } finally {
      delete process.env.AMICODE_ROUTE_CANARY
      stub.cleanup()
    }
  })

  test("failure classes over the route: exit 2/4 → invalid/unentitled; exit 1 → config warning; nothing at rest", async () => {
    const server = app()
    const stub = stageStubValidator()
    try {
      const cases: [number, string, string | null][] = [
        [2, "invalid", null],
        [4, "unentitled", null],
        [1, "unreachable", PASQAL_CONFIG_WARNING],
      ]
      for (const [exitCode, state, error] of cases) {
        stub.scenario(exitCode)
        const parsed = await (
          await server.request("/amicode/connections/credential", post({ id: "pasqal-cloud", ...PASQAL }))
        ).json()
        expect(parsed.ok).toBe(true)
        expect(parsed.connection.state).toBe(state)
        expect(parsed.error).toBe(error)
      }
      expect(readCredential("pasqal-cloud")).toBeUndefined()
      const bytes = scanTree(dir)
      expect(bytes).not.toContain(PASQAL.password)
      expect(bytes).not.toContain(PASQAL.username)
    } finally {
      stub.cleanup()
    }
  })

  test("null token over the route → session-only connected; nothing at rest (AC4)", async () => {
    const server = app()
    const stub = stageStubValidator()
    try {
      stub.scenario(0, validatorLine({ token: null, expires_at: null }))
      const parsed = await (
        await server.request("/amicode/connections/credential", post({ id: "pasqal-cloud", ...PASQAL }))
      ).json()
      expect(parsed.ok).toBe(true)
      expect(parsed.connection.state).toBe("connected")
      expect(parsed.connection.session_only).toBe(true)
      expect(parsed.connection.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }])
      expect(readCredential("pasqal-cloud")).toBeUndefined()
      const status = await (await server.request("/amicode/connections")).json()
      const entry = status.connections.find((conn: { id: string }) => conn.id === "pasqal-cloud")
      expect(entry.state).toBe("connected")
      expect(entry.session_only).toBe(true)
      const bytes = scanTree(dir)
      expect(bytes).not.toContain(PASQAL.password)
      expect(bytes).not.toContain(PASQAL.username)
    } finally {
      stub.cleanup()
    }
  })
})

describe("connections routes — auth per #163", () => {
  test("with a password configured, unauthenticated requests are rejected; basic auth serves", async () => {
    const server = app({ password: "secret" })

    const missingGet = await server.request("/amicode/connections")
    expect(missingGet.status).toBe(401)

    const missingPost = await server.request(
      "/amicode/connections/credential",
      post({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-unauthed" }),
    )
    expect(missingPost.status).toBe(401)
    expect(readCredential("company-compute")).toBeUndefined() // rejected before any handler ran

    const authed = await server.request("/amicode/connections", {
      headers: { authorization: basic("opencode", "secret") },
    })
    expect(authed.status).toBe(200)
    expect((await authed.json()).ok).toBe(true)
  })
})

describe("connections routes — loopback guard (AC5)", () => {
  test("simulated non-loopback bind: mutations answer the distinct refusal; the read stays available", async () => {
    const server = app()
    setBindHostname("0.0.0.0")

    const refused = await (
      await server.request(
        "/amicode/connections/credential",
        post({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-lan" }),
      )
    ).json()
    expect(refused.ok).toBe(false)
    expect(refused.error).toStartWith("non_loopback:")
    expect(readCredential("company-compute")).toBeUndefined()

    const status = await server.request("/amicode/connections")
    expect(status.status).toBe(200)
    expect((await status.json()).ok).toBe(true)
  })
})

describe("connections routes — standalone serve records the bind", () => {
  afterEach(async () => {
    await disposeAllInstances()
    await resetDatabase()
  })

  test("a real 0.0.0.0 listener refuses mutations over live HTTP; a 127.0.0.1 listener serves them", async () => {
    const { Server } = await import("@/server/server")
    const stub = await stubSolveService(() => 404)
    const body = post({ id: "company-compute", base_url: stub.url, token: "tok-real-bind" })

    const wide = await Server.listen({ hostname: "0.0.0.0", port: 0 })
    try {
      const refused = await (await fetch(`http://127.0.0.1:${wide.port}/amicode/connections/credential`, body)).json()
      expect(refused.ok).toBe(false)
      expect(refused.error).toStartWith("non_loopback:")
    } finally {
      await wide.stop(true)
    }

    // the recorded bind dies WITH the listener: once the wide listener stops,
    // an in-process (loopback-default) handler serves mutations again
    const released = await (await app().request("/amicode/connections/credential", body)).json()
    expect(released.ok).toBe(true)
    expect(released.connection.state).toBe("connected")

    const local = await Server.listen({ hostname: "127.0.0.1", port: 0 })
    try {
      const accepted = await (await fetch(`http://127.0.0.1:${local.port}/amicode/connections/credential`, body)).json()
      expect(accepted.ok).toBe(true)
      expect(accepted.connection.state).toBe("connected")
      expect(readCredential("company-compute")).toEqual({ base_url: stub.url, token: "tok-real-bind" })
    } finally {
      await local.stop(true)
      await stub.close()
    }
  })
})
