// AMICODE: Connections module tests (amicode#165 / parent #159, ADR 0002).
// Company Compute connect path: probe-first validation, redacting-whitelist
// status rendering, loopback-gated mutations. No live network — every probe
// runs through an injected FetchImpl. Credential + status-cache files ride the
// same env overrides production honors (AMICO_CLOUD_FILE /
// AMICODE_CONNECTIONS_FILE), so the test seam and the deploy seam are one
// mechanism (the #162 idiom).
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readCredential, writeCredential } from "@/server/amicode/credentials"
import {
  amicodeOpsDir,
  connectionsFile,
  entitlementsFile,
  inflightOverlay,
  probeCompanyCompute,
  solverModeFile,
  statusResponse,
  STALE_MS,
  statusBody,
  submitCredentialResponse,
  disconnectResponse,
  revalidateResponse,
  isLoopbackHostname,
  setBindHostname,
  type FetchImpl,
} from "@/server/amicode/connections"

const respond =
  (status: number): FetchImpl =>
  async () => ({ status })

// Same env-override discipline as the credentials suite: point every file the
// module touches into a per-test tmp dir, restore after.
const ENV_KEYS = ["AMICO_CLOUD_FILE", "AMICO_PASQAL_FILE", "AMICODE_CONNECTIONS_FILE", "AMICODE_OPS_DIR"] as const
let savedEnv: Record<string, string | undefined>
let dir: string

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  dir = mkdtempSync(path.join(tmpdir(), "amicode-conn-"))
  process.env.AMICO_CLOUD_FILE = path.join(dir, "cloud.json")
  process.env.AMICO_PASQAL_FILE = path.join(dir, "pasqal.json")
  process.env.AMICODE_CONNECTIONS_FILE = path.join(dir, "connections.json")
  process.env.AMICODE_OPS_DIR = path.join(dir, "amicode-ops") // flip artifacts (#167) stay hermetic
  inflightOverlay.clear()
  setBindHostname(undefined) // isolation from any listener another test file bound
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  inflightOverlay.clear()
  setBindHostname(undefined)
})

const cloudCredential = { base_url: "https://solves.example.co", token: "tok-stored-secret" }

describe("probe classification (AC2)", () => {
  test("authorizer-rejection class: 401 → invalid", async () => {
    expect(await probeCompanyCompute("https://solves.example.co", "tok-1", respond(401))).toBe("invalid")
  })

  test("auth-passed classes → valid: 403, 404, and 2xx all mean the key got past the authorizer", async () => {
    // Parent contract: the authorizer rejects bad keys BEFORE the handler; a
    // good key reaches the handler's not-found/forbidden for the fake task.
    for (const status of [200, 204, 403, 404]) {
      expect(await probeCompanyCompute("https://solves.example.co", "tok-1", respond(status))).toBe("valid")
    }
  })

  test("server-error / network classes → unreachable: 5xx, odd 4xx, thrown fetch", async () => {
    for (const status of [400, 429, 500, 502, 503]) {
      expect(await probeCompanyCompute("https://solves.example.co", "tok-1", respond(status))).toBe("unreachable")
    }
    const network: FetchImpl = async () => {
      throw new Error("ECONNREFUSED")
    }
    expect(await probeCompanyCompute("https://solves.example.co", "tok-1", network)).toBe("unreachable")
  })

  test("probe hits the fake-task status route; the token rides ONLY the Authorization header, never the URL", async () => {
    let seenUrl = ""
    let seenAuth = ""
    const capture: FetchImpl = async (url, init) => {
      seenUrl = url
      seenAuth = init.headers.authorization ?? ""
      return { status: 404 }
    }
    await probeCompanyCompute("https://solves.example.co///", "tok-secret-xyz", capture)
    expect(seenUrl).toBe("https://solves.example.co/solves/__validate__/status")
    expect(seenUrl).not.toContain("tok-secret-xyz")
    expect(seenAuth).toBe("Bearer tok-secret-xyz")
  })
})

describe("status list rendering (redacting whitelist, AC3)", () => {
  test("connections file honors the env override; default lives beside cloud.json", () => {
    expect(connectionsFile()).toBe(path.join(dir, "connections.json"))
    delete process.env.AMICODE_CONNECTIONS_FILE
    expect(connectionsFile()).toContain(path.join(".amico", "connections.json"))
  })

  test("no credential, no cache → needs-key", () => {
    const parsed = JSON.parse(statusResponse())
    expect(parsed.ok).toBe(true)
    expect(parsed.error).toBeNull()
    expect(parsed.connections).toEqual([
      { id: "company-compute", state: "needs-key", validated_at: null, stale: false },
    ])
  })

  test("credential + fresh connected cache → connected, not stale", () => {
    writeCredential("company-compute", cloudCredential)
    const at = new Date().toISOString()
    writeFileSync(connectionsFile(), JSON.stringify({ "company-compute": { state: "connected", validated_at: at } }))
    const parsed = JSON.parse(statusResponse())
    expect(parsed.connections[0].state).toBe("connected")
    expect(parsed.connections[0].validated_at).toBe(at)
    expect(parsed.connections[0].stale).toBe(false)
  })

  test("connected cache older than STALE_MS → stale:true; unvalidated credential → connected + stale", () => {
    writeCredential("company-compute", cloudCredential)
    const old = new Date(Date.now() - STALE_MS - 60_000).toISOString()
    writeFileSync(connectionsFile(), JSON.stringify({ "company-compute": { state: "connected", validated_at: old } }))
    expect(JSON.parse(statusResponse()).connections[0].stale).toBe(true)
    // a credential that exists but was never validated (e.g. CLI-written
    // cloud.json) renders connected-but-stale, prompting a revalidate
    writeFileSync(connectionsFile(), "{}")
    const unvalidated = JSON.parse(statusResponse()).connections[0]
    expect(unvalidated.state).toBe("connected")
    expect(unvalidated.validated_at).toBeNull()
    expect(unvalidated.stale).toBe(true)
  })

  test("connected cache but the credential file is gone → needs-key (credential file is the truth)", () => {
    writeFileSync(
      connectionsFile(),
      JSON.stringify({ "company-compute": { state: "connected", validated_at: new Date().toISOString() } }),
    )
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("needs-key")
  })

  test("in-flight overlay wins: entry present → validating", () => {
    writeCredential("company-compute", cloudCredential)
    inflightOverlay.set("company-compute", { state: "validating" })
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("validating")
  })

  test("unreadable/garbage cache file degrades to needs-key, never a throw", () => {
    writeFileSync(connectionsFile(), "not json {{{")
    const parsed = JSON.parse(statusResponse())
    expect(parsed.ok).toBe(true)
    expect(parsed.connections[0].state).toBe("needs-key")
  })

  test("POISON: token/password keys seeded into EVERY input never reach the response", () => {
    writeCredential("company-compute", cloudCredential)
    // input 1: the cache file, poisoned at every level
    writeFileSync(
      connectionsFile(),
      JSON.stringify({
        token: "POISON-top",
        "company-compute": {
          state: "connected",
          validated_at: new Date().toISOString(),
          identity: "kate",
          token: "POISON-entry",
          password: "POISON-password",
          authorization: "Bearer POISON-header",
          nested: { secret: "POISON-nested" },
          devices: [{ name: "qpu-1", state: "online", token: "POISON-device" }],
          entitlements: ["solve", { token: "POISON-entitlement" }],
        },
      }),
    )
    // input 2: the in-memory overlay state
    inflightOverlay.set("company-compute", { state: "validating", token: "POISON-overlay", secret: "POISON-mem" })
    const body = statusResponse()
    expect(body).not.toContain("POISON")
    expect(body).not.toContain("tok-stored-secret") // the stored credential itself must never surface
    const entry = JSON.parse(body).connections[0]
    const allowed = ["id", "state", "identity", "entitlements", "expires_at", "devices", "validated_at", "stale"]
    for (const key of Object.keys(entry)) expect(allowed).toContain(key)
    for (const device of entry.devices ?? []) {
      for (const key of Object.keys(device)) expect(["id", "name", "state"]).toContain(key)
    }
  })

  test("statusBody is a pure builder over injectable inputs (profile.ts idiom)", () => {
    const file = path.join(dir, "alt-connections.json")
    writeFileSync(
      file,
      JSON.stringify({ "company-compute": { state: "invalid", validated_at: "2026-07-19T00:00:00Z" } }),
    )
    const parsed = JSON.parse(
      statusBody({ file, overlay: new Map(), hasCredential: () => true, now: Date.parse("2026-07-19T01:00:00Z") }),
    )
    expect(parsed.connections[0].state).toBe("invalid")
    expect(parsed.connections[0].stale).toBe(false)
  })
})

describe("submit credential — probe → save → terminal status, one round trip (AC1, AC2)", () => {
  test("submit: valid key → credential written through the #162 seam + connected in the SAME response (AC1)", async () => {
    const body = JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co/", token: "tok-good" })
    const parsed = JSON.parse(await submitCredentialResponse(body, { fetchImpl: respond(404) }))
    expect(parsed.ok).toBe(true)
    expect(parsed.error).toBeNull()
    expect(parsed.connection.id).toBe("company-compute")
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.connection.stale).toBe(false)
    expect(Date.now() - Date.parse(parsed.connection.validated_at)).toBeLessThan(10_000)
    // written via the seam: the frozen byte shape, trailing slash trimmed
    expect(readCredential("company-compute")).toEqual({ base_url: "https://solves.example.co", token: "tok-good" })
    // a follow-up GET agrees without another probe
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("connected")
  })

  test("submit: 401 → invalid, NOTHING written; a pre-existing credential survives untouched (AC2)", async () => {
    const body = JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-bad" })
    const rejected = JSON.parse(await submitCredentialResponse(body, { fetchImpl: respond(401) }))
    expect(rejected.ok).toBe(true)
    expect(rejected.connection.state).toBe("invalid")
    expect(readCredential("company-compute")).toBeUndefined()
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("invalid")
    // now with an older good credential on disk: the failed attempt must not clobber it
    writeCredential("company-compute", cloudCredential)
    await submitCredentialResponse(body, { fetchImpl: respond(401) })
    expect(readCredential("company-compute")).toEqual(cloudCredential)
  })

  test("submit: network/server trouble → unreachable, nothing written, token-free fixed message (AC2)", async () => {
    const boom: FetchImpl = async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:443")
    }
    for (const fetchImpl of [boom, respond(500)]) {
      const raw = await submitCredentialResponse(
        JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-hidden" }),
        { fetchImpl },
      )
      const parsed = JSON.parse(raw)
      expect(parsed.connection.state).toBe("unreachable")
      expect(raw).not.toContain("tok-hidden")
      expect(readCredential("company-compute")).toBeUndefined()
    }
  })

  test("submit: while the probe is in flight, concurrent GETs render 'validating'; terminal state clears it", async () => {
    let release!: (v: { status: number }) => void
    const gate = new Promise<{ status: number }>((resolve) => (release = resolve))
    const blocking: FetchImpl = () => gate
    const pending = submitCredentialResponse(
      JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-slow" }),
      { fetchImpl: blocking },
    )
    await Bun.sleep(0) // let the submit reach the probe await
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("validating")
    release({ status: 200 })
    expect(JSON.parse(await pending).connection.state).toBe("connected")
    expect(inflightOverlay.size).toBe(0)
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("connected")
  })

  test("submit: malformed bodies → ok:false with VALUE-FREE errors; nothing written, no probe fired", async () => {
    let probes = 0
    const counting: FetchImpl = async () => {
      probes++
      return { status: 200 }
    }
    const cases = [
      "not json {{{",
      JSON.stringify({ id: "company-compute", token: "tok-orphan-xyz" }), // base_url required in body
      JSON.stringify({ id: "company-compute", base_url: "https://x.co", token: "" }),
      JSON.stringify({ id: "company-compute", base_url: "ftp://x.co", token: "tok-orphan-xyz" }),
      JSON.stringify({ id: "pasqal-cloud", base_url: "https://x.co", token: "tok-orphan-xyz" }), // later slice
      JSON.stringify({ id: "who-knows", base_url: "https://x.co", token: "tok-orphan-xyz" }),
    ]
    for (const body of cases) {
      const raw = await submitCredentialResponse(body, { fetchImpl: counting })
      const parsed = JSON.parse(raw)
      expect(parsed.ok).toBe(false)
      expect(parsed.connection).toBeNull()
      expect(raw).not.toContain("tok-orphan-xyz") // error text never echoes what was rejected
    }
    expect(probes).toBe(0)
    expect(readCredential("company-compute")).toBeUndefined()
  })
})

// --- HP flip on Company Compute connect (amicode#167 / parent #159): a VALID
// save grants `issimo` and writes the durable {mode:"hp",status:"switching"}
// request; the amicode extension's EXISTING watcher (solver_mode.ts) does the
// actual re-prep. These tests assert the fork-side artifacts on file bytes —
// the shared ops-dir contract, hermetic via $AMICODE_OPS_DIR.

const validSubmit = JSON.stringify({
  id: "company-compute",
  base_url: "https://solves.example.co",
  token: "tok-good",
})

describe("HP flip on connect — artifacts in the ops dir (167 AC1, AC3)", () => {
  test("flip artifacts resolve through $AMICODE_OPS_DIR, defaulting to ~/.amico/amicode (the extension's amicodeOpsDir)", () => {
    expect(amicodeOpsDir()).toBe(path.join(dir, "amicode-ops"))
    expect(entitlementsFile()).toBe(path.join(dir, "amicode-ops", "entitlements.toml"))
    expect(solverModeFile()).toBe(path.join(dir, "amicode-ops", "solver-mode.json"))
    delete process.env.AMICODE_OPS_DIR
    expect(entitlementsFile()).toContain(path.join(".amico", "amicode", "entitlements.toml"))
    expect(solverModeFile()).toContain(path.join(".amico", "amicode", "solver-mode.json"))
  })

  test("valid save → BOTH artifacts: issimo granted in entitlements.toml AND the hp switching request (AC1)", async () => {
    const parsed = JSON.parse(await submitCredentialResponse(validSubmit, { fetchImpl: respond(404) }))
    expect(parsed.ok).toBe(true)
    expect(parsed.error).toBeNull()
    expect(parsed.connection.state).toBe("connected")
    // artifact 1: the exact byte shape the extension's applyEntitlementForMode writes/reads
    expect(readFileSync(entitlementsFile(), "utf8")).toBe('codes = ["issimo"]\n')
    // artifact 2: the exact request shape the extension's watchSolverMode consumes
    expect(JSON.parse(readFileSync(solverModeFile(), "utf8"))).toEqual({ mode: "hp", status: "switching" })
  })

  test("grant PRESERVES existing codes (and the expired list) — read-modify-write, byte-compatible", async () => {
    mkdirSync(amicodeOpsDir(), { recursive: true })
    writeFileSync(entitlementsFile(), 'codes = ["pasqal-hackathon-2026"]\nexpired = ["old-2025"]\n')
    await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) })
    expect(readFileSync(entitlementsFile(), "utf8")).toBe(
      'codes = ["pasqal-hackathon-2026", "issimo"]\nexpired = ["old-2025"]\n',
    )
  })

  test("headless: no extension host consumes anything — both artifacts persist durably, response path clean (AC3)", async () => {
    // this suite runs with NO extension host: headless is the ambient truth here
    const raw = await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) })
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.error).toBeNull()
    const entitlementBytes = readFileSync(entitlementsFile(), "utf8")
    const modeBytes = readFileSync(solverModeFile(), "utf8")
    // a later GET disturbs nothing; re-reads see the same bytes — the request
    // is still pending for the next extension attach
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("connected")
    expect(readFileSync(entitlementsFile(), "utf8")).toBe(entitlementBytes)
    expect(readFileSync(solverModeFile(), "utf8")).toBe(modeBytes)
    expect(JSON.parse(modeBytes)).toEqual({ mode: "hp", status: "switching" })
  })
})

describe("HP flip on connect — only the valid outcome flips; repeats stay idempotent (167 AC4)", () => {
  test("invalid / unreachable / malformed / non-loopback → NO flip artifacts of any kind", async () => {
    const boom: FetchImpl = async () => {
      throw new Error("ECONNREFUSED")
    }
    const attempts: [string, FetchImpl][] = [
      [validSubmit, respond(401)], // invalid
      [validSubmit, respond(500)], // unreachable (server trouble)
      [validSubmit, boom], // unreachable (network)
      ["not json {{{", respond(200)], // malformed body — no probe, no save
    ]
    for (const [body, fetchImpl] of attempts) await submitCredentialResponse(body, { fetchImpl })
    setBindHostname("0.0.0.0") // refused mutations must not flip either
    await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) })
    setBindHostname(undefined)
    expect(existsSync(entitlementsFile())).toBe(false)
    expect(existsSync(solverModeFile())).toBe(false)
  })

  test("a failed revalidation never revokes: pre-granted entitlements survive an invalid outcome untouched", async () => {
    await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) }) // granted + switching
    const entitlementBytes = readFileSync(entitlementsFile(), "utf8")
    const modeBytes = readFileSync(solverModeFile(), "utf8")
    await submitCredentialResponse(validSubmit, { fetchImpl: respond(401) }) // key went bad
    await revalidateResponse(JSON.stringify({ id: "company-compute" }), { fetchImpl: respond(401) })
    expect(readFileSync(entitlementsFile(), "utf8")).toBe(entitlementBytes)
    expect(readFileSync(solverModeFile(), "utf8")).toBe(modeBytes)
  })

  test("disconnect leaves both artifacts alone — the flip is one-way; the user's toggle owns reverting", async () => {
    await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) })
    const entitlementBytes = readFileSync(entitlementsFile(), "utf8")
    disconnectResponse(JSON.stringify({ id: "company-compute" }))
    expect(readFileSync(entitlementsFile(), "utf8")).toBe(entitlementBytes)
    expect(JSON.parse(readFileSync(solverModeFile(), "utf8"))).toEqual({ mode: "hp", status: "switching" })
  })

  test("repeat valid save while already hp+granted: no duplicate codes, no fresh switching write", async () => {
    await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) })
    expect(JSON.parse(readFileSync(solverModeFile(), "utf8")).status).toBe("switching")
    // the extension watcher settles the request: ready at hp (writeSolverModeReady shape)
    writeFileSync(
      solverModeFile(),
      JSON.stringify({ mode: "hp", status: "ready", switched_at: new Date().toISOString() }),
    )
    const entitlementBytes = readFileSync(entitlementsFile(), "utf8")
    const again = JSON.parse(await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) }))
    expect(again.ok).toBe(true)
    expect(again.connection.state).toBe("connected")
    expect(readFileSync(entitlementsFile(), "utf8")).toBe(entitlementBytes) // ONE issimo, byte-identical
    expect(JSON.parse(readFileSync(solverModeFile(), "utf8")).status).toBe("ready") // watcher NOT poked again
  })

  test("hp already active but the grant is missing → the switch IS re-requested (re-prep must apply the entitlement)", async () => {
    mkdirSync(amicodeOpsDir(), { recursive: true })
    writeFileSync(solverModeFile(), JSON.stringify({ mode: "hp", status: "ready" }))
    writeFileSync(entitlementsFile(), 'codes = ["pasqal-hackathon-2026"]\n') // issimo absent
    await submitCredentialResponse(validSubmit, { fetchImpl: respond(200) })
    expect(readFileSync(entitlementsFile(), "utf8")).toBe('codes = ["pasqal-hackathon-2026", "issimo"]\n')
    expect(JSON.parse(readFileSync(solverModeFile(), "utf8"))).toEqual({ mode: "hp", status: "switching" })
  })
})

describe("HP flip on connect — flip trouble never corrupts the save (167 partial failure)", () => {
  test("flip write failure → credential SAVED, connected status, fixed value-free warning in the error field", async () => {
    // an ops dir that cannot exist: a regular file occupies the parent path
    writeFileSync(path.join(dir, "blocker"), "")
    process.env.AMICODE_OPS_DIR = path.join(dir, "blocker", "ops")
    const raw = await submitCredentialResponse(
      JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-flip-fail" }),
      { fetchImpl: respond(200) },
    )
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true) // the save SUCCEEDED — partial failure is a warning, not a failure
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.error).toStartWith("hp_flip_failed:") // sibling "code: detail" shape, fixed string
    expect(raw).not.toContain("tok-flip-fail") // value-free: no token…
    expect(raw).not.toContain(dir) // …and no filesystem path/errno detail either
    expect(readCredential("company-compute")).toEqual({ base_url: "https://solves.example.co", token: "tok-flip-fail" })
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("connected") // the cache write preceded the flip
  })
})

describe("disconnect + revalidate (AC4)", () => {
  test("disconnect clears the credential; status becomes needs-key; idempotent", async () => {
    await submitCredentialResponse(
      JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-good" }),
      { fetchImpl: respond(200) },
    )
    const parsed = JSON.parse(disconnectResponse(JSON.stringify({ id: "company-compute" })))
    expect(parsed.ok).toBe(true)
    expect(parsed.connection).toEqual({ id: "company-compute", state: "needs-key", validated_at: null, stale: false })
    expect(readCredential("company-compute")).toBeUndefined()
    expect(JSON.parse(statusResponse()).connections[0].state).toBe("needs-key")
    // disconnecting an already-absent credential is a no-op, not an error
    expect(JSON.parse(disconnectResponse(JSON.stringify({ id: "company-compute" }))).ok).toBe(true)
  })

  test("disconnect: malformed body / unknown id → ok:false", () => {
    expect(JSON.parse(disconnectResponse("nope")).ok).toBe(false)
    expect(JSON.parse(disconnectResponse(JSON.stringify({ id: "who-knows" }))).ok).toBe(false)
  })

  test("revalidate runs from the STORED credential — no secret rides the request (AC4)", async () => {
    writeCredential("company-compute", cloudCredential)
    const stale = new Date(Date.now() - STALE_MS - 60_000).toISOString()
    writeFileSync(connectionsFile(), JSON.stringify({ "company-compute": { state: "connected", validated_at: stale } }))
    let seenUrl = ""
    let seenAuth = ""
    const capture: FetchImpl = async (url, init) => {
      seenUrl = url
      seenAuth = init.headers.authorization ?? ""
      return { status: 404 }
    }
    const request = JSON.stringify({ id: "company-compute" }) // the whole body — token never leaves the server
    const parsed = JSON.parse(await revalidateResponse(request, { fetchImpl: capture }))
    expect(seenUrl).toBe("https://solves.example.co/solves/__validate__/status")
    expect(seenAuth).toBe(`Bearer ${cloudCredential.token}`)
    expect(parsed.ok).toBe(true)
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.connection.stale).toBe(false)
    expect(Date.parse(parsed.connection.validated_at)).toBeGreaterThan(Date.parse(stale)) // timestamp refreshed
  })

  test("revalidate: 401 → invalid but the stored credential is KEPT; unreachable refreshes the timestamp too", async () => {
    writeCredential("company-compute", cloudCredential)
    const invalid = JSON.parse(
      await revalidateResponse(JSON.stringify({ id: "company-compute" }), { fetchImpl: respond(401) }),
    )
    expect(invalid.connection.state).toBe("invalid")
    expect(readCredential("company-compute")).toEqual(cloudCredential) // user data survives; re-entry is their call
    const unreachable = JSON.parse(
      await revalidateResponse(JSON.stringify({ id: "company-compute" }), { fetchImpl: respond(503) }),
    )
    expect(unreachable.connection.state).toBe("unreachable")
    expect(unreachable.connection.validated_at).not.toBeNull()
  })

  test("revalidate with no stored credential → needs-key, no probe fired", async () => {
    let probes = 0
    const counting: FetchImpl = async () => {
      probes++
      return { status: 200 }
    }
    const parsed = JSON.parse(
      await revalidateResponse(JSON.stringify({ id: "company-compute" }), { fetchImpl: counting }),
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.connection.state).toBe("needs-key")
    expect(probes).toBe(0)
  })
})

describe("loopback guard on mutations (AC5)", () => {
  test("loopback classification: 127/8, localhost, ::1 (and v4-mapped) are loopback; wildcard/LAN binds are not", () => {
    for (const host of [undefined, "127.0.0.1", "127.1.2.3", "localhost", "LOCALHOST", "::1", "::ffff:127.0.0.1"]) {
      expect(isLoopbackHostname(host)).toBe(true)
    }
    for (const host of ["0.0.0.0", "::", "192.168.1.5", "10.0.0.2", "example.co", ""]) {
      expect(isLoopbackHostname(host)).toBe(false)
    }
  })

  test("bound beyond loopback → every mutation refuses with the DISTINCT error; nothing happens", async () => {
    setBindHostname("0.0.0.0")
    let probes = 0
    const counting: FetchImpl = async () => {
      probes++
      return { status: 200 }
    }
    const submit = JSON.parse(
      await submitCredentialResponse(
        JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-lan" }),
        { fetchImpl: counting },
      ),
    )
    const disconnect = JSON.parse(disconnectResponse(JSON.stringify({ id: "company-compute" })))
    const revalidate = JSON.parse(
      await revalidateResponse(JSON.stringify({ id: "company-compute" }), { fetchImpl: counting }),
    )
    for (const parsed of [submit, disconnect, revalidate]) {
      expect(parsed.ok).toBe(false)
      expect(parsed.error).toStartWith("non_loopback:")
    }
    expect(probes).toBe(0)
    expect(readCredential("company-compute")).toBeUndefined()
    // the read-only status route still serves
    expect(JSON.parse(statusResponse()).ok).toBe(true)
  })

  test("back on a loopback bind, mutations serve again", async () => {
    setBindHostname("127.0.0.1")
    const parsed = JSON.parse(
      await submitCredentialResponse(
        JSON.stringify({ id: "company-compute", base_url: "https://solves.example.co", token: "tok-good" }),
        { fetchImpl: respond(200) },
      ),
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.connection.state).toBe("connected")
  })
})
