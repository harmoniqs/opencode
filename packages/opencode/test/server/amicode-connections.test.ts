// AMICODE: Connections module tests (amicode#165 / parent #159, ADR 0002).
// Company Compute connect path: probe-first validation, redacting-whitelist
// status rendering, loopback-gated mutations. No live network — every probe
// runs through an injected FetchImpl. Credential + status-cache files ride the
// same env overrides production honors (AMICO_CLOUD_FILE /
// AMICODE_CONNECTIONS_FILE), so the test seam and the deploy seam are one
// mechanism (the #162 idiom).
import { describe, expect, test } from "bun:test"
import { probeCompanyCompute, type FetchImpl } from "@/server/amicode/connections"

const respond =
  (status: number): FetchImpl =>
  async () => ({ status })

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
