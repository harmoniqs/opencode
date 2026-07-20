import { describe, expect, test } from "bun:test"
import { parseConnectionActionResponse, parseConnectionsResponse, validatedAtDisplay } from "./connections"

// Wire fixtures mirror the #165 status contract (packages/opencode
// src/server/amicode/connections.ts): GET → {ok, connections:[…]},
// POST → {ok, connection, error}.
const connectedEntry = {
  id: "company-compute",
  state: "connected",
  identity: "kate@harmoniqs.co",
  entitlements: ["solve"],
  expires_at: "2026-12-31T00:00:00.000Z",
  devices: [{ id: "d1", name: "fresnel", state: "online" }],
  validated_at: "2026-07-19T10:00:00.000Z",
  stale: false,
}

describe("validatedAtDisplay", () => {
  test("renders a parseable ISO timestamp as a locale string", () => {
    const display = validatedAtDisplay("2026-07-19T10:00:00.000Z")
    expect(display).not.toBe("—")
    expect(display).toContain("2026")
  })
  test("maps absent, non-string, empty, and unparseable values to an em dash", () => {
    expect(validatedAtDisplay(undefined)).toBe("—")
    expect(validatedAtDisplay(null)).toBe("—")
    expect(validatedAtDisplay(42)).toBe("—")
    expect(validatedAtDisplay("")).toBe("—")
    expect(validatedAtDisplay("not-a-date")).toBe("—")
  })
})

describe("parseConnectionsResponse", () => {
  test("happy path: a connected entry passes through with renamed fields", () => {
    const view = parseConnectionsResponse({ ok: true, connections: [connectedEntry], error: null })
    expect(view.ok).toBe(true)
    expect(view.connections).toHaveLength(1)
    const conn = view.connections[0]
    expect(conn.id).toBe("company-compute")
    expect(conn.state).toBe("connected")
    expect(conn.rawState).toBe("connected")
    expect(conn.identity).toBe("kate@harmoniqs.co")
    expect(conn.validatedAt).toContain("2026")
    expect(conn.stale).toBe(false)
  })

  test("each contract state this slice renders survives the parse", () => {
    for (const state of ["connected", "needs-key", "invalid", "unreachable", "validating"]) {
      const view = parseConnectionsResponse({
        ok: true,
        connections: [{ id: "company-compute", state, validated_at: null, stale: false }],
        error: null,
      })
      expect(view.ok).toBe(true)
      expect(view.connections[0].state).toBe(state as never)
    }
  })

  test("unknown states collapse to the safe fallback, raw word preserved (AC4)", () => {
    for (const state of ["expired", "unentitled", "some-future-state"]) {
      const view = parseConnectionsResponse({
        ok: true,
        connections: [{ id: "company-compute", state, validated_at: null, stale: false }],
        error: null,
      })
      expect(view.ok).toBe(true)
      expect(view.connections[0].state).toBe("unknown")
      expect(view.connections[0].rawState).toBe(state)
    }
  })

  test("ok:false carries the server error string", () => {
    const view = parseConnectionsResponse({ ok: false, connections: [], error: "bad_output: boom" })
    expect(view.ok).toBe(false)
    expect(view.error).toBe("bad_output: boom")
  })

  test("ok:false with no usable error still produces a message", () => {
    const view = parseConnectionsResponse({ ok: false, connections: [], error: null })
    expect(view.ok).toBe(false)
    expect(view.error).toBeTruthy()
  })

  test("non-object responses are bad_shape, never a throw", () => {
    for (const raw of [null, undefined, 42, "nope", []]) {
      const view = parseConnectionsResponse(raw)
      expect(view.ok).toBe(false)
      expect(view.error).toContain("bad_shape")
    }
  })

  test("connections absent or non-array is bad_shape", () => {
    const missing = parseConnectionsResponse({ ok: true, error: null })
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain("bad_shape")
    const nonArray = parseConnectionsResponse({ ok: true, connections: "three", error: null })
    expect(nonArray.ok).toBe(false)
  })

  test("tolerant entries: missing/mistyped fields never throw (AC4)", () => {
    const view = parseConnectionsResponse({
      ok: true,
      connections: [
        {},
        null,
        { id: "company-compute", state: 7, identity: 3, validated_at: 12, stale: "yes" },
        { id: "", state: "connected", base_url: 9 },
      ],
      error: null,
    })
    expect(view.ok).toBe(true)
    expect(view.connections).toHaveLength(4)
    expect(view.connections[0]).toEqual({
      id: "(unknown)",
      state: "unknown",
      rawState: "unknown",
      identity: undefined,
      baseUrl: undefined,
      validatedAt: "—",
      stale: false,
    })
    expect(view.connections[2].state).toBe("unknown")
    expect(view.connections[2].stale).toBe(false)
    expect(view.connections[3].id).toBe("(unknown)")
    expect(view.connections[3].baseUrl).toBeUndefined()
  })

  test("unknown fields are dropped — a poisoned entry can never carry a secret into the view", () => {
    const view = parseConnectionsResponse({
      ok: true,
      connections: [{ ...connectedEntry, token: "sk-poison", password: "hunter2", junk: { nested: "sk-deep" } }],
      error: null,
    })
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain("sk-poison")
    expect(serialized).not.toContain("hunter2")
    expect(serialized).not.toContain("sk-deep")
  })

  test("base_url prefill survives when the server offers one (forward-compatible)", () => {
    const view = parseConnectionsResponse({
      ok: true,
      connections: [{ id: "company-compute", state: "needs-key", base_url: "https://solve.example", stale: false }],
      error: null,
    })
    expect(view.connections[0].baseUrl).toBe("https://solve.example")
  })
})

describe("parseConnectionActionResponse", () => {
  test("happy path: the terminal connection rides the same response (AC2 wire shape)", () => {
    const view = parseConnectionActionResponse({ ok: true, connection: connectedEntry, error: null })
    expect(view.ok).toBe(true)
    expect(view.connection?.state).toBe("connected")
    expect(view.connection?.identity).toBe("kate@harmoniqs.co")
  })

  test("ok:false carries the server error; missing error still produces a message", () => {
    const failed = parseConnectionActionResponse({ ok: false, connection: null, error: "invalid_key: rejected" })
    expect(failed.ok).toBe(false)
    expect(failed.error).toBe("invalid_key: rejected")
    const silent = parseConnectionActionResponse({ ok: false, connection: null, error: null })
    expect(silent.ok).toBe(false)
    expect(silent.error).toBeTruthy()
  })

  test("non-object responses and a missing connection are bad_shape, never a throw", () => {
    for (const raw of [null, undefined, 42, "nope", []]) {
      const view = parseConnectionActionResponse(raw)
      expect(view.ok).toBe(false)
      expect(view.error).toContain("bad_shape")
    }
    const missing = parseConnectionActionResponse({ ok: true, connection: null, error: null })
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain("bad_shape")
  })

  test("the submitted token has no path into the parsed view", () => {
    const view = parseConnectionActionResponse({
      ok: true,
      connection: { ...connectedEntry, token: "sk-echoed" },
      error: null,
    })
    expect(JSON.stringify(view)).not.toContain("sk-echoed")
  })
})
