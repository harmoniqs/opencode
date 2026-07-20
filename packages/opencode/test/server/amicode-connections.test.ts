// AMICODE: Connections module tests (amicode#165 / parent #159, ADR 0002).
// Company Compute connect path: probe-first validation, redacting-whitelist
// status rendering, loopback-gated mutations. No live network — every probe
// runs through an injected FetchImpl. Credential + status-cache files ride the
// same env overrides production honors (AMICO_CLOUD_FILE /
// AMICODE_CONNECTIONS_FILE), so the test seam and the deploy seam are one
// mechanism (the #162 idiom).
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readCredential, writeCredential } from "@/server/amicode/credentials"
import {
  amicodeOpsDir,
  backgroundRevalidationsSettled,
  connectionsFile,
  entitlementsFile,
  inflightOverlay,
  pasqalPython,
  pasqalValidatorScript,
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
  sessionOnlyOverlay,
  PASQAL_CONFIG_WARNING,
  type FetchImpl,
  type PasqalSpawn,
} from "@/server/amicode/connections"

const respond =
  (status: number): FetchImpl =>
  async () => ({ status })

// Same env-override discipline as the credentials suite: point every file the
// module touches into a per-test tmp dir, restore after.
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
  dir = mkdtempSync(path.join(tmpdir(), "amicode-conn-"))
  process.env.AMICO_CLOUD_FILE = path.join(dir, "cloud.json")
  process.env.AMICO_PASQAL_FILE = path.join(dir, "pasqal.json")
  process.env.AMICODE_CONNECTIONS_FILE = path.join(dir, "connections.json")
  process.env.AMICODE_OPS_DIR = path.join(dir, "amicode-ops") // flip artifacts (#167) stay hermetic
  process.env.AMICO_PYTHON = "/opt/venvs/amico/bin/python3" // never resolved: every pasqal spawn is injected
  process.env.AMICO_PASQAL_VALIDATOR = "/opt/amico/scripts/pasqal_validate.py"
  inflightOverlay.clear()
  sessionOnlyOverlay.clear()
  setBindHostname(undefined) // isolation from any listener another test file bound
})
afterEach(async () => {
  await backgroundRevalidationsSettled() // drain background refreshes BEFORE the env flips to the next test's dir
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  inflightOverlay.clear()
  sessionOnlyOverlay.clear()
  setBindHostname(undefined)
})

// --- Pasqal fixtures: the #164 validator output contract (shared corpus —
// same values the amicode-side contract tests use, so drift fails both) ---
const PASQAL = {
  username: "kate@example.com",
  password: "hunter2-P0ison-pa55word",
  project_id: "proj-0000-aaaa-bbbb",
}
const pasqalSubmit = JSON.stringify({ id: "pasqal-cloud", ...PASQAL })
const validatorLine = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    ok: true,
    project_id: PASQAL.project_id,
    devices: ["EMU_FREE", "FRESNEL"],
    token: "tok-pasqal-minted",
    expires_at: "2026-08-01T00:00:00+00:00",
    ...over,
  }) + "\n"

/** Recordable spawn stub (AC1): captures argv + the EXACT env object the
 *  module hands the child, then answers a scripted run. */
function scripted(exitCode: number, stdout = "") {
  const calls: { argv: string[]; env: Record<string, string> }[] = []
  const spawn: PasqalSpawn = async (argv, env) => {
    calls.push({ argv: [...argv], env: { ...env } })
    return { exitCode, stdout }
  }
  return { calls, spawn }
}

const pasqalEntry = (body: string) =>
  JSON.parse(body).connections.find((conn: { id: string }) => conn.id === "pasqal-cloud")

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

  test("no credential, no cache → needs-key for BOTH cards; company-compute stays first", () => {
    const parsed = JSON.parse(statusResponse())
    expect(parsed.ok).toBe(true)
    expect(parsed.error).toBeNull()
    expect(parsed.connections).toEqual([
      { id: "company-compute", state: "needs-key", validated_at: null, stale: false },
      { id: "pasqal-cloud", state: "needs-key", validated_at: null, stale: false },
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

  test("connected cache older than STALE_MS → stale:true; unvalidated credential → connected + stale", async () => {
    writeCredential("company-compute", cloudCredential)
    const old = new Date(Date.now() - STALE_MS - 60_000).toISOString()
    writeFileSync(connectionsFile(), JSON.stringify({ "company-compute": { state: "connected", validated_at: old } }))
    // stale GETs kick a background revalidate (170 AC1) — injected here so no
    // live network rides the test; the returned body is the pre-kick cache
    expect(JSON.parse(statusResponse({ fetchImpl: respond(503) })).connections[0].stale).toBe(true)
    await backgroundRevalidationsSettled()
    // a credential that exists but was never validated (e.g. CLI-written
    // cloud.json) renders connected-but-stale, prompting a revalidate
    writeFileSync(connectionsFile(), "{}")
    const unvalidated = JSON.parse(statusResponse({ fetchImpl: respond(503) })).connections[0]
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
    // input 3: the in-memory session-only store (pasqal, #169 AC4)
    sessionOnlyOverlay.set("pasqal-cloud", {
      state: "connected",
      validated_at: new Date().toISOString(),
      identity: "proj-1",
      token: "POISON-session",
      password: "POISON-session-password",
      devices: [{ name: "qpu-2", token: "POISON-session-device" }],
    })
    const body = statusResponse()
    expect(body).not.toContain("POISON")
    expect(body).not.toContain("tok-stored-secret") // the stored credential itself must never surface
    const allowed = [
      "id",
      "state",
      "identity",
      "entitlements",
      "expires_at",
      "devices",
      "validated_at",
      "stale",
      "session_only",
    ]
    for (const entry of JSON.parse(body).connections) {
      for (const key of Object.keys(entry)) expect(allowed).toContain(key)
      for (const device of entry.devices ?? []) {
        for (const key of Object.keys(device)) expect(["id", "name", "state"]).toContain(key)
      }
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
      JSON.stringify({ id: "pasqal-cloud", base_url: "https://x.co", token: "tok-orphan-xyz" }), // wrong field set for pasqal
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

// --- Pasqal card (amicode#169 / parent #159): submit spawns the #164
// validator — env-only inputs, one-line JSON + exit-code contract — and only
// the minted token persists. The card is served off the SAME routes as
// company-compute; every spawn below is injected, never a real child.

describe("pasqal submit — validator spawn contract (169 AC1)", () => {
  test("spawn is <python> <script> with EXACTLY the minimal env — never a process.env spread", async () => {
    process.env.AMICODE_TEST_CANARY = "canary-full-spread-detector" // a spread would carry this through
    try {
      const { calls, spawn } = scripted(0, validatorLine())
      const parsed = JSON.parse(await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: spawn }))
      expect(parsed.ok).toBe(true)
      expect(calls).toHaveLength(1)
      // argv: interpreter + script, nothing else — no secret ever rides argv
      expect(calls[0].argv).toEqual(["/opt/venvs/amico/bin/python3", "/opt/amico/scripts/pasqal_validate.py"])
      expect(JSON.stringify(calls[0].argv)).not.toContain(PASQAL.password)
      expect(JSON.stringify(calls[0].argv)).not.toContain(PASQAL.username)
      // env: the exact declared key set — PATH (interpreter resolution) + the three inputs
      expect(Object.keys(calls[0].env).sort()).toEqual([
        "PASQAL_PASSWORD",
        "PASQAL_PROJECT_ID",
        "PASQAL_USERNAME",
        "PATH",
      ])
      expect(calls[0].env.PASQAL_USERNAME).toBe(PASQAL.username)
      expect(calls[0].env.PASQAL_PASSWORD).toBe(PASQAL.password)
      expect(calls[0].env.PASQAL_PROJECT_ID).toBe(PASQAL.project_id)
      expect(calls[0].env.PATH).toBe(process.env.PATH ?? "")
      expect(JSON.stringify(calls[0].env)).not.toContain("canary-full-spread-detector")
    } finally {
      delete process.env.AMICODE_TEST_CANARY
    }
  })

  test("interpreter/script resolution: $AMICO_PYTHON / $AMICO_PASQAL_VALIDATOR override, documented defaults", () => {
    expect(pasqalPython()).toBe("/opt/venvs/amico/bin/python3")
    expect(pasqalValidatorScript()).toBe("/opt/amico/scripts/pasqal_validate.py")
    process.env.AMICO_PYTHON = "   " // blank → default: python3 resolved on PATH
    delete process.env.AMICO_PASQAL_VALIDATOR
    expect(pasqalPython()).toBe("python3")
    // default: the amicode-staged script under the SHARED ops dir resolution
    expect(pasqalValidatorScript()).toBe(
      path.join(dir, "amicode-ops", "scripts", "pasqal-connector", "pasqal_validate.py"),
    )
    delete process.env.AMICODE_OPS_DIR
    expect(pasqalValidatorScript()).toContain(
      path.join(".amico", "amicode", "scripts", "pasqal-connector", "pasqal_validate.py"),
    )
  })

  test("missing/blank username, password or project_id → bad_request, NO spawn, value-free error", async () => {
    const { calls, spawn } = scripted(0, validatorLine())
    const cases = [
      JSON.stringify({ id: "pasqal-cloud" }),
      JSON.stringify({ id: "pasqal-cloud", username: PASQAL.username, project_id: PASQAL.project_id }), // no password
      JSON.stringify({ id: "pasqal-cloud", username: PASQAL.username, password: PASQAL.password, project_id: "  " }),
      JSON.stringify({ id: "pasqal-cloud", username: "", password: PASQAL.password, project_id: PASQAL.project_id }),
      JSON.stringify({ id: "pasqal-cloud", username: PASQAL.username, password: "   ", project_id: PASQAL.project_id }),
    ]
    for (const body of cases) {
      const raw = await submitCredentialResponse(body, { pasqalSpawn: spawn })
      const parsed = JSON.parse(raw)
      expect(parsed.ok).toBe(false)
      expect(parsed.connection).toBeNull()
      expect(raw).not.toContain(PASQAL.password) // error text never echoes what was rejected
      expect(raw).not.toContain(PASQAL.username)
    }
    expect(calls).toHaveLength(0)
    expect(readCredential("pasqal-cloud")).toBeUndefined()
  })

  test("while the validator runs, concurrent GETs render 'validating'; the terminal state clears it", async () => {
    let release!: (run: { exitCode: number; stdout: string }) => void
    const gate = new Promise<{ exitCode: number; stdout: string }>((resolve) => (release = resolve))
    const blocking: PasqalSpawn = () => gate
    const pending = submitCredentialResponse(pasqalSubmit, { pasqalSpawn: blocking })
    await Bun.sleep(0) // let the submit reach the spawn await
    expect(pasqalEntry(statusResponse()).state).toBe("validating")
    release({ exitCode: 0, stdout: validatorLine() })
    expect(JSON.parse(await pending).connection.state).toBe("connected")
    expect(inflightOverlay.size).toBe(0)
    expect(pasqalEntry(statusResponse()).state).toBe("connected")
  })
})

describe("pasqal submit — token-only persistence + device metadata (169 AC2)", () => {
  test("valid run with a token → token-only credential via the #162 seam; connected + identity + devices in the SAME response", async () => {
    const raw = await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.error).toBeNull()
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.connection.identity).toBe(PASQAL.project_id)
    expect(parsed.connection.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }])
    expect(parsed.connection.expires_at).toBe("2026-08-01T00:00:00+00:00")
    // token-only at rest: project_id + token + expiry — no username, no password
    expect(readCredential("pasqal-cloud")).toEqual({
      project_id: PASQAL.project_id,
      token: "tok-pasqal-minted",
      expires_at: "2026-08-01T00:00:00+00:00",
    })
    // the response body itself is secret-free
    expect(raw).not.toContain(PASQAL.password)
    expect(raw).not.toContain(PASQAL.username)
    expect(raw).not.toContain("tok-pasqal-minted")
    // a follow-up GET agrees from disk — devices are status metadata, not credential bytes
    const entry = pasqalEntry(statusResponse())
    expect(entry.state).toBe("connected")
    expect(entry.identity).toBe(PASQAL.project_id)
    expect(entry.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }])
  })

  test("device metadata REFRESHES on every submit — the newest list replaces the old one", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    const shrunk = validatorLine({ devices: ["FRESNEL"], token: "tok-pasqal-rotated" })
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, shrunk).spawn })
    const entry = pasqalEntry(statusResponse())
    expect(entry.devices).toEqual([{ name: "FRESNEL" }])
    expect(readCredential("pasqal-cloud")?.token).toBe("tok-pasqal-rotated")
  })

  test("a valid Pasqal save NEVER touches solver mode — the HP flip is company-compute-only", async () => {
    const parsed = JSON.parse(
      await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn }),
    )
    expect(parsed.connection.state).toBe("connected")
    expect(existsSync(entitlementsFile())).toBe(false)
    expect(existsSync(solverModeFile())).toBe(false)
  })
})

describe("pasqal submit — exit-code classes map to distinct states (169 AC5)", () => {
  test("exit 2 → invalid; exit 3 → unreachable; exit 4 → unentitled (project-unauthorized); nothing written", async () => {
    for (const [exitCode, state] of [
      [2, "invalid"],
      [3, "unreachable"],
      [4, "unentitled"],
    ] as const) {
      const raw = await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(exitCode).spawn })
      const parsed = JSON.parse(raw)
      expect(parsed.ok).toBe(true)
      expect(parsed.error).toBeNull() // contract classes carry no extra warning — the state IS the message
      expect(parsed.connection.state).toBe(state)
      expect(raw).not.toContain(PASQAL.password)
      expect(readCredential("pasqal-cloud")).toBeUndefined()
      expect(pasqalEntry(statusResponse()).state).toBe(state) // persisted for follow-up GETs
    }
  })

  test("config class — exit 1, unknown exits, garbage stdout, spawn throw → unreachable + DISTINCT value-free warning", async () => {
    const boom: PasqalSpawn = async () => {
      throw new Error(`ENOENT: no such file /opt/venvs/amico/bin/python3 (user ${PASQAL.username})`)
    }
    const runs: PasqalSpawn[] = [
      scripted(1).spawn, // missing env / missing SDK
      scripted(127).spawn, // interpreter not found via a shell-ish exit
      scripted(0, "not json {{{").spawn, // exit 0 without the contract line
      scripted(0, JSON.stringify({ ok: false })).spawn, // ok:false on exit 0 is off-contract
      boom, // spawn itself failed
    ]
    for (const pasqalSpawn of runs) {
      const raw = await submitCredentialResponse(pasqalSubmit, { pasqalSpawn })
      const parsed = JSON.parse(raw)
      expect(parsed.ok).toBe(true) // the mutation ran; trouble rides the warning channel (#167 idiom)
      expect(parsed.connection.state).toBe("unreachable")
      expect(parsed.error).toStartWith("pasqal_validator_config:") // distinct from a plain exit-3 unreachable
      expect(parsed.error).toBe(PASQAL_CONFIG_WARNING) // FIXED string — value-free by construction
      expect(raw).not.toContain(PASQAL.password)
      expect(raw).not.toContain(PASQAL.username)
      expect(readCredential("pasqal-cloud")).toBeUndefined()
    }
  })

  test("a failed submit never clobbers a previously stored pasqal credential", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    const stored = readCredential("pasqal-cloud")
    expect(stored).toBeDefined()
    for (const spawn of [scripted(2).spawn, scripted(3).spawn, scripted(4).spawn, scripted(1).spawn]) {
      await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: spawn })
      expect(readCredential("pasqal-cloud")).toEqual(stored!)
    }
  })
})

describe("pasqal submit — null token → session-only connected (169 AC4)", () => {
  const sessionOnlyLine = validatorLine({ token: null, expires_at: null })

  test("null token → connected + session_only marker; NOTHING lands on disk", async () => {
    const raw = await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, sessionOnlyLine).spawn })
    const parsed = JSON.parse(raw)
    expect(parsed.ok).toBe(true)
    expect(parsed.error).toBeNull()
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.connection.session_only).toBe(true)
    expect(parsed.connection.identity).toBe(PASQAL.project_id)
    expect(parsed.connection.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }])
    // nothing persisted: no credential file, no pasqal claim in the status cache
    expect(readCredential("pasqal-cloud")).toBeUndefined()
    expect(existsSync(path.join(dir, "pasqal.json"))).toBe(false)
    const cache = existsSync(connectionsFile()) ? JSON.parse(readFileSync(connectionsFile(), "utf8")) : {}
    expect(cache["pasqal-cloud"]).toBeUndefined()
    // live GETs agree from the in-memory claim
    const entry = pasqalEntry(statusResponse())
    expect(entry.state).toBe("connected")
    expect(entry.session_only).toBe(true)
    expect(entry.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }])
  })

  test("restart semantics: a FRESH status build from disk renders needs-key — the claim died with the process", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, sessionOnlyLine).spawn })
    expect(pasqalEntry(statusResponse()).state).toBe("connected") // live process still connected
    // simulated restart: SAME disk inputs, fresh in-memory state (no session store bound)
    const fresh = statusBody({
      file: connectionsFile(),
      overlay: new Map(),
      hasCredential: (id) => readCredential(id) !== undefined,
    })
    expect(pasqalEntry(fresh).state).toBe("needs-key")
    expect(pasqalEntry(fresh).session_only).toBeUndefined()
  })

  test("a later submit that mints a real token replaces the session-only claim with a durable one", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, sessionOnlyLine).spawn })
    const parsed = JSON.parse(
      await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn }),
    )
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.connection.session_only).toBeUndefined()
    expect(readCredential("pasqal-cloud")?.token).toBe("tok-pasqal-minted")
    // and a failed follow-up drops the session claim rather than keep a stale "connected"
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, sessionOnlyLine).spawn })
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(2).spawn })
    expect(pasqalEntry(statusResponse()).state).toBe("invalid")
  })

  test("disconnect ends a session-only connection immediately", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, sessionOnlyLine).spawn })
    const parsed = JSON.parse(disconnectResponse(JSON.stringify({ id: "pasqal-cloud" })))
    expect(parsed.ok).toBe(true)
    expect(parsed.connection.state).toBe("needs-key")
    expect(pasqalEntry(statusResponse()).state).toBe("needs-key")
  })
})

describe("pasqal revalidate — TOKEN-mode freshness check, never a re-auth (169)", () => {
  test("revalidate NEVER spawns the validator: the stored credential has no password to re-auth with", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    const { calls, spawn } = scripted(0, validatorLine())
    const parsed = JSON.parse(await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" }), { pasqalSpawn: spawn }))
    expect(calls).toHaveLength(0)
    expect(parsed.ok).toBe(true)
    expect(parsed.connection.state).toBe("connected")
  })

  test("unexpired token → connected with a REFRESHED validated_at; devices/identity metadata kept", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    // age the persisted claim so freshness is observable
    const cache = JSON.parse(readFileSync(connectionsFile(), "utf8"))
    const old = new Date(Date.now() - STALE_MS - 60_000).toISOString()
    cache["pasqal-cloud"].validated_at = old
    writeFileSync(connectionsFile(), JSON.stringify(cache))
    expect(pasqalEntry(statusResponse()).stale).toBe(true)

    const parsed = JSON.parse(await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" })))
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.connection.stale).toBe(false)
    expect(Date.parse(parsed.connection.validated_at)).toBeGreaterThan(Date.parse(old))
    expect(parsed.connection.identity).toBe(PASQAL.project_id)
    expect(parsed.connection.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }]) // metadata survives
  })

  test("expires_at in the past → expired (distinct state), credential KEPT for #160's token-mode probe", async () => {
    const pastExpiry = validatorLine({ expires_at: "2026-07-18T00:00:00+00:00" }) // yesterday
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, pastExpiry).spawn })
    const parsed = JSON.parse(await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" })))
    expect(parsed.ok).toBe(true)
    expect(parsed.connection.state).toBe("expired")
    expect(readCredential("pasqal-cloud")?.token).toBe("tok-pasqal-minted") // user data survives
    expect(pasqalEntry(statusResponse()).state).toBe("expired") // persisted for follow-up GETs
  })

  test("no expiry metadata → connected stands (honest minimum; a live token probe is #160 territory)", async () => {
    writeCredential("pasqal-cloud", { project_id: PASQAL.project_id, token: "tok-cli-written" })
    const parsed = JSON.parse(await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" })))
    expect(parsed.connection.state).toBe("connected")
    expect(parsed.connection.identity).toBe(PASQAL.project_id)
    expect(parsed.connection.validated_at).not.toBeNull()
  })

  test("no stored credential → needs-key; a session-only claim is left standing (nothing to re-check)", async () => {
    const empty = JSON.parse(await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" })))
    expect(empty.ok).toBe(true)
    expect(empty.connection.state).toBe("needs-key")
    // session-only connection: revalidate cannot re-auth (no password) and must not destroy the claim
    await submitCredentialResponse(pasqalSubmit, {
      pasqalSpawn: scripted(0, validatorLine({ token: null, expires_at: null })).spawn,
    })
    const session = JSON.parse(await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" })))
    expect(session.connection.state).toBe("connected")
    expect(session.connection.session_only).toBe(true)
  })
})

describe("pasqal disconnect (169)", () => {
  test("disconnect clears the token credential through the #162 seam; status becomes needs-key; idempotent", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    expect(readCredential("pasqal-cloud")).toBeDefined()
    const parsed = JSON.parse(disconnectResponse(JSON.stringify({ id: "pasqal-cloud" })))
    expect(parsed.ok).toBe(true)
    expect(parsed.connection).toEqual({ id: "pasqal-cloud", state: "needs-key", validated_at: null, stale: false })
    expect(readCredential("pasqal-cloud")).toBeUndefined()
    expect(existsSync(path.join(dir, "pasqal.json"))).toBe(false)
    // the company card is untouched by a pasqal disconnect
    expect(JSON.parse(statusResponse()).connections[0].id).toBe("company-compute")
    // idempotent: a second disconnect is a no-op success
    expect(JSON.parse(disconnectResponse(JSON.stringify({ id: "pasqal-cloud" }))).ok).toBe(true)
  })
})

describe("pasqal — password never at rest, whatever the outcome (169 AC3)", () => {
  /** every byte of every file under the test's credential/ops tree */
  const scanAllFiles = (root: string): string => {
    if (!existsSync(root)) return ""
    const chunks: string[] = []
    for (const entry of readdirSync(root, { recursive: true }) as string[]) {
      const full = path.join(root, String(entry))
      if (!statSync(full).isFile()) continue
      chunks.push(readFileSync(full, "latin1")) // raw bytes — encoding cannot hide the needle
    }
    return chunks.join("\n")
  }

  test("after the FULL flow including every failure class, an adversarial scan finds no password/username", async () => {
    const flows: PasqalSpawn[] = [
      scripted(0, validatorLine({ token: null, expires_at: null })).spawn, // session-only
      scripted(2).spawn, // invalid credentials
      scripted(3).spawn, // unreachable
      scripted(4).spawn, // project-unauthorized
      scripted(1).spawn, // config class
      scripted(0, "garbage not json").spawn, // off-contract stdout
      async () => {
        throw new Error(`spawn ENOENT (${PASQAL.password})`) // a leaky error must not propagate
      },
      scripted(0, validatorLine()).spawn, // valid + token LAST: real artifacts stay on disk for the scan
    ]
    for (const pasqalSpawn of flows) {
      const raw = await submitCredentialResponse(pasqalSubmit, { pasqalSpawn })
      expect(raw).not.toContain(PASQAL.password) // no response ever echoes it either
    }
    await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" }))
    // the disk truth: token artifacts exist, the password is NOWHERE
    expect(readCredential("pasqal-cloud")?.token).toBe("tok-pasqal-minted")
    const bytes = scanAllFiles(dir)
    expect(bytes).toContain("tok-pasqal-minted") // the scan sees the real artifacts…
    expect(bytes).not.toContain(PASQAL.password) // …but never the password
    expect(bytes).not.toContain(PASQAL.username) // and never the username
    // the in-memory stores a future response could render from are clean too
    const stores = JSON.stringify([[...inflightOverlay.entries()], [...sessionOnlyOverlay.entries()]])
    expect(stores).not.toContain(PASQAL.password)
    expect(stores).not.toContain(PASQAL.username)
  })

  test("disconnect after the flow leaves a scrubbed tree — and still no secret anywhere", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    disconnectResponse(JSON.stringify({ id: "pasqal-cloud" }))
    expect(readCredential("pasqal-cloud")).toBeUndefined()
    const bytes = scanAllFiles(dir)
    expect(bytes).not.toContain(PASQAL.password)
    expect(bytes).not.toContain(PASQAL.username)
    expect(bytes).not.toContain("tok-pasqal-minted") // disconnect removed the token artifact too
  })
})

// --- Resilience (amicode#170 / parent #159): mtime staleness, background
// revalidation, offline boots, drift, expiry. GETs always render the cache
// IMMEDIATELY; refresh work rides a background task the tests JOIN via
// backgroundRevalidationsSettled() — never a sleep, never a live probe.

describe("mtime staleness — a hand-edited credential file marks the claim stale (170 AC1)", () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

  test("credential file mtime newer than validated_at → stale even inside the 24h window (pure rule)", () => {
    writeCredential("company-compute", cloudCredential)
    const at = minutesAgo(60) // validated 1h ago — fresh by the 24h rule alone
    writeFileSync(
      connectionsFile(),
      JSON.stringify({ "company-compute": { state: "connected", validated_at: at.toISOString() } }),
    )
    const staleFor = (mtime: number | undefined) =>
      JSON.parse(
        statusBody({
          file: connectionsFile(),
          overlay: new Map(),
          hasCredential: () => true,
          credentialMtime: () => mtime,
        }),
      ).connections[0].stale
    expect(staleFor(undefined)).toBe(false) // no file mtime bound (pure builder) → the 24h rule alone
    expect(staleFor(minutesAgo(90).getTime())).toBe(false) // written BEFORE validation — the normal connect order
    expect(staleFor(minutesAgo(30).getTime())).toBe(true) // hand-edited AFTER validation → stale
    // the submit's own write order (credential file saved moments around the
    // validation stamp) stays inside the slack — never a false stale
    expect(staleFor(at.getTime() + 1_000)).toBe(false)
  })

  test("mtime never marks non-connected states stale", () => {
    writeFileSync(
      connectionsFile(),
      JSON.stringify({
        "company-compute": { state: "invalid", validated_at: minutesAgo(60).toISOString() },
        "pasqal-cloud": { state: "expired", validated_at: minutesAgo(60).toISOString() },
      }),
    )
    const parsed = JSON.parse(
      statusBody({
        file: connectionsFile(),
        overlay: new Map(),
        hasCredential: () => true,
        credentialMtime: () => Date.now(),
      }),
    )
    for (const entry of parsed.connections) expect(entry.stale).toBe(false)
  })

  test("statusResponse binds the REAL file mtime, renders the cache immediately, and fires ONE non-blocking background revalidate", async () => {
    writeCredential("company-compute", cloudCredential)
    const at = minutesAgo(60)
    writeFileSync(
      connectionsFile(),
      JSON.stringify({
        "company-compute": { state: "connected", validated_at: at.toISOString(), identity: "team-alpha" },
      }),
    )
    const edited = minutesAgo(30) // hand-edit landed after the validation
    utimesSync(path.join(dir, "cloud.json"), edited, edited)

    let release!: (v: { status: number }) => void
    let probes = 0
    const gated: FetchImpl = () => {
      probes++
      return new Promise((resolve) => (release = resolve))
    }

    // the GET renders the cached claim AT ONCE — stale-marked, never blocked
    // on the probe, never flipped to "validating"
    const first = JSON.parse(statusResponse({ fetchImpl: gated })).connections[0]
    expect(first.state).toBe("connected")
    expect(first.stale).toBe(true)
    expect(first.validated_at).toBe(at.toISOString())
    expect(probes).toBe(1) // the background revalidate kicked off the stored credential

    // concurrent GETs render the same cache and never double-kick
    const second = JSON.parse(statusResponse({ fetchImpl: gated })).connections[0]
    expect(second.state).toBe("connected")
    expect(probes).toBe(1)

    release({ status: 404 }) // auth-passed → valid
    await backgroundRevalidationsSettled()

    const refreshed = JSON.parse(statusResponse({ fetchImpl: gated })).connections[0]
    expect(refreshed.state).toBe("connected")
    expect(refreshed.stale).toBe(false) // validated_at now outranks the edit mtime
    expect(Date.parse(refreshed.validated_at)).toBeGreaterThan(at.getTime())
    expect(refreshed.identity).toBe("team-alpha") // metadata survives the background refresh
    expect(probes).toBe(1) // fresh again — no further kick
  })

  test("the background revalidate probes the CURRENT file's credential — the hand-edit is what gets validated", async () => {
    writeCredential("company-compute", cloudCredential)
    writeCredential("company-compute", { base_url: "https://edited.example.co", token: "tok-hand-edited" })
    const at = minutesAgo(60)
    writeFileSync(
      connectionsFile(),
      JSON.stringify({ "company-compute": { state: "connected", validated_at: at.toISOString() } }),
    )
    let seenAuth = ""
    let seenUrl = ""
    const capture: FetchImpl = async (url, init) => {
      seenUrl = url
      seenAuth = init.headers.authorization ?? ""
      return { status: 404 }
    }
    statusResponse({ fetchImpl: capture })
    await backgroundRevalidationsSettled()
    expect(seenUrl).toBe("https://edited.example.co/solves/__validate__/status")
    expect(seenAuth).toBe("Bearer tok-hand-edited")
  })

  test("hand-edited pasqal.json → stale; the background freshness check refreshes it locally (no validator, no network)", async () => {
    await submitCredentialResponse(pasqalSubmit, { pasqalSpawn: scripted(0, validatorLine()).spawn })
    const cache = JSON.parse(readFileSync(connectionsFile(), "utf8"))
    const at = minutesAgo(60)
    cache["pasqal-cloud"].validated_at = at.toISOString()
    writeFileSync(connectionsFile(), JSON.stringify(cache))
    const edited = minutesAgo(30)
    utimesSync(path.join(dir, "pasqal.json"), edited, edited)

    const first = pasqalEntry(statusResponse())
    expect(first.state).toBe("connected")
    expect(first.stale).toBe(true)
    await backgroundRevalidationsSettled()

    const refreshed = pasqalEntry(statusResponse())
    expect(refreshed.state).toBe("connected")
    expect(refreshed.stale).toBe(false)
    expect(Date.parse(refreshed.validated_at)).toBeGreaterThan(at.getTime())
    expect(refreshed.devices).toEqual([{ name: "EMU_FREE" }, { name: "FRESNEL" }]) // metadata kept
  })

  test("no background kick without a credential, while validating, or for a session-only claim", async () => {
    let probes = 0
    const counting: FetchImpl = async () => {
      probes++
      return { status: 200 }
    }
    // stale connected cache, but the credential file is GONE → needs-key, no kick
    writeFileSync(
      connectionsFile(),
      JSON.stringify({
        "company-compute": {
          state: "connected",
          validated_at: new Date(Date.now() - STALE_MS - 60_000).toISOString(),
        },
      }),
    )
    expect(JSON.parse(statusResponse({ fetchImpl: counting })).connections[0].state).toBe("needs-key")
    // in-flight overlay wins → validating, no second probe behind it
    writeCredential("company-compute", cloudCredential)
    inflightOverlay.set("company-compute", { state: "validating" })
    expect(JSON.parse(statusResponse({ fetchImpl: counting })).connections[0].state).toBe("validating")
    inflightOverlay.clear()
    disconnectResponse(JSON.stringify({ id: "company-compute" })) // back to needs-key so only pasqal is in play below
    // session-only pasqal claim (nothing at rest to re-check) → no kick
    sessionOnlyOverlay.set("pasqal-cloud", {
      state: "connected",
      validated_at: new Date(Date.now() - STALE_MS - 60_000).toISOString(),
      identity: "proj-1",
    })
    const session = pasqalEntry(statusResponse({ fetchImpl: counting }))
    expect(session.state).toBe("connected")
    expect(session.session_only).toBe(true)
    await backgroundRevalidationsSettled()
    expect(probes).toBe(0)
  })
})
