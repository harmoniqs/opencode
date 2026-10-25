// Subprocess tests for the boot build-parity record (amicode#295 AC1): every
// boot — hub and client — records exactly one of parity-ok | parity-drift |
// channel-unreachable in its log. These spawn the REAL CLI, so the record is
// asserted where it actually lands: the opencode.log file under the isolated
// XDG data dir. The subprocess runs channel "local" (no release channel), so
// the honest boot outcome is channel-unreachable — and it must never read
// parity-ok.
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { cliIt, testModelID } from "../lib/cli-process"

const OUTCOMES = ["parity-ok", "parity-drift", "channel-unreachable"] as const

function parityRecords(log: string) {
  return log
    .split("\n")
    .filter((line) => line.includes("build parity"))
    .map((line) => ({
      line,
      outcome: OUTCOMES.find((outcome) => line.includes(`outcome=${outcome}`)),
    }))
}

function readBootLog(home: string) {
  return Effect.promise(() => Bun.file(`${home}/.local/share/opencode/log/opencode.log`).text())
}

// The file logger batches writes, so a long-lived hub may not have flushed
// the boot record when serve() returns — poll until it lands.
function waitForParityRecord(home: string) {
  return Effect.gen(function* () {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const log = yield* readBootLog(home)
      const records = parityRecords(log)
      if (records.length > 0) return records
      yield* Effect.sleep("250 millis")
    }
    return []
  })
}

describe("boot build parity (subprocess)", () => {
  cliIt.live(
    "the hub boot records exactly one parity outcome in its log",
    ({ opencode, home }) =>
      Effect.gen(function* () {
        yield* opencode.serve()
        const records = yield* waitForParityRecord(home)
        expect(records).toHaveLength(1)
        // channel "local" in the subprocess — no release channel to assert
        // against, so the honest outcome is channel-unreachable, never parity-ok.
        expect(records[0]?.outcome).toBe("channel-unreachable")
      }),
    60_000,
  )

  cliIt.live(
    "the client boot records exactly one parity outcome in its log",
    ({ opencode, home }) =>
      Effect.gen(function* () {
        yield* opencode.run("hello", { model: testModelID })
        const records = yield* waitForParityRecord(home)
        expect(records).toHaveLength(1)
        expect(records[0]?.outcome).toBe("channel-unreachable")
      }),
    60_000,
  )
})
