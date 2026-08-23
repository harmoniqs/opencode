// Executable gate for the built-in widget sources: every widgetJs must PARSE
// (evaluated as a module via blob: URL — Bun's dynamic import resolves temp
// files unreliably when the solid transform plugin is active) and MOUNT against
// a fake amico + stub el without throwing. Widgets are written defensively
// (querySelector may return null), so the stub returns null and mounts still
// succeed.
import { describe, expect, test } from "bun:test"
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

/** Import widget JS source as a module via blob: URL — avoids the bun test
 *  runner's solid transform plugin intercepting temp .mjs files on disk. */
async function importWidgetJs(source: string): Promise<{ default: { mount: (el: any, amico: any) => void } }> {
  const blob = new Blob([source], { type: "text/javascript" })
  const url = URL.createObjectURL(blob)
  try {
    return await import(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

describe("built-in widget sources", () => {

  for (const [id, src] of Object.entries(SOURCES)) {
    test(`${id}: manifest parses and id matches`, () => {
      const r = parseManifest(src.manifestToml, id)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.manifest.id).toBe(id)
    })

    test(`${id}: widgetJs parses and exports default.mount`, async () => {
      const mod = await importWidgetJs(src.widgetJs)
      expect(typeof mod.default?.mount).toBe("function")
    })

    test(`${id}: mounts against fake amico without throwing`, async () => {
      const mod = await importWidgetJs(src.widgetJs)
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
      const mod = await importWidgetJs(SOURCES[id].widgetJs)
      const { el, state } = stubEl()
      mod.default.mount(el, fakeAmico(context))
      await tick()
      expect(state.html.length).toBeGreaterThan(0)
    }
  })

  test("empty-state widgets render nothing without data", async () => {
    for (const id of ["jump-back-in", "now-solving"]) {
      const mod = await importWidgetJs(SOURCES[id].widgetJs)
      const { el, state } = stubEl()
      mod.default.mount(el, fakeAmico({}))
      await tick()
      expect(state.html).toBe("")
    }
  })
})
