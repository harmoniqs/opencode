import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260913212936_session-receipt-storage",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_receipt_assessment\` (
          \`id\` text PRIMARY KEY,
          \`receipt_id\` text NOT NULL,
          \`root_id\` text NOT NULL,
          \`confidence\` text NOT NULL,
          \`net_state\` text NOT NULL,
          \`evidence_state\` text NOT NULL,
          \`revision\` integer NOT NULL,
          \`expires_at\` integer,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_receipt_assessment_receipt_id_session_receipt_id_fk\` FOREIGN KEY (\`receipt_id\`) REFERENCES \`session_receipt\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_session_receipt_assessment_root_id_session_id_fk\` FOREIGN KEY (\`root_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_receipt_operation\` (
          \`id\` text PRIMARY KEY,
          \`root_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`origin\` text NOT NULL,
          \`state\` text NOT NULL,
          CONSTRAINT \`fk_session_receipt_operation_root_id_session_id_fk\` FOREIGN KEY (\`root_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_receipt\` (
          \`id\` text PRIMARY KEY,
          \`operation_id\` text NOT NULL,
          \`root_id\` text NOT NULL,
          \`creation_seq\` integer NOT NULL,
          \`resource\` text NOT NULL,
          \`operation\` text NOT NULL,
          \`outcome\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_receipt_operation_id_session_receipt_operation_id_fk\` FOREIGN KEY (\`operation_id\`) REFERENCES \`session_receipt_operation\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_session_receipt_root_id_session_id_fk\` FOREIGN KEY (\`root_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_receipt_assessment_receipt_revision_idx\` ON \`session_receipt_assessment\` (\`receipt_id\`,\`revision\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_receipt_assessment_root_idx\` ON \`session_receipt_assessment\` (\`root_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_receipt_operation_root_idx\` ON \`session_receipt_operation\` (\`root_id\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_receipt_root_creation_seq_idx\` ON \`session_receipt\` (\`root_id\`,\`creation_seq\`);`,
      )
      yield* tx.run(`CREATE INDEX \`session_receipt_operation_idx\` ON \`session_receipt\` (\`operation_id\`);`)
      yield* tx.run(`
        CREATE TRIGGER \`session_receipt_immutable\`
        BEFORE UPDATE ON \`session_receipt\`
        BEGIN
          SELECT RAISE(ABORT, 'session receipt facts are immutable');
        END;
      `)
      yield* tx.run(`
        CREATE TRIGGER \`session_receipt_assessment_append_only\`
        BEFORE UPDATE ON \`session_receipt_assessment\`
        BEGIN
          SELECT RAISE(ABORT, 'session receipt assessments are append-only');
        END;
      `)
      yield* tx.run(`
        CREATE TRIGGER \`session_receipt_operation_state\`
        BEFORE UPDATE OF \`state\` ON \`session_receipt_operation\`
        WHEN NOT (
          (OLD.\`state\` = 'prepared' AND NEW.\`state\` = 'evidence_ready')
          OR (OLD.\`state\` = 'evidence_ready' AND NEW.\`state\` = 'committed')
        )
        BEGIN
          SELECT RAISE(ABORT, 'invalid session receipt operation state transition');
        END;
      `)
    })
  },
} satisfies DatabaseMigration.Migration
