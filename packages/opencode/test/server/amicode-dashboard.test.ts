import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { applySave, entryKey, mergeDashboard, type RegistryWidget } from "../../src/server/amicode/dashboard"
import { dashboardResponse, saveDashboardResponse } from "../../src/server/amicode/dashboard"
import { parseManifest } from "../../src/server/amicode/widget-manifest"

const manifest = (id: string, extra = "") => {
  const r = parseManifest(`id = "${id}"\nname = "${id}"\n${extra}`, id)
  if (!r.ok) throw new Error(r.error)
  return r.manifest
}

const REGISTRY: RegistryWidget[] = [
  { manifest: manifest("meet-amico", 'size = "hero"'), builtin: true },
  {
    manifest: manifest(
      "about-you",
      'size = "hero"\n[config.stats]\ntype = "multi-select"\noptions = ["problems", "runs", "banked"]\ndefault = ["problems", "runs", "banked"]',
    ),
    builtin: true,
  },
  { manifest: manifest("showcase"), builtin: true },
]

describe("mergeDashboard", () => {
  test("null state → registry order, visible, default config, deterministic keys", () => {
    const out = mergeDashboard(null, REGISTRY)
    expect(out.version).toBe(1)
    expect(out.widget.map((w) => w.id)).toEqual(["meet-amico", "about-you", "showcase"])
    expect(out.widget.every((w) => w.hidden === false)).toBe(true)
    expect(out.widget[1].config).toEqual({ stats: ["problems", "runs", "banked"] })
    expect(out.widget[0].key).toBe(entryKey("meet-amico"))
    expect(out.widget.every((w) => !w.missing)).toBe(true)
  })

  test("stored order preserved; unknown id kept + flagged missing; new registry widget appended", () => {
    const stored = {
      version: 1,
      widget: [
        { key: "w-1", id: "showcase", hidden: true, config: {} },
        { key: "w-2", id: "ghost-widget", hidden: false, config: { a: 1 } },
        { key: "w-3", id: "meet-amico", hidden: false, config: {} },
      ],
    }
    const out = mergeDashboard(stored, REGISTRY)
    expect(out.widget.map((w) => w.id)).toEqual(["showcase", "ghost-widget", "meet-amico", "about-you"])
    expect(out.widget[0].hidden).toBe(true)
    expect(out.widget[1].missing).toBe(true)
    expect(out.widget[3].id).toBe("about-you") // appended visible
    expect(out.widget[3].hidden).toBe(false)
  })

  test("user (non-builtin) registry widgets do NOT auto-append — opt-in pin only (Stage 2)", () => {
    const withUser: RegistryWidget[] = [...REGISTRY, { manifest: manifest("recent-runs"), builtin: false }]
    // absent from stored state → must NOT appear until explicitly pinned
    const fresh = mergeDashboard(null, withUser)
    expect(fresh.widget.map((w) => w.id)).not.toContain("recent-runs")
    // once pinned (present in stored state) → kept
    const pinned = mergeDashboard(
      { version: 1, widget: [{ key: "w-r", id: "recent-runs", hidden: false, config: {} }] },
      withUser,
    )
    const rr = pinned.widget.find((w) => w.id === "recent-runs")
    expect(rr).toBeDefined()
    expect(rr!.missing).toBeUndefined() // it's in the registry, not missing
  })

  test("config sanitized per manifest schema", () => {
    const stored = {
      version: 1,
      widget: [{ key: "w-1", id: "about-you", hidden: false, config: { stats: ["nope", "runs"], junk: true } }],
    }
    const out = mergeDashboard(stored, REGISTRY)
    const about = out.widget.find((w) => w.id === "about-you")!
    expect(about.config).toEqual({ stats: ["runs"] })
  })
})

describe("reserved-key pass-through (spec T3.6)", () => {
  test("unrecognized entry keys survive the merge", () => {
    const stored = {
      version: 1,
      widget: [{ key: "w-1", id: "showcase", hidden: false, config: {}, group: "lab", view: "home" }],
    }
    const out = mergeDashboard(stored, REGISTRY)
    const bank = out.widget.find((w) => w.id === "showcase") as Record<string, unknown>
    expect(bank.group).toBe("lab")
    expect(bank.view).toBe("home")
  })

  test("reserved top-level keys survive merge and save round-trip", () => {
    const stored = {
      version: 1,
      views: [{ id: "lab", name: "Lab" }],
      scope: "home",
      widget: [{ key: "w-1", id: "showcase", hidden: true, config: {} }],
    }
    const out = mergeDashboard(stored, REGISTRY) as Record<string, unknown>
    expect(out.views).toEqual([{ id: "lab", name: "Lab" }])
    expect(out.scope).toBe("home")

    const saved = applySave(JSON.stringify(stored), REGISTRY)
    expect(saved.ok).toBe(true)
    if (saved.ok) expect((saved.state as Record<string, unknown>).views).toEqual([{ id: "lab", name: "Lab" }])
  })

  test("core keys still win over passthrough collisions", () => {
    const stored = {
      version: 99, // not a reserved key — core version stays 1
      widget: [{ key: "w-1", id: "showcase", hidden: "maybe", config: {}, missing: true }],
    }
    const out = mergeDashboard(stored, REGISTRY)
    expect(out.version).toBe(1)
    const bank = out.widget.find((w) => w.id === "showcase")!
    expect(bank.hidden).toBe(false) // sanitized, not passthrough
    expect(bank.missing).toBeUndefined() // computed, not passthrough
  })
})

describe("applySave", () => {
  test("structurally valid body → sanitized merged state", () => {
    const r = applySave(
      JSON.stringify({ version: 1, widget: [{ id: "showcase", hidden: true }] }),
      REGISTRY,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.widget[0].id).toBe("showcase")
    expect(r.state.widget[0].hidden).toBe(true)
    expect(r.state.widget.map((w) => w.id)).toContain("about-you")
  })

  test("structurally invalid bodies rejected", () => {
    expect(applySave("not json", REGISTRY).ok).toBe(false)
    expect(applySave(JSON.stringify({ widget: "nope" }), REGISTRY).ok).toBe(false)
    expect(applySave(JSON.stringify({ widget: [{ id: 42 }] }), REGISTRY).ok).toBe(false)
  })
})

describe("file wrappers", () => {
  let dir: string
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    delete process.env.AMICODE_DASHBOARD_FILE
  })

  test("GET synthesizes without writing; POST persists; GET reads back", () => {
    dir = mkdtempSync(path.join(tmpdir(), "amc-dash-"))
    const file = path.join(dir, "dashboard.json")
    process.env.AMICODE_DASHBOARD_FILE = file

    const got = JSON.parse(dashboardResponse(REGISTRY))
    expect(got.ok).toBe(true)
    expect(got.dashboard.widget).toHaveLength(3)
    expect(existsSync(file)).toBe(false) // nothing written until first customize

    const saved = JSON.parse(
      saveDashboardResponse(JSON.stringify({ version: 1, widget: [{ id: "meet-amico", hidden: true }] }), REGISTRY),
    )
    expect(saved.ok).toBe(true)
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, "utf8")).widget[0].hidden).toBe(true)

    const again = JSON.parse(dashboardResponse(REGISTRY))
    expect(again.dashboard.widget[0].hidden).toBe(true)
  })

  test("corrupt state file → synthesized default, never a reject", () => {
    dir = mkdtempSync(path.join(tmpdir(), "amc-dash-"))
    const file = path.join(dir, "dashboard.json")
    process.env.AMICODE_DASHBOARD_FILE = file
    writeFileSync(file, "{corrupt")
    const got = JSON.parse(dashboardResponse(REGISTRY))
    expect(got.ok).toBe(true)
    expect(got.dashboard.widget).toHaveLength(3)
  })
})
