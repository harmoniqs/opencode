import { describe, expect, test } from "bun:test"
import { SessionBusinessRecord } from "@/session/business-record"
import { SessionEvidence } from "@/session/evidence"
import { SessionMutation } from "@/session/mutation"

const lineage = (rootID: string, sessionID: string) => (candidate: string) =>
  candidate === sessionID ? rootID : undefined

describe("session business-record classification", () => {
  test("classifies every plugin, runner, and operational route the registry ships", () => {
    // Business-visible plugin/runner writes.
    for (const routeID of ["plugin-problem-record", "runner-run-metadata", "runner-artifact"] as const) {
      expect(SessionBusinessRecord.classify(routeID)).toBe("business")
      expect(SessionMutation.Registry.require(routeID)).toEqual({ id: routeID, kind: "ledger" })
    }
    // Every business route names a resource classification.
    expect(SessionBusinessRecord.Routes).toEqual({
      "plugin-problem-record": "problem_record",
      "runner-run-metadata": "run_metadata",
      "runner-artifact": "artifact",
    })
    // Operational machinery — explicitly out of scope.
    for (const routeID of SessionBusinessRecord.OperationalRoutes) {
      expect(SessionBusinessRecord.classify(routeID)).toBe("operational")
      expect(SessionMutation.Registry.require(routeID)).toEqual({ id: routeID, kind: "out_of_scope" })
    }
    // Engine tool routes belong to a different adopter; opaque routes carry no adopted resources.
    for (const routeID of ["local-file-write", "tool-write", "direct-file-write"] as const)
      expect(SessionBusinessRecord.classify(routeID)).toBe("engine")
    for (const routeID of ["shell-action", "cli-action", "mcp-action"] as const)
      expect(SessionBusinessRecord.classify(routeID)).toBe("opaque")
    expect(SessionBusinessRecord.classify("unregistered-writer")).toBeUndefined()
  })
})

describe("session business-record adoption", () => {
  test("registered plugin writes produce a system-origin receipt tied to the initiating session lineage", () => {
    const adoption = SessionBusinessRecord.adopt({
      rootForSession: lineage("root-1", "session-1"),
      routeID: "plugin-problem-record",
      sessionID: "session-1",
      rootID: "root-1",
      operation: "record-problem",
      operationID: "op-problem-1",
      resources: [{ id: "problem", resource: "problem:cz-transmon", outcome: "applied" }],
    })

    expect(adoption).toEqual({
      kind: "adopted",
      receipt: {
        origin: "system",
        rootID: "root-1",
        sessionID: "session-1",
        routeID: "plugin-problem-record",
        operationID: "op-problem-1",
        operation: "record-problem",
        classification: "problem_record",
        outcome: "applied",
        resources: [{ id: "problem", resource: "problem:cz-transmon", outcome: "applied", evidence: "none" }],
      },
    })

    // A write whose declared session is not the lineage's initiating session is refused, not mis-attributed.
    expect(
      SessionBusinessRecord.adopt({
        rootForSession: lineage("root-1", "session-1"),
        routeID: "plugin-problem-record",
        sessionID: "session-1",
        rootID: "root-other",
        operation: "record-problem",
        operationID: "op-problem-2",
        resources: [{ id: "problem", resource: "problem:cz-transmon", outcome: "applied" }],
      }),
    ).toEqual({ kind: "refused", reason: "lineage_mismatch" })
  })

  test("runner metadata and declared artifacts carry safe evidence or artifact references", () => {
    const metadata = SessionBusinessRecord.adopt({
      rootForSession: lineage("root-2", "session-2"),
      routeID: "runner-run-metadata",
      sessionID: "session-2",
      rootID: "root-2",
      operation: "record-run",
      operationID: "op-run-1",
      resources: [{ id: "run", resource: "run:r20260912", outcome: "applied", evidence: { content: "F=0.9982" } }],
    })
    expect(metadata).toMatchObject({
      kind: "adopted",
      receipt: {
        classification: "run_metadata",
        resources: [{ id: "run", resource: "run:r20260912", outcome: "applied", evidence: "inline" }],
      },
    })

    const artifact = SessionBusinessRecord.adopt({
      rootForSession: lineage("root-2", "session-2"),
      routeID: "runner-artifact",
      sessionID: "session-2",
      rootID: "root-2",
      operation: "record-artifact",
      operationID: "op-artifact-1",
      resources: [{ id: "pulse", resource: "artifact:pulse.jld2", outcome: "applied", artifact: { ref: "artifact-ref-1" } }],
    })
    expect(artifact).toMatchObject({
      kind: "adopted",
      receipt: {
        classification: "artifact",
        resources: [{ id: "pulse", resource: "artifact:pulse.jld2", outcome: "applied", evidence: "artifact_link" }],
      },
    })
    // The large generated output is linked, never copied into the receipt.
    expect(JSON.stringify(artifact)).not.toContain("artifact-ref-1")
  })

  test("operational state is out of scope and cannot recurse into a business receipt", () => {
    for (const routeID of SessionBusinessRecord.OperationalRoutes)
      expect(
        SessionBusinessRecord.adopt({
          rootForSession: lineage("root-3", "session-3"),
          routeID,
          sessionID: "session-3",
          rootID: "root-3",
          operation: "operational",
          operationID: `op-${routeID}`,
          resources: [{ id: "state", resource: "state:internal", outcome: "applied" }],
        }),
      ).toEqual({ kind: "refused", reason: "operational_resource" })

    // An unregistered writer never adopts; an engine/opaque route routes elsewhere.
    expect(
      SessionBusinessRecord.adopt({
        rootForSession: lineage("root-3", "session-3"),
        routeID: "unregistered-writer",
        sessionID: "session-3",
        rootID: "root-3",
        operation: "write",
        operationID: "op-unknown",
        resources: [{ id: "x", resource: "x", outcome: "applied" }],
      }),
    ).toEqual({ kind: "refused", reason: "unregistered_route" })
    expect(
      SessionBusinessRecord.adopt({
        rootForSession: lineage("root-3", "session-3"),
        routeID: "tool-write",
        sessionID: "session-3",
        rootID: "root-3",
        operation: "write",
        operationID: "op-engine",
        resources: [{ id: "x", resource: "x", outcome: "applied" }],
      }),
    ).toEqual({ kind: "refused", reason: "not_business_route" })
  })

  test("contextless CLI and shell launches emit an unknown-operation receipt without adopting effects", () => {
    const receipt = SessionBusinessRecord.unknown({
      operationID: "op-cli-1",
      origin: "system",
      operation: "cli-launch",
    })
    expect(receipt).toEqual({
      kind: "unknown_mutation",
      operationID: "op-cli-1",
      origin: "system",
      operation: "cli-launch",
    })
    expect(receipt).not.toHaveProperty("resource")
    expect(receipt).not.toHaveProperty("resources")

    // The opaque CLI/shell routes never adopt filesystem effects through the business path.
    for (const routeID of ["cli-action", "shell-action"] as const)
      expect(
        SessionBusinessRecord.adopt({
          rootForSession: lineage("root-4", "session-4"),
          routeID,
          sessionID: "session-4",
          rootID: "root-4",
          operation: "cli",
          operationID: `op-${routeID}`,
          resources: [{ id: "x", resource: "x", outcome: "applied" }],
        }),
      ).toEqual({ kind: "refused", reason: "requires_opaque_receipt" })
  })

  test("protected internal values are redacted by the exposure matrix before any display projection", () => {
    const projection = SessionBusinessRecord.project(
      {
        receipt: {
          origin: "system",
          rootID: "root-5",
          sessionID: "session-5",
          routeID: "runner-artifact",
          operationID: "op-5",
          operation: "record-artifact",
          classification: "artifact",
          outcome: "applied",
          resources: [{ id: "pulse", resource: "artifact:pulse.jld2", outcome: "applied", evidence: "artifact_link" }],
        },
        resource: { id: "pulse", resource: "artifact:pulse.jld2", outcome: "applied", evidence: "artifact_link" },
        sequence: 1,
        timeCreated: 1,
        artifactRef: "receipt-5",
        internal: { canonicalPath: "/private/runs/pulse.jld2", rawHash: "raw-hash-private", baseline: "baseline-private" },
      },
      "files_changed",
    )

    // Display-safe facts survive; the artifact link survives as a display-safe reference.
    expect(projection).toMatchObject({
      operation: { origin: "system" },
      receipt: { resource: "artifact:pulse.jld2", operation: "record-artifact", outcome: "applied" },
      evidence: { receiptID: "receipt-5" },
    })
    // Protected internal values never reach the projection.
    const serialized = JSON.stringify(projection)
    expect(serialized).not.toContain("/private/runs/pulse.jld2")
    expect(serialized).not.toContain("raw-hash-private")
    expect(serialized).not.toContain("baseline-private")
    expect(projection).not.toHaveProperty("context")

    // The small egress summary is redacted, not exposed.
    expect(
      SessionBusinessRecord.project(
        {
          receipt: {
            origin: "system",
            rootID: "root-5",
            sessionID: "session-5",
            routeID: "runner-artifact",
            operationID: "op-5",
            operation: "record-artifact",
            classification: "artifact",
            outcome: "applied",
            resources: [
              { id: "pulse", resource: "artifact:pulse.jld2", outcome: "applied", evidence: "artifact_link" },
            ],
          },
          resource: { id: "pulse", resource: "artifact:pulse.jld2", outcome: "applied", evidence: "artifact_link" },
          sequence: 1,
          timeCreated: 1,
          artifactRef: "receipt-5",
          internal: { canonicalPath: "/private/runs/pulse.jld2" },
        },
        "share",
      ),
    ).toEqual({
      operation: { origin: "[redacted:operation.origin]" },
      receipt: { resource: "[redacted:receipt.resource]" },
    })
  })

  test("deleting a root removes plugin and runner evidence together and leaves other roots intact", () => {
    const rootID = `bizrec-test-${crypto.randomUUID()}`
    const otherRoot = `bizrec-test-${crypto.randomUUID()}`
    try {
      SessionEvidence.write(rootID, "op-plugin", [{ receiptID: "plugin-receipt", content: "problem-card" }], 1024)
      SessionEvidence.write(rootID, "op-runner", [{ receiptID: "runner-receipt", content: "run.toml" }], 1024)
      SessionEvidence.write(otherRoot, "op-other", [{ receiptID: "other-receipt", content: "keep" }], 1024)
      expect(SessionEvidence.has(rootID, "op-plugin", "plugin-receipt")).toBe(true)
      expect(SessionEvidence.has(rootID, "op-runner", "runner-receipt")).toBe(true)

      SessionBusinessRecord.removeRootEvidence(rootID)

      expect(SessionEvidence.exists(rootID, "op-plugin")).toBe(false)
      expect(SessionEvidence.exists(rootID, "op-runner")).toBe(false)
      expect(SessionEvidence.has(otherRoot, "op-other", "other-receipt")).toBe(true)
    } finally {
      SessionEvidence.removeRoot(rootID)
      SessionEvidence.removeRoot(otherRoot)
    }
  })
})
