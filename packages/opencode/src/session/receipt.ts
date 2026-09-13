import { Database } from "@opencode-ai/core/database/database"
import {
  SessionLineageTable,
  SessionReceiptAssessmentTable,
  SessionReceiptOperationTable,
  SessionReceiptTable,
} from "@opencode-ai/core/session/sql"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { SessionEvidence } from "./evidence"
import { SessionID } from "./schema"

export namespace SessionReceipt {
  export type Budget = {
    maxReceipts: number
    maxMetadataBytes: number
    maxEvidenceBytes?: number
    retentionMs?: number
  }

  export type Evidence = SessionEvidence.Entry

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

  type ReservationInput = {
    id: string
    sessionID: SessionID
    origin: string
    receipts: ReadonlyArray<Fact>
    budget: Budget
    evidence?: ReadonlyArray<Evidence>
  }

  export function reserve(database: Database.Interface, input: ReservationInput) {
    return database.db.transaction(
      (tx) =>
        Effect.gen(function* () {
          const lineage = yield* tx
            .select({ rootID: SessionLineageTable.root_id })
            .from(SessionLineageTable)
            .where(eq(SessionLineageTable.session_id, input.sessionID))
            .get()
          if (!lineage) return yield* Effect.fail(new Error(`Missing lineage root for ${input.sessionID}`))

          const receiptCount = input.receipts.length
          const metadataBytes = metadataSize(input.receipts)
          if (receiptCount > input.budget.maxReceipts || metadataBytes > input.budget.maxMetadataBytes)
            return yield* Effect.fail(new Error(`Receipt budget exceeded for ${lineage.rootID}`))

          const reservations = yield* tx
            .select({
              receipts: SessionReceiptOperationTable.reserved_receipts,
              metadataBytes: SessionReceiptOperationTable.reserved_metadata_bytes,
            })
            .from(SessionReceiptOperationTable)
            .where(eq(SessionReceiptOperationTable.root_id, lineage.rootID))
            .all()
          const reservedReceipts = reservations.reduce(
            (total, reservation) => total + reservation.receipts,
            receiptCount,
          )
          const reservedMetadataBytes = reservations.reduce(
            (total, reservation) => total + reservation.metadataBytes,
            metadataBytes,
          )
          if (reservedReceipts > input.budget.maxReceipts || reservedMetadataBytes > input.budget.maxMetadataBytes)
            return yield* Effect.fail(new Error(`Receipt budget exhausted for ${lineage.rootID}`))

          yield* tx
            .insert(SessionReceiptOperationTable)
            .values({
              id: input.id,
              root_id: lineage.rootID,
              session_id: input.sessionID,
              origin: input.origin,
              reserved_receipts: receiptCount,
              reserved_metadata_bytes: metadataBytes,
              state: "prepared",
            })
            .run()
        }),
      { behavior: "immediate" },
    )
  }

  export function abort(database: Database.Interface, id: string) {
    return database.db.transaction(
      (tx) =>
        Effect.gen(function* () {
          yield* tx
            .delete(SessionReceiptOperationTable)
            .where(and(eq(SessionReceiptOperationTable.id, id), eq(SessionReceiptOperationTable.state, "prepared")))
            .run()
        }),
      { behavior: "immediate" },
    )
  }

  export function commit(database: Database.Interface, input: { id: string; receipts: ReadonlyArray<Fact> }) {
    return database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const reservation = yield* tx
              .select()
              .from(SessionReceiptOperationTable)
              .where(eq(SessionReceiptOperationTable.id, input.id))
              .get()
            if (!reservation || reservation.state !== "prepared")
              return yield* Effect.fail(new Error(`No prepared receipt reservation ${input.id}`))
            if (
              reservation.reserved_receipts !== input.receipts.length ||
              reservation.reserved_metadata_bytes !== metadataSize(input.receipts)
            )
              return yield* Effect.fail(new Error(`Receipt reservation mismatch for ${input.id}`))

            const latest = yield* tx
              .select({ sequence: SessionReceiptTable.creation_seq })
              .from(SessionReceiptTable)
              .where(eq(SessionReceiptTable.root_id, reservation.root_id))
              .orderBy(desc(SessionReceiptTable.creation_seq))
              .get()
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
                    root_id: reservation.root_id,
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
      .pipe(Effect.tapError(() => abort(database, input.id)))
  }

  export function publish(database: Database.Interface, input: ReservationInput) {
    return Effect.gen(function* () {
      yield* reserve(database, input)
      const lineage = yield* root(database, input.sessionID)
      if (input.evidence?.length)
        yield* Effect.try({
          try: () => SessionEvidence.write(lineage, input.id, input.evidence!, input.budget.maxEvidenceBytes ?? 0),
          catch: (cause) => new Error(`Failed to publish receipt evidence for ${input.id}`, { cause }),
        })
      yield* commit(database, input)
    })
  }

  /** Removes evidence that cannot belong to a committed receipt operation. Safe to repeat after interruption. */
  export function cleanupEvidence(database: Database.Interface, rootID: SessionID) {
    return Effect.gen(function* () {
      const operations = yield* database.db
        .select({ id: SessionReceiptOperationTable.id })
        .from(SessionReceiptOperationTable)
        .where(
          and(eq(SessionReceiptOperationTable.root_id, rootID), eq(SessionReceiptOperationTable.state, "committed")),
        )
        .all()
      yield* Effect.sync(() => SessionEvidence.sweep(rootID, new Set(operations.map((operation) => operation.id))))
    })
  }

  /** Expire root-owned evidence after its terminal retention window without changing immutable receipt facts. */
  export function expireEvidence(
    database: Database.Interface,
    input: { rootID: SessionID; now: number; retentionMs: number },
  ) {
    return Effect.gen(function* () {
      const latest = yield* database.db
        .select({ timeCreated: SessionReceiptTable.time_created })
        .from(SessionReceiptTable)
        .where(eq(SessionReceiptTable.root_id, input.rootID))
        .orderBy(desc(SessionReceiptTable.time_created))
        .get()
      if (latest && latest.timeCreated + input.retentionMs <= input.now)
        yield* Effect.sync(() => SessionEvidence.removeRoot(input.rootID))
    })
  }

  /** Deleting a lineage root owns deletion of all of its host-local evidence. */
  export function removeRootEvidence(database: Database.Interface, sessionID: SessionID) {
    return Effect.gen(function* () {
      const lineage = yield* database.db
        .select({ rootID: SessionLineageTable.root_id })
        .from(SessionLineageTable)
        .where(eq(SessionLineageTable.session_id, sessionID))
        .get()
      if (lineage?.rootID === sessionID) yield* Effect.sync(() => SessionEvidence.removeRoot(sessionID))
    })
  }

  export function appendAssessment(database: Database.Interface, input: Assessment) {
    return database.db.transaction(
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
        .where(
          and(
            eq(SessionReceiptOperationTable.root_id, lineage.rootID),
            eq(SessionReceiptOperationTable.state, "committed"),
          ),
        )
        .all()
      const receipts = operations.length
        ? yield* database.db
            .select()
            .from(SessionReceiptTable)
            .where(
              inArray(
                SessionReceiptTable.operation_id,
                operations.map((operation) => operation.id),
              ),
            )
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

function root(database: Database.Interface, sessionID: SessionID) {
  return database.db
    .select({ rootID: SessionLineageTable.root_id })
    .from(SessionLineageTable)
    .where(eq(SessionLineageTable.session_id, sessionID))
    .get()
    .pipe(
      Effect.flatMap((lineage) =>
        lineage ? Effect.succeed(lineage.rootID) : Effect.fail(new Error(`Missing lineage root for ${sessionID}`)),
      ),
    )
}

function metadataSize(receipts: ReadonlyArray<SessionReceipt.Fact>) {
  return new TextEncoder().encode(JSON.stringify(receipts)).byteLength
}
