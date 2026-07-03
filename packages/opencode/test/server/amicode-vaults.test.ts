import { describe, expect, test } from "bun:test"
import { candidates, synthesize } from "@/server/amicode/vaults"

describe("synthesize", () => {
  test("emits the plural failure shape the UI parser expects", () => {
    const parsed = JSON.parse(synthesize("cli_not_found", "amico-vault not found"))
    expect(parsed).toEqual({ ok: false, mounts: [], error: "cli_not_found: amico-vault not found" })
  })
})

describe("candidates", () => {
  const home = "/home/u"
  test("resolution order: AMICO_VAULT_BIN, then AMICO_OPS, then the canonical ops path", () => {
    expect(candidates({ AMICO_VAULT_BIN: "/x/bin/av", AMICO_OPS: "/y/ops" }, home)).toEqual([
      "/x/bin/av",
      "/y/ops/scripts/amico-vault",
      "/home/u/.amico/ops/scripts/amico-vault",
    ])
  })
  test("unset env vars are skipped; canonical path is always last", () => {
    expect(candidates({}, home)).toEqual(["/home/u/.amico/ops/scripts/amico-vault"])
  })
})
