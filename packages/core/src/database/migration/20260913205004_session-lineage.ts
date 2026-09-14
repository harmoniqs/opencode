import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260913205004_session-lineage",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_lineage_origin\` (
          \`root_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`title\` text NOT NULL,
          \`edge_kind\` text NOT NULL,
          \`deleted_at\` integer NOT NULL,
          CONSTRAINT \`session_lineage_origin_pk\` PRIMARY KEY(\`root_id\`, \`session_id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_lineage\` (
          \`session_id\` text PRIMARY KEY,
          \`root_id\` text NOT NULL,
          \`mode\` text NOT NULL,
          \`parent_id\` text,
          \`edge_kind\` text,
          \`legacy_parent_id\` text,
          \`epoch_started_at\` integer,
          CONSTRAINT \`fk_session_lineage_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`session_lineage_origin_root_idx\` ON \`session_lineage_origin\` (\`root_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_lineage_root_idx\` ON \`session_lineage\` (\`root_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_lineage_parent_idx\` ON \`session_lineage\` (\`parent_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
