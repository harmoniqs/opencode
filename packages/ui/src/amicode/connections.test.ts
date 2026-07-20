import { describe, expect, test } from "bun:test"
import {
  applyConnectionOverlay,
  cardModel,
  parseConnectionActionResponse,
  parseConnectionsResponse,
  stateCopy,
  submitPayload,
  validatedAtDisplay,
  type ConnectionCardState,
  type ConnectionStateLabels,
  type ConnectionsView,
  type ConnectionView,
} from "./connections"

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

// --- AC1: the state→props mapping the card renders from. With no tsx
// component harness in this repo (see connections-tab.tsx), this mapping IS
// the component contract, so it gets exhaustive coverage here.

const CARD_STATES: ConnectionCardState[] = ["connected", "needs-key", "invalid", "unreachable", "validating", "unknown"]

const labels: ConnectionStateLabels = {
  connected: "Connected",
  "needs-key": "Not connected — enter a key",
  invalid: "Key rejected",
  unreachable: "Service unreachable",
  validating: "Validating key…",
  unknown: "Status needs attention",
}

function viewFor(state: ConnectionCardState, extra: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: "company-compute",
    state,
    rawState: state === "unknown" ? "expired" : state,
    validatedAt: "—",
    stale: false,
    ...extra,
  }
}

describe("stateCopy", () => {
  test("every card state picks its own distinct copy (AC1)", () => {
    const seen = new Set(CARD_STATES.map((state) => stateCopy(viewFor(state), labels)))
    expect(seen.size).toBe(CARD_STATES.length)
    for (const state of CARD_STATES) {
      expect(stateCopy(viewFor(state), labels)).toBe(labels[state])
    }
  })
})

describe("cardModel", () => {
  test("connected: actions + validated_at, no key form", () => {
    const model = cardModel(viewFor("connected", { validatedAt: "7/19/2026", identity: "kate@harmoniqs.co" }))
    expect(model.showForm).toBe(false)
    expect(model.showActions).toBe(true)
    expect(model.showValidatedAt).toBe(true)
    expect(model.showIdentity).toBe(true)
    expect(model.tone).toBe("success")
  })

  test("connected without identity hides the identity line; stale surfaces the hint", () => {
    const bare = cardModel(viewFor("connected"))
    expect(bare.showIdentity).toBe(false)
    expect(bare.showStale).toBe(false)
    const stale = cardModel(viewFor("connected", { stale: true }))
    expect(stale.showStale).toBe(true)
  })

  test("needs-key / invalid / unreachable: key form enabled, no actions", () => {
    for (const [state, tone] of [
      ["needs-key", "neutral"],
      ["invalid", "critical"],
      ["unreachable", "warning"],
    ] as const) {
      const model = cardModel(viewFor(state))
      expect(model.showForm).toBe(true)
      expect(model.formDisabled).toBe(false)
      expect(model.showActions).toBe(false)
      expect(model.showValidatedAt).toBe(false)
      expect(model.tone).toBe(tone)
    }
  })

  test("validating: form stays visible but disabled — the in-flight render (AC2)", () => {
    const model = cardModel(viewFor("validating"))
    expect(model.showForm).toBe(true)
    expect(model.formDisabled).toBe(true)
    expect(model.showActions).toBe(false)
    expect(model.tone).toBe("pending")
  })

  test("unknown: safe fallback keeps every exit open and shows the raw wire word (AC4)", () => {
    const model = cardModel(viewFor("unknown"))
    expect(model.showForm).toBe(true)
    expect(model.formDisabled).toBe(false)
    expect(model.showActions).toBe(true)
    expect(model.showRawState).toBe(true)
    expect(model.tone).toBe("neutral")
  })

  test("only unknown renders the raw state word", () => {
    for (const state of CARD_STATES.filter((s) => s !== "unknown")) {
      expect(cardModel(viewFor(state)).showRawState).toBe(false)
    }
  })
})

// --- AC3: the submit gate. An empty submission produces NO payload — the
// component fires no request and touches no state when this returns undefined.

describe("submitPayload", () => {
  test("empty or whitespace-only fields yield no payload at all (AC3)", () => {
    expect(submitPayload("company-compute", "", "")).toBeUndefined()
    expect(submitPayload("company-compute", "https://solve.example", "")).toBeUndefined()
    expect(submitPayload("company-compute", "", "sk-key")).toBeUndefined()
    expect(submitPayload("company-compute", "   ", "sk-key")).toBeUndefined()
    expect(submitPayload("company-compute", "https://solve.example", "  \t ")).toBeUndefined()
  })

  test("both fields present yields the trimmed wire body", () => {
    expect(submitPayload("company-compute", "  https://solve.example  ", " sk-key ")).toEqual({
      id: "company-compute",
      base_url: "https://solve.example",
      token: "sk-key",
    })
  })
})

// --- AC2: the overlay the app layer applies around one round trip — the
// submit renders "validating" while the POST is in flight, then the terminal
// connection from the SAME response replaces it. No polling loop anywhere.

describe("applyConnectionOverlay", () => {
  const baseView: ConnectionsView = {
    ok: true,
    connections: [viewFor("needs-key")],
  }

  test("no overlay passes the base view through untouched", () => {
    expect(applyConnectionOverlay(baseView, {})).toBe(baseView)
    expect(applyConnectionOverlay(undefined, {})).toBeUndefined()
  })

  test("validating overlay flips the matching card to the in-flight state (AC2)", () => {
    const view = applyConnectionOverlay(baseView, { validating: "company-compute" })
    expect(view?.ok).toBe(true)
    expect(view?.connections[0].state).toBe("validating")
    expect(view?.connections[0].id).toBe("company-compute")
    // the base view is not mutated
    expect(baseView.connections[0].state).toBe("needs-key")
  })

  test("terminal overlay replaces the card with the connection from the same response (AC2)", () => {
    const terminal = viewFor("connected", { validatedAt: "7/19/2026", identity: "kate@harmoniqs.co" })
    const view = applyConnectionOverlay(baseView, { terminal })
    expect(view?.connections).toHaveLength(1)
    expect(view?.connections[0]).toEqual(terminal)
  })

  test("validating wins over a stale terminal while a new request is in flight", () => {
    const terminal = viewFor("connected")
    const view = applyConnectionOverlay(baseView, { terminal, validating: "company-compute" })
    expect(view?.connections[0].state).toBe("validating")
  })

  test("overlay still renders when the base GET is absent or failed", () => {
    const inflight = applyConnectionOverlay(undefined, { validating: "company-compute" })
    expect(inflight?.ok).toBe(true)
    expect(inflight?.connections[0].state).toBe("validating")
    const failed = applyConnectionOverlay(
      { ok: false, connections: [], error: "boom" },
      { terminal: viewFor("connected") },
    )
    expect(failed?.ok).toBe(true)
    expect(failed?.connections[0].state).toBe("connected")
  })

  test("an overlay for one id leaves sibling cards untouched (Pasqal-ready)", () => {
    const twoCards: ConnectionsView = {
      ok: true,
      connections: [viewFor("needs-key"), viewFor("connected", { id: "pasqal-cloud" })],
    }
    const view = applyConnectionOverlay(twoCards, { validating: "company-compute" })
    expect(view?.connections[1]).toEqual(twoCards.connections[1])
    expect(view?.connections[0].state).toBe("validating")
  })
})
