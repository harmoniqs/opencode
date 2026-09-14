import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260913221452_session-receipt-budget-reservation",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_session_receipt_operation\` (
          \`id\` text PRIMARY KEY,
          \`root_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`origin\` text NOT NULL,
          \`reserved_receipts\` integer DEFAULT 0 NOT NULL,
          \`reserved_metadata_bytes\` integer DEFAULT 0 NOT NULL,
          \`state\` text NOT NULL,
          CONSTRAINT \`fk_session_receipt_operation_root_id_session_id_fk\` FOREIGN KEY (\`root_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_session_receipt_operation\`(\`id\`, \`root_id\`, \`session_id\`, \`origin\`, \`reserved_receipts\`, \`reserved_metadata_bytes\`, \`state\`) SELECT \`id\`, \`root_id\`, \`session_id\`, \`origin\`, \`reserved_receipts\`, \`reserved_metadata_bytes\`, \`state\` FROM \`session_receipt_operation\`;`,
      )
      yield* tx.run(`DROP TABLE \`session_receipt_operation\`;`)
      yield* tx.run(`ALTER TABLE \`__new_session_receipt_operation\` RENAME TO \`session_receipt_operation\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(
        `CREATE INDEX \`session_receipt_operation_root_idx\` ON \`session_receipt_operation\` (\`root_id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
