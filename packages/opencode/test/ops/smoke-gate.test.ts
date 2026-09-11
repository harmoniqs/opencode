// The smoke gate (amicode#295 AC3 + AC4): a hub swap without a passing
// DB-snapshot boot smoke (ops/hub-upgrade-smoke.sh) is refused, and the
// refusal NAMES the missing gate. A swap with a passing smoke record proceeds
// through the rename-only path — no process stop, so the running hub is
// never left down (rename(2) over a running executable is atomic).
//
// These tests run the REAL gate script against real files and real processes
// in a temp dir — the same artifact the ops surface consumes.
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"

const GATE = path.resolve(import.meta.dir, "../../script/hub-smoke-gate.sh")

async function sha256File(file: string) {
  const bytes = new Uint8Array(await Bun.file(file).arrayBuffer())
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

async function writeBinary(dir: string, name: string, body: string) {
  const file = path.join(dir, name)
  await fs.writeFile(file, body, { mode: 0o755 })
  return file
}

function writeSmokeRecord(staged: string, record: { outcome: string; sha256?: string }) {
  return sha256File(staged).then((actual) =>
    fs.writeFile(
      `${staged}.smoke.json`,
      JSON.stringify({
        outcome: record.outcome,
        sha256: record.sha256 ?? actual,
        harness: "hub-upgrade-smoke.sh",
        recorded_at: new Date().toISOString(),
      }),
    ),
  )
}

function gate(mode: "check" | "swap", staged: string, live?: string) {
  const args = live ? [GATE, mode, staged, live] : [GATE, mode, staged]
  const proc = Bun.spawn(["bash", ...args], { stdout: "pipe", stderr: "pipe" })
  return Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).then(
    ([stdout, stderr, code]) => ({ stdout, stderr, code }),
  )
}

const LIVE_BODY = "#!/bin/sh\necho live\n"
const CANDIDATE_BODY = "#!/bin/sh\necho candidate\n"

describe("hub smoke gate", () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join("/tmp", "smoke-gate-"))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  describe("refusal path (AC3)", () => {
    test("a swap with no smoke record is refused and names the missing gate", async () => {
      const staged = await writeBinary(dir, "staged.bin", CANDIDATE_BODY)
      const live = await writeBinary(dir, "live.bin", LIVE_BODY)

      const result = await gate("swap", staged, live)

      expect(result.code).toBe(1)
      expect(result.stderr).toContain("hub-upgrade-smoke")
      // nothing moved
      expect(await Bun.file(live).text()).toBe(LIVE_BODY)
      expect(await Bun.file(staged).text()).toBe(CANDIDATE_BODY)
    })

    test("a smoke record that did not pass is refused and names the missing gate", async () => {
      const staged = await writeBinary(dir, "staged.bin", CANDIDATE_BODY)
      const live = await writeBinary(dir, "live.bin", LIVE_BODY)
      await writeSmokeRecord(staged, { outcome: "fail" })

      const result = await gate("swap", staged, live)

      expect(result.code).toBe(1)
      expect(result.stderr).toContain("hub-upgrade-smoke")
      expect(result.stderr).toContain("fail")
      expect(await Bun.file(live).text()).toBe(LIVE_BODY)
    })

    test("a smoke record for a different binary (sha mismatch) is refused and names the missing gate", async () => {
      const staged = await writeBinary(dir, "staged.bin", CANDIDATE_BODY)
      const live = await writeBinary(dir, "live.bin", LIVE_BODY)
      await writeSmokeRecord(staged, { outcome: "pass", sha256: "deadbeef".repeat(8) })

      const result = await gate("swap", staged, live)

      expect(result.code).toBe(1)
      expect(result.stderr).toContain("hub-upgrade-smoke")
      expect(result.stderr).toContain("sha")
      expect(await Bun.file(live).text()).toBe(LIVE_BODY)
    })

    test("check mode refuses without a passing record, same contract", async () => {
      const staged = await writeBinary(dir, "staged.bin", CANDIDATE_BODY)

      const result = await gate("check", staged)

      expect(result.code).toBe(1)
      expect(result.stderr).toContain("hub-upgrade-smoke")
    })
  })

  describe("proceed path (AC4)", () => {
    test("a swap with a passing smoke record proceeds through the rename-only path", async () => {
      const staged = await writeBinary(dir, "staged.bin", CANDIDATE_BODY)
      const live = await writeBinary(dir, "live.bin", LIVE_BODY)
      await writeSmokeRecord(staged, { outcome: "pass" })

      const result = await gate("swap", staged, live)

      expect(result.code).toBe(0)
      // staged was renamed over live, byte-identical
      expect(await Bun.file(live).text()).toBe(CANDIDATE_BODY)
      // the staged path is gone (renamed, not copied)
      expect(await Bun.file(staged).exists()).toBe(false)
      // the sha sidecar records the now-live binary's sha
      const sidecar = await Bun.file(`${live}.sha256`).text()
      expect(sidecar.trim()).toBe(await sha256File(live))
    })

    test("the rename-only swap never leaves a running hub down", async () => {
      const staged = await writeBinary(dir, "staged.bin", "#!/bin/sh\necho candidate\n")
      const live = await writeBinary(dir, "live.bin", "#!/bin/sh\nwhile true; do sleep 1; done\n")
      await writeSmokeRecord(staged, { outcome: "pass" })

      // A "hub": a long-lived process executing the live binary path.
      const proc = Bun.spawn([live], { stdout: "ignore", stderr: "ignore" })
      try {
        await Bun.sleep(200)
        expect(proc.exitCode).toBeNull()

        const result = await gate("swap", staged, live)
        expect(result.code).toBe(0)

        // rename(2) over a running executable is atomic — the process kept the
        // old inode and is STILL RUNNING after the swap; the hub never went down.
        await Bun.sleep(200)
        expect(proc.exitCode).toBeNull()
        expect(proc.signalCode).toBeNull()
      } finally {
        proc.kill()
      }
    })

    test("check mode passes for a staged binary with a matching passing record", async () => {
      const staged = await writeBinary(dir, "staged.bin", CANDIDATE_BODY)
      await writeSmokeRecord(staged, { outcome: "pass" })

      const result = await gate("check", staged)

      expect(result.code).toBe(0)
      expect(result.stdout).toContain("pass")
    })
  })
})
