import { Database } from "@opencode-ai/core/database/database"
import {
  SessionLineageTable,
  SessionReceiptAssessmentTable,
  SessionReceiptOperationTable,
  SessionReceiptTable,
} from "@opencode-ai/core/session/sql"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { SessionID } from "./schema"

export namespace SessionReceipt {
  export type Fact = {
    id: string
    resource: string
    operation: string
    outcome: string
    timeCreated: number
  }

  export type Assessment = {
    id: string
    receiptID: string
    confidence: string
    netState: string
    evidenceState: string
    revision: number
    expiresAt?: number
    timeCreated: number
  }

  export function publish(
    database: Database.Interface,
    input: { id: string; sessionID: SessionID; origin: string; receipts: ReadonlyArray<Fact> },
  ) {
    return database.db.transaction(
      (tx) =>
        Effect.gen(function* () {
          const lineage = yield* tx
            .select({ rootID: SessionLineageTable.root_id })
            .from(SessionLineageTable)
            .where(eq(SessionLineageTable.session_id, input.sessionID))
            .get()
          if (!lineage) return yield* Effect.fail(new Error(`Missing lineage root for ${input.sessionID}`))

          const latest = yield* tx
            .select({ sequence: SessionReceiptTable.creation_seq })
            .from(SessionReceiptTable)
            .where(eq(SessionReceiptTable.root_id, lineage.rootID))
            .orderBy(desc(SessionReceiptTable.creation_seq))
            .get()
          yield* tx
            .insert(SessionReceiptOperationTable)
            .values({
              id: input.id,
              root_id: lineage.rootID,
              session_id: input.sessionID,
              origin: input.origin,
              state: "prepared",
            })
            .run()
          yield* tx
            .update(SessionReceiptOperationTable)
            .set({ state: "evidence_ready" })
            .where(eq(SessionReceiptOperationTable.id, input.id))
            .run()
          if (input.receipts.length > 0)
            yield* tx
              .insert(SessionReceiptTable)
              .values(
                input.receipts.map((receipt, index) => ({
                  id: receipt.id,
                  operation_id: input.id,
                  root_id: lineage.rootID,
                  creation_seq: (latest?.sequence ?? 0) + index + 1,
                  resource: receipt.resource,
                  operation: receipt.operation,
                  outcome: receipt.outcome,
                  time_created: receipt.timeCreated,
                })),
              )
              .run()
          yield* tx
            .update(SessionReceiptOperationTable)
            .set({ state: "committed" })
            .where(eq(SessionReceiptOperationTable.id, input.id))
            .run()
        }),
      { behavior: "immediate" },
    )
  }

  export function appendAssessment(database: Database.Interface, input: Assessment) {
    return database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const receipt = yield* tx
              .select({ rootID: SessionReceiptTable.root_id })
              .from(SessionReceiptTable)
              .where(eq(SessionReceiptTable.id, input.receiptID))
              .get()
            if (!receipt) return yield* Effect.fail(new Error(`Missing receipt ${input.receiptID}`))
            yield* tx
              .insert(SessionReceiptAssessmentTable)
              .values({
                id: input.id,
                receipt_id: input.receiptID,
                root_id: receipt.rootID,
                confidence: input.confidence,
                net_state: input.netState,
                evidence_state: input.evidenceState,
                revision: input.revision,
                expires_at: input.expiresAt,
                time_created: input.timeCreated,
              })
              .run()
          }),
        { behavior: "immediate" },
      )
  }

  export function assessments(database: Database.Interface, receiptID: string) {
    return database.db
      .select()
      .from(SessionReceiptAssessmentTable)
      .where(eq(SessionReceiptAssessmentTable.receipt_id, receiptID))
      .orderBy(asc(SessionReceiptAssessmentTable.revision))
      .all()
      .pipe(
        Effect.map((assessments) =>
          assessments.map((assessment) => ({
            id: assessment.id,
            receiptID: assessment.receipt_id,
            confidence: assessment.confidence,
            netState: assessment.net_state,
            evidenceState: assessment.evidence_state,
            revision: assessment.revision,
            ...(assessment.expires_at === null ? {} : { expiresAt: assessment.expires_at }),
            timeCreated: assessment.time_created,
          })),
        ),
      )
  }

  export function committed(database: Database.Interface, sessionID: SessionID) {
    return Effect.gen(function* () {
      const lineage = yield* database.db
        .select({ rootID: SessionLineageTable.root_id })
        .from(SessionLineageTable)
        .where(eq(SessionLineageTable.session_id, sessionID))
        .get()
      if (!lineage) return []
      const operations = yield* database.db
        .select()
        .from(SessionReceiptOperationTable)
        .where(and(eq(SessionReceiptOperationTable.root_id, lineage.rootID), eq(SessionReceiptOperationTable.state, "committed")))
        .all()
      const receipts = operations.length
        ? yield* database.db
            .select()
            .from(SessionReceiptTable)
            .where(inArray(SessionReceiptTable.operation_id, operations.map((operation) => operation.id)))
            .orderBy(asc(SessionReceiptTable.creation_seq))
            .all()
        : []
      return operations.map((operation) => ({
        id: operation.id,
        rootID: operation.root_id,
        sessionID: operation.session_id,
        origin: operation.origin,
        state: operation.state,
        receipts: receipts
          .filter((receipt) => receipt.operation_id === operation.id)
          .map((receipt) => ({
            id: receipt.id,
            sequence: receipt.creation_seq,
            resource: receipt.resource,
            operation: receipt.operation,
            outcome: receipt.outcome,
            timeCreated: receipt.time_created,
          })),
      }))
    })
  }
}
