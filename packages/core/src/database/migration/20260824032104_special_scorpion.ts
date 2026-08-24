import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260824032104_special_scorpion",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`directories\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
