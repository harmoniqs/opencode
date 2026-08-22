import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

describe("profile endpoint — new fields", () => {
  let dir: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "amicode-profile-"))
    savedEnv = {
      AMICODE_PROFILE_FILE: process.env.AMICODE_PROFILE_FILE,
      AMICODE_PROBLEMS_ROOT: process.env.AMICODE_PROBLEMS_ROOT,
      AMICODE_RUNS_ROOT: process.env.AMICODE_RUNS_ROOT,
    }
    process.env.AMICODE_PROFILE_FILE = path.join(dir, "profile.json")
    process.env.AMICODE_PROBLEMS_ROOT = path.join(dir, "problems")
    process.env.AMICODE_RUNS_ROOT = path.join(dir, "runs")
    mkdirSync(path.join(dir, "problems"))
    mkdirSync(path.join(dir, "runs"))
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    rmSync(dir, { recursive: true, force: true })
  })

  test("saveProfile accepts and persists role and description", async () => {
    const { saveProfile } = await import("../../src/server/amicode/profile")
    // Save with the new fields
    const result = JSON.parse(
      saveProfile({
        name: "JJ Lee",
        role: "Head of Optimization",
        description: "Quantum control researcher focused on high-fidelity gates",
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.you.name).toBe("JJ Lee")
    expect(result.you.role).toBe("Head of Optimization")
    expect(result.you.description).toBe("Quantum control researcher focused on high-fidelity gates")

    // Verify persisted to file
    const stored = JSON.parse(readFileSync(path.join(dir, "profile.json"), "utf8"))
    expect(stored.role).toBe("Head of Optimization")
    expect(stored.description).toBe("Quantum control researcher focused on high-fidelity gates")
  })

  test("saveProfile accepts github and custom_link fields", async () => {
    const { saveProfile } = await import("../../src/server/amicode/profile")
    const result = JSON.parse(
      saveProfile({
        name: "JJ Lee",
        github: "https://github.com/jjlee",
        custom_link_url: "https://harmoniqs.co",
        custom_link_label: "Lab page",
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.you.github).toBe("https://github.com/jjlee")
    expect(result.you.custom_link).toEqual({ url: "https://harmoniqs.co", label: "Lab page" })
  })

  test("profileBody includes new fields in response", async () => {
    const { profileBody } = await import("../../src/server/amicode/profile")
    const profileFile = path.join(dir, "profile.json")
    writeFileSync(
      profileFile,
      JSON.stringify({
        name: "Test User",
        role: "Postdoc",
        description: "Working on bosonic codes",
        github: "https://github.com/testuser",
        custom_link: { url: "https://example.com", label: "My site" },
      }),
    )
    const result = JSON.parse(
      profileBody({
        profileFile,
        mountsFile: path.join(dir, "mounts.toml"),
        problemsRoot: path.join(dir, "problems"),
        runsRoot: path.join(dir, "runs"),
        memoryDirs: [],
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.you.role).toBe("Postdoc")
    expect(result.you.description).toBe("Working on bosonic codes")
    expect(result.you.github).toBe("https://github.com/testuser")
    expect(result.you.custom_link).toEqual({ url: "https://example.com", label: "My site" })
  })

  test("saveProfile clears empty string fields", async () => {
    const { saveProfile } = await import("../../src/server/amicode/profile")
    // First set values
    saveProfile({ name: "Test", role: "Postdoc", description: "Bio text" })
    // Then clear them
    const result = JSON.parse(saveProfile({ role: "", description: "" }))
    expect(result.you.role).toBe(null)
    expect(result.you.description).toBe(null)
  })
})
