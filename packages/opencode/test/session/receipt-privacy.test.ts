import { describe, expect, test } from "bun:test"
import { SessionReceiptPrivacy } from "@/session/receipt-privacy"

const artifactSentinel = "GENERATED_ARTIFACT_SENTINEL_1078"

function hostReceipt() {
  return {
    operation: {
      id: "operation-private",
      rootID: "root-private",
      sessionID: "session-private",
      origin: "agent",
      state: "committed",
    },
    receipt: {
      id: "receipt-1",
      sequence: 1,
      resource: "logical-target.ts",
      operation: "write",
      outcome: "applied",
      timeCreated: 1,
    },
    assessment: {
      id: "assessment-private",
      receiptID: "receipt-1",
      confidence: "verified",
      netState: "changed",
      evidenceState: "available",
      revision: 2,
      expiresAt: 10,
      timeCreated: 2,
    },
    evidence: { receiptID: "receipt-1", content: artifactSentinel },
    context: {
      capability: "capability-private",
      canonicalPath: "/private/canonical/path",
      rawHash: "raw-hash-private",
      baseline: artifactSentinel,
      redactionDecision: "internal",
    },
    derived: { patch: artifactSentinel, additions: 1, deletions: 1 },
  }
}

describe("SessionReceiptPrivacy display-safe projection", () => {
  test("emits only Files Changed fields and never host-only evidence", () => {
    const projected = SessionReceiptPrivacy.project(hostReceipt(), "files_changed")

    expect(projected).toEqual({
      operation: { origin: "agent", state: "committed" },
      receipt: {
        id: "receipt-1",
        sequence: 1,
        resource: "logical-target.ts",
        operation: "write",
        outcome: "applied",
        timeCreated: 1,
      },
      assessment: {
        receiptID: "receipt-1",
        confidence: "verified",
        netState: "changed",
        evidenceState: "available",
        revision: 2,
        expiresAt: 10,
        timeCreated: 2,
      },
      evidence: { receiptID: "receipt-1" },
      derived: { additions: 1, deletions: 1 },
    })
    expect(JSON.stringify(projected)).not.toContain(artifactSentinel)
    expect(JSON.stringify(projected)).not.toContain("canonicalPath")
    expect(SessionReceiptPrivacy.project(hostReceipt(), "browser")).toEqual(projected)
  })

  test("redacts the small egress summary and omits receipts from transcripts and ordinary metadata", () => {
    const receipt = hostReceipt()

    for (const boundary of ["share", "export", "telemetry", "log", "error"] as const) {
      const projected = SessionReceiptPrivacy.project(receipt, boundary)
      expect(projected).toEqual({
        operation: { origin: "[redacted:operation.origin]" },
        receipt: { resource: "[redacted:receipt.resource]" },
      })
      expect(JSON.stringify(projected)).not.toContain(artifactSentinel)
    }

    expect(SessionReceiptPrivacy.project(receipt, "transcript")).toEqual({})
    expect(SessionReceiptPrivacy.project(receipt, "session_metadata")).toEqual({})
  })

  test("gates external evidence detail behind authentication, authorization, current policy, and no-store", () => {
    const receipt = hostReceipt()
    const allowed = SessionReceiptPrivacy.externalDetail(receipt, {
      authenticated: true,
      receiptReferenceAuthorized: true,
      evidencePolicy: "allow",
      now: 1,
      expiresAt: 10,
    })

    expect(allowed.status).toBe(200)
    expect(allowed.headers).toEqual({ "cache-control": "no-store" })
    expect(allowed.body).toMatchObject({
      evidence: { receiptID: "receipt-1", content: artifactSentinel },
      derived: { patch: artifactSentinel, additions: 1, deletions: 1 },
    })
    expect(JSON.stringify(allowed.body)).not.toContain("capability-private")

    for (const access of [
      {
        authenticated: false,
        receiptReferenceAuthorized: true,
        evidencePolicy: "allow" as const,
        now: 1,
        expiresAt: 10,
      },
      {
        authenticated: true,
        receiptReferenceAuthorized: false,
        evidencePolicy: "allow" as const,
        now: 1,
        expiresAt: 10,
      },
      {
        authenticated: true,
        receiptReferenceAuthorized: true,
        evidencePolicy: "deny" as const,
        now: 1,
        expiresAt: 10,
      },
      {
        authenticated: true,
        receiptReferenceAuthorized: true,
        evidencePolicy: "allow" as const,
        now: 10,
        expiresAt: 10,
      },
    ]) {
      const denied = SessionReceiptPrivacy.externalDetail(receipt, access)
      expect(denied.headers).toEqual({ "cache-control": "no-store" })
      expect(denied.status).not.toBe(200)
      expect(JSON.stringify(denied.body)).not.toContain(artifactSentinel)
      expect(JSON.stringify(denied.body)).not.toContain("canonicalPath")
    }

    const redirected = SessionReceiptPrivacy.externalDetail(receipt, {
      authenticated: true,
      receiptReferenceAuthorized: true,
      evidencePolicy: "allow",
      now: 1,
      redirected: true,
    })
    expect(redirected).toMatchObject({ status: 307, headers: { "cache-control": "no-store" } })
    expect(JSON.stringify(redirected.body)).not.toContain(artifactSentinel)
    expect(JSON.stringify(redirected.body)).not.toContain("canonicalPath")

    const unavailable = hostReceipt()
    unavailable.assessment!.evidenceState = "unavailable"
    const unavailableDetail = SessionReceiptPrivacy.externalDetail(unavailable, {
      authenticated: true,
      receiptReferenceAuthorized: true,
      evidencePolicy: "allow",
      now: 1,
      expiresAt: 10,
    })
    expect(unavailableDetail).toMatchObject({ status: 403, headers: { "cache-control": "no-store" } })
    expect(JSON.stringify(unavailableDetail.body)).not.toContain(artifactSentinel)
  })

  test("retains the exact legacy payload until capability discovery selects the full projection", () => {
    const legacy = {
      version: 1,
      revision: 3,
      assessments: [{ reference: "external_legacy", file: "/legacy/path", patch: artifactSentinel }],
    }

    expect(SessionReceiptPrivacy.display({ legacy, receipt: hostReceipt() }, { mode: "legacy" })).toBe(legacy)
    expect(SessionReceiptPrivacy.display({ legacy, receipt: hostReceipt() }, { mode: "full", version: 1 })).toEqual(
      SessionReceiptPrivacy.project(hostReceipt(), "files_changed"),
    )
  })
})
