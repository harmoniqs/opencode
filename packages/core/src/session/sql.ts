import { sqliteTable, text, integer, index, primaryKey, real, uniqueIndex } from "drizzle-orm/sqlite-core"
import * as DatabasePath from "../database/path"
import { ProjectTable } from "../project/sql"
import type { SessionMessage } from "./message"
import type { Prompt } from "./prompt"
import type { SessionInput } from "./input"
import type { Snapshot } from "../snapshot"
import { PermissionV1 } from "../v1/permission"
import { ProjectV2 } from "../project"
import type { SessionSchema } from "./schema"
import type { MessageID, PartID, SessionV1 } from "../v1/session"
import { WorkspaceV2 } from "../workspace"
import { Timestamps } from "../database/schema.sql"
import type { SystemContext } from "../system-context/index"
import { AgentV2 } from "../agent"
import type { Revert } from "@opencode-ai/schema/revert"

type SessionMessageData = Omit<(typeof SessionMessage.Message)["Encoded"], "type" | "id">
type V1MessageData = Omit<SessionV1.Info, "id" | "sessionID">
type V1PartData = Omit<SessionV1.Part, "id" | "sessionID" | "messageID">

export const SessionTable = sqliteTable(
  "session",
  {
    id: text().$type<SessionSchema.ID>().primaryKey(),
    project_id: text()
      .$type<ProjectV2.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    workspace_id: text().$type<WorkspaceV2.ID>(),
    parent_id: text().$type<SessionSchema.ID>(),
    slug: text().notNull(),
    directory: DatabasePath.directoryColumn().notNull(),
    directories: text({ mode: "json" }).$type<string[]>(),
    path: DatabasePath.pathColumn(),
    title: text().notNull(),
    version: text().notNull(),
    share_url: text(),
    summary_additions: integer(),
    summary_deletions: integer(),
    summary_files: integer(),
    summary_diffs: text({ mode: "json" }).$type<Snapshot.LegacyFileDiff[]>(),
    metadata: text({ mode: "json" }).$type<Record<string, unknown>>(),
    cost: real().notNull().default(0),
    tokens_input: integer().notNull().default(0),
    tokens_output: integer().notNull().default(0),
    tokens_reasoning: integer().notNull().default(0),
    tokens_cache_read: integer().notNull().default(0),
    tokens_cache_write: integer().notNull().default(0),
    revert: text({ mode: "json" }).$type<Revert.State>(),
    permission: text({ mode: "json" }).$type<PermissionV1.Ruleset>(),
    agent: text(),
    model: text({ mode: "json" }).$type<{
      id: string
      providerID: string
      variant?: string
    }>(),
    ...Timestamps,
    time_compacting: integer(),
    time_archived: integer(),
  },
  (table) => [
    index("session_project_idx").on(table.project_id),
    index("session_workspace_idx").on(table.workspace_id),
    index("session_parent_idx").on(table.parent_id),
  ],
)

/**
 * Durable Files Changed lineage. A missing row is deliberately meaningful: it
 * denotes a pre-rollout (legacy) session, never an inferred relationship.
 */
export const SessionLineageTable = sqliteTable(
  "session_lineage",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .primaryKey()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    root_id: text().$type<SessionSchema.ID>().notNull(),
    mode: text().$type<"legacy" | "partial" | "full">().notNull(),
    parent_id: text().$type<SessionSchema.ID>(),
    edge_kind: text().$type<"task_spawn" | "session_spawn">(),
    legacy_parent_id: text().$type<SessionSchema.ID>(),
    epoch_started_at: integer(),
  },
  (table) => [
    index("session_lineage_root_idx").on(table.root_id),
    index("session_lineage_parent_idx").on(table.parent_id),
  ],
)

/**
 * The root-owned, deletion-safe minimum required to render historical Files
 * Changed receipts. It intentionally excludes child context and evidence.
 */
export const SessionLineageOriginTable = sqliteTable(
  "session_lineage_origin",
  {
    root_id: text().$type<SessionSchema.ID>().notNull(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    title: text().notNull(),
    edge_kind: text().$type<"task_spawn" | "session_spawn">().notNull(),
    deleted_at: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.root_id, table.session_id] }),
    index("session_lineage_origin_root_idx").on(table.root_id),
  ],
)

/** Immutable root-owned facts for Files Changed operation publication. */
export const SessionReceiptOperationTable = sqliteTable(
  "session_receipt_operation",
  {
    id: text().primaryKey(),
    root_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    origin: text().notNull(),
    reserved_receipts: integer().notNull().default(0),
    reserved_metadata_bytes: integer().notNull().default(0),
    state: text().$type<"prepared" | "evidence_ready" | "committed">().notNull(),
  },
  (table) => [index("session_receipt_operation_root_idx").on(table.root_id)],
)

/** Immutable resource facts. Creation sequence is scoped to the lineage root. */
export const SessionReceiptTable = sqliteTable(
  "session_receipt",
  {
    id: text().primaryKey(),
    operation_id: text()
      .notNull()
      .references(() => SessionReceiptOperationTable.id, { onDelete: "cascade" }),
    root_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    creation_seq: integer().notNull(),
    resource: text().notNull(),
    operation: text().notNull(),
    outcome: text().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    uniqueIndex("session_receipt_root_creation_seq_idx").on(table.root_id, table.creation_seq),
    index("session_receipt_operation_idx").on(table.operation_id),
  ],
)

/** Append-only observations deliberately separate from immutable receipt facts. */
export const SessionReceiptAssessmentTable = sqliteTable(
  "session_receipt_assessment",
  {
    id: text().primaryKey(),
    receipt_id: text()
      .notNull()
      .references(() => SessionReceiptTable.id, { onDelete: "cascade" }),
    root_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    confidence: text().notNull(),
    net_state: text().notNull(),
    evidence_state: text().notNull(),
    revision: integer().notNull(),
    expires_at: integer(),
    time_created: integer().notNull(),
  },
  (table) => [
    uniqueIndex("session_receipt_assessment_receipt_revision_idx").on(table.receipt_id, table.revision),
    index("session_receipt_assessment_root_idx").on(table.root_id),
  ],
)

export const MessageTable = sqliteTable(
  "message",
  {
    id: text().$type<MessageID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    ...Timestamps,
    data: text({ mode: "json" }).notNull().$type<V1MessageData>(),
  },
  (table) => [index("message_session_time_created_id_idx").on(table.session_id, table.time_created, table.id)],
)

export const PartTable = sqliteTable(
  "part",
  {
    id: text().$type<PartID>().primaryKey(),
    message_id: text()
      .$type<MessageID>()
      .notNull()
      .references(() => MessageTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    ...Timestamps,
    data: text({ mode: "json" }).notNull().$type<V1PartData>(),
  },
  (table) => [
    index("part_message_id_id_idx").on(table.message_id, table.id),
    index("part_session_idx").on(table.session_id),
  ],
)

export const TodoTable = sqliteTable(
  "todo",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    content: text().notNull(),
    status: text().notNull(),
    priority: text().notNull(),
    position: integer().notNull(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.position] }),
    index("todo_session_idx").on(table.session_id),
  ],
)

export const SessionMessageTable = sqliteTable(
  "session_message",
  {
    id: text().$type<SessionMessage.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().$type<SessionMessage.Type>().notNull(),
    seq: integer().notNull(),
    ...Timestamps,
    data: text({ mode: "json" }).notNull().$type<SessionMessageData>(),
  },
  (table) => [
    uniqueIndex("session_message_session_seq_idx").on(table.session_id, table.seq),
    index("session_message_session_type_seq_idx").on(table.session_id, table.type, table.seq),
    index("session_message_session_time_created_id_idx").on(table.session_id, table.time_created, table.id),
    index("session_message_time_created_idx").on(table.time_created),
  ],
)

export const SessionInputTable = sqliteTable(
  "session_input",
  {
    id: text().$type<SessionMessage.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    prompt: text({ mode: "json" }).notNull().$type<Prompt>(),
    delivery: text().$type<SessionInput.Delivery>().notNull(),
    admitted_seq: integer().notNull(),
    promoted_seq: integer(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("session_input_session_pending_delivery_seq_idx").on(
      table.session_id,
      table.promoted_seq,
      table.delivery,
      table.admitted_seq,
    ),
    uniqueIndex("session_input_session_admitted_seq_idx").on(table.session_id, table.admitted_seq),
    uniqueIndex("session_input_session_promoted_seq_idx").on(table.session_id, table.promoted_seq),
  ],
)

export const SessionContextEpochTable = sqliteTable("session_context_epoch", {
  session_id: text()
    .$type<SessionSchema.ID>()
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  baseline: text().notNull(),
  snapshot: text({ mode: "json" }).notNull().$type<SystemContext.Snapshot>(),
  baseline_seq: integer().notNull(),
})
