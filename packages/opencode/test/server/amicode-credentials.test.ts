// AMICODE: CredentialStore seam tests (amicode#162 / parent #159, ADR 0001).
// Golden fixtures in ./fixtures/credentials lock the two on-disk byte shapes;
// an amicode-side test can consume the same fixture bytes to prove the CLI
// reader parses what this store writes. All paths go through the same env
// overrides the CLI honors (AMICO_CLOUD_FILE / AMICO_PASQAL_FILE) — the test
// seam and the compatibility seam are one mechanism.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { cloudFile, pasqalFile, readCredential, writeCredential, clearCredential } from "@/server/amicode/credentials"

const mode = (file: string) => statSync(file).mode & 0o777

const FIXTURES = path.join(import.meta.dir, "fixtures", "credentials")
const golden = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8")

const ENV_KEYS = ["AMICO_CLOUD_FILE", "AMICO_PASQAL_FILE"] as const
let savedEnv: Record<string, string | undefined>
let dir: string

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  dir = mkdtempSync(path.join(tmpdir(), "amicode-creds-"))
  process.env.AMICO_CLOUD_FILE = path.join(dir, "cloud.json")
  process.env.AMICO_PASQAL_FILE = path.join(dir, "pasqal.json")
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe("company-compute backend (AC1)", () => {
  test("write emits the frozen golden bytes — trailing slash trimmed, nothing else in the file", () => {
    writeCredential("company-compute", {
      base_url: "https://solves.staging.harmoniqs.co/",
      token: "tok-fixture-company-compute",
    })
    expect(readFileSync(cloudFile(), "utf8")).toBe(golden("cloud.json"))
  })

  test("written file satisfies the CLI remote-config reader contract", () => {
    // Mirrors amico-run/src/remote_config.ts: JSON object, exactly the keys
    // "base_url" and "token", both non-empty strings, no trailing slash.
    writeCredential("company-compute", { base_url: "https://solves.example.co///", token: "tok-1" })
    const raw = JSON.parse(readFileSync(cloudFile(), "utf8")) as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(["base_url", "token"])
    expect(raw.base_url).toBe("https://solves.example.co")
    expect(typeof raw.token).toBe("string")
    expect(raw.token).not.toBe("")
  })

  test("golden fixture reads back through the store (reader side of the frozen shape)", () => {
    writeCredential("company-compute", {
      base_url: "https://solves.staging.harmoniqs.co",
      token: "tok-fixture-company-compute",
    })
    expect(readCredential("company-compute")).toEqual({
      base_url: "https://solves.staging.harmoniqs.co",
      token: "tok-fixture-company-compute",
    })
  })

  test("empty token or base_url is rejected; nothing lands on disk", () => {
    expect(() => writeCredential("company-compute", { base_url: "https://x.co", token: "" })).toThrow()
    expect(() => writeCredential("company-compute", { base_url: "", token: "tok" })).toThrow()
    expect(readCredential("company-compute")).toBeUndefined()
  })

  test("clear removes the file; read reports absent", () => {
    writeCredential("company-compute", { base_url: "https://x.co", token: "tok" })
    clearCredential("company-compute")
    expect(readCredential("company-compute")).toBeUndefined()
    clearCredential("company-compute") // idempotent — clearing an absent file is a no-op
  })
})

describe("atomic 0600-at-birth writer (AC2)", () => {
  test("tmp file is 0600 AT CREATION — asserted at the tmp stage, before rename", () => {
    let tmpSeen: string | undefined
    let tmpMode: number | undefined
    writeCredential("company-compute", { base_url: "https://x.co", token: "tok" }, {
      rename(tmp, target) {
        tmpSeen = tmp
        tmpMode = mode(tmp) // stat BEFORE the rename — birth mode, not post-hoc chmod
        expect(path.dirname(tmp)).toBe(path.dirname(target)) // same dir → same fs, rename is atomic
        renameSync(tmp, target)
      },
    })
    expect(tmpSeen).toBeDefined()
    expect(tmpMode).toBe(0o600)
    expect(mode(cloudFile())).toBe(0o600)
  })

  test("final file is 0600 with the default rename", () => {
    writeCredential("company-compute", { base_url: "https://x.co", token: "tok" })
    expect(mode(cloudFile())).toBe(0o600)
  })

  test("a pre-existing wrong-permission file is corrected to 0600 on write", () => {
    writeFileSync(cloudFile(), '{"base_url":"https://old.co","token":"old"}\n')
    chmodSync(cloudFile(), 0o644)
    expect(mode(cloudFile())).toBe(0o644)
    writeCredential("company-compute", { base_url: "https://new.co", token: "new-tok" })
    expect(mode(cloudFile())).toBe(0o600)
    expect(readCredential("company-compute")).toEqual({ base_url: "https://new.co", token: "new-tok" })
  })
})

describe("write atomicity under injected failure (AC3)", () => {
  test("failure at the rename step leaves the OLD file byte-for-byte intact, no tmp debris", () => {
    writeCredential("company-compute", { base_url: "https://old.co", token: "old-tok" })
    const before = readFileSync(cloudFile(), "utf8")
    expect(() =>
      writeCredential("company-compute", { base_url: "https://new.co", token: "new-tok" }, {
        rename() {
          throw new Error("injected: disk full at rename")
        },
      }),
    ).toThrow("injected")
    expect(readFileSync(cloudFile(), "utf8")).toBe(before) // old credential untouched
    expect(readdirSync(dir)).toEqual(["cloud.json"]) // no partial tmp left behind
  })

  test("failure on a first-ever write leaves NO credential file at all", () => {
    expect(() =>
      writeCredential("company-compute", { base_url: "https://x.co", token: "tok" }, {
        rename() {
          throw new Error("injected: power loss")
        },
      }),
    ).toThrow("injected")
    expect(readdirSync(dir)).toEqual([]) // nothing partial, nothing corrupt
    expect(readCredential("company-compute")).toBeUndefined()
  })
})

/** every byte currently under the credential dir — the poison scan surface */
const dirBytes = () =>
  readdirSync(dir)
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n")

describe("pasqal-cloud backend — token-only at rest (AC4)", () => {
  test("write emits the frozen golden bytes (project_id + token + expiry, nothing else)", () => {
    writeCredential("pasqal-cloud", {
      project_id: "proj-fixture-pasqal",
      token: "tok-fixture-pasqal",
      expires_at: "2026-08-01T00:00:00Z",
    })
    expect(readFileSync(pasqalFile(), "utf8")).toBe(golden("pasqal.json"))
    expect(readCredential("pasqal-cloud")).toEqual({
      project_id: "proj-fixture-pasqal",
      token: "tok-fixture-pasqal",
      expires_at: "2026-08-01T00:00:00Z",
    })
  })

  test("expiry metadata is optional; the key set is exact either way", () => {
    writeCredential("pasqal-cloud", { project_id: "proj-1", token: "tok-1" })
    const raw = JSON.parse(readFileSync(pasqalFile(), "utf8")) as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(["project_id", "token"])
  })

  test("a null token can never persist — this store only writes real tokens", () => {
    expect(() => writeCredential("pasqal-cloud", { project_id: "proj-1", token: null } as any)).toThrow()
    expect(readdirSync(dir)).toEqual([])
  })

  test("poison: a password/username-bearing object can never land those keys on disk", () => {
    // seed a valid credential first — the poison write must not even dirty it
    writeCredential("pasqal-cloud", { project_id: "proj-1", token: "tok-1" })
    const before = readFileSync(pasqalFile(), "utf8")
    for (const poison of [
      { project_id: "proj-1", token: "tok-2", password: "hunter2-super-secret" },
      { project_id: "proj-1", token: "tok-2", username: "kate@harmoniqs.co" },
      { project_id: "proj-1", token: "tok-2", user_password: "hunter2-super-secret" },
      { base_url: "https://x.co", token: "tok-2", password: "hunter2-super-secret" }, // company side too
    ]) {
      let threw: Error | undefined
      try {
        writeCredential(("base_url" in poison ? "company-compute" : "pasqal-cloud") as any, poison as any)
      } catch (err) {
        threw = err as Error
      }
      expect(threw).toBeDefined()
      expect(threw!.message).not.toContain("hunter2") // errors never echo the value
      expect(threw!.message).not.toContain("kate@")
    }
    expect(readFileSync(pasqalFile(), "utf8")).toBe(before) // seeded credential untouched
    expect(dirBytes()).not.toContain("hunter2") // the secret exists in NO file
    expect(dirBytes()).not.toContain("kate@harmoniqs.co")
  })

  test("unknown non-poison keys are allowlist-dropped, never serialized", () => {
    writeCredential("pasqal-cloud", { project_id: "proj-1", token: "tok-1", note: "scribble" } as any)
    const raw = JSON.parse(readFileSync(pasqalFile(), "utf8")) as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(["project_id", "token"])
    expect(dirBytes()).not.toContain("scribble")
  })
})
