// Executable gate for the built-in widget sources: every widgetJs must PARSE
// (tmp-file import — Bun throws BuildMessage on syntax errors; data: URLs do
// not work, they resolve as asset paths) and MOUNT against a fake amico +
// stub el without throwing. Widgets are written defensively (querySelector
// may return null), so the stub returns null and mounts still succeed.
import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseManifest } from "../../src/server/amicode/widget-manifest"
import * as meetAmico from "../../src/server/amicode/widgets-src/meet-amico"
import * as showcase from "../../src/server/amicode/widgets-src/showcase"
import * as jumpBackIn from "../../src/server/amicode/widgets-src/jump-back-in"
import * as pulseBank from "../../src/server/amicode/widgets-src/pulse-bank"
import * as aboutYou from "../../src/server/amicode/widgets-src/about-you"
import * as nowSolving from "../../src/server/amicode/widgets-src/now-solving"
import * as library from "../../src/server/amicode/widgets-src/library"

const SOURCES: Record<string, { manifestToml: string; widgetJs: string }> = {
  "meet-amico": meetAmico,
  showcase,
  "jump-back-in": jumpBackIn,
  "pulse-bank": pulseBank,
  "about-you": aboutYou,
  "now-solving": nowSolving,
  library,
}

const PROFILE = {
  ok: true,
  you: {
    name: "Ada",
    affiliation: "Harmoniqs",
    scholar: null,
    affiliation_logo: null,
    focus: "transmon pulse design",
    avatar: null,
    platforms: ["transmon"],
    stats: { problems: 4, runs: 9, best_fidelity: 0.9999, banked: 5, since: "2026-07-03" },
    remembers: [{ title: "Prefers LaTeX", detail: "everywhere" }],
  },
  error: null,
}

function stubEl(): { el: any; state: { html: string } } {
  const state = { html: "" }
  const el = {
    get innerHTML() {
      return state.html
    },
    set innerHTML(v: string) {
      state.html = v
    },
    querySelector: () => null,
    querySelectorAll: () => [] as unknown[],
  }
  return { el, state }
}

function fakeAmico(context: Record<string, unknown> = {}) {
  return {
    fetch: async (path: string) => (path.startsWith("/amicode/profile") ? PROFILE : { ok: false }),
    config: { stats: ["problems", "runs", "banked"], plot: "pulse" },
    onConfig: () => {},
    theme: {},
    density: "normal",
    onTheme: () => {},
    context,
    onContext: () => {},
    action: async () => ({ ok: true }),
    prompt: () => {},
    open: () => {},
  }
}

const tick = () => new Promise((r) => setTimeout(r, 10))

describe("built-in widget sources", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "amc-widgets-"))

  for (const [id, src] of Object.entries(SOURCES)) {
    test(`${id}: manifest parses and id matches`, () => {
      const r = parseManifest(src.manifestToml, id)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.manifest.id).toBe(id)
    })

    test(`${id}: widgetJs parses and exports default.mount`, async () => {
      const file = path.join(dir, `${id}.mjs`)
      writeFileSync(file, src.widgetJs)
      const mod = await import(file)
      expect(typeof mod.default?.mount).toBe("function")
    })

    test(`${id}: mounts against fake amico without throwing`, async () => {
      const file = path.join(dir, `${id}-mount.mjs`)
      writeFileSync(file, src.widgetJs)
      const mod = await import(file)
      const { el } = stubEl()
      const context = {
        resume: { name: "x-gate-transmon", meta: "transmon · X" },
        liveRun: { name: "x-gate", iteration: 12, fidelity: 0.98, series: [1, 0.5, 0.2], pulse: [0, 1, 2, 3], drives: 2 },
        library: { count: 3, latestName: "paper.pdf", latestPath: "/tmp/paper.pdf" },
      }
      mod.default.mount(el, fakeAmico(context))
      await tick()
    })
  }

  test("data-driven widgets render content when data is present", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["jump-back-in", { resume: { name: "x-gate-transmon", meta: "transmon · X" } }],
      ["pulse-bank", {}],
    ]
    for (const [id, context] of cases) {
      const file = path.join(dir, `${id}-content.mjs`)
      writeFileSync(file, SOURCES[id].widgetJs)
      const mod = await import(file)
      const { el, state } = stubEl()
      mod.default.mount(el, fakeAmico(context))
      await tick()
      expect(state.html.length).toBeGreaterThan(0)
    }
  })

  test("empty-state widgets render nothing without data", async () => {
    for (const id of ["jump-back-in", "now-solving"]) {
      const file = path.join(dir, `${id}-empty.mjs`)
      writeFileSync(file, SOURCES[id].widgetJs)
      const mod = await import(file)
      const { el, state } = stubEl()
      mod.default.mount(el, fakeAmico({}))
      await tick()
      expect(state.html).toBe("")
    }
  })
})
