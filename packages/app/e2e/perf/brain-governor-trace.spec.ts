import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { fixture, pageMessages } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

/* Headless-Chromium rAF-interval trace over the real app — issue #63's
   PRE-GATE PROXY. It boots the Chat on the >=40-card fixture thread with the
   dev force-full-tempo hook (`?brainForceActive`: Brain pinned busy, perf
   governor disabled), scrolls continuously for >=10s in EACH theme, and
   emits a p95 / max-frame-time / frames>33ms report.

   THIS IS NOT THE RELEASE GATE. A passing trace never closes #63's perf
   criterion: only a manual sign-off on the pinned reference laptop
   (battery-powered, VS Code webview, both themes) does — see the perf-gate
   checklist on the PR. Accordingly this spec asserts the harness RUNS and
   REPORTS (shape, duration, theme coverage, forced worst case); it asserts
   no numeric frame-time outcome. */

const SCROLL_MS = 11_000 // >=10s of continuous scroll per theme
const PROXY_LABEL = "pre-gate proxy — does NOT close the release gate (manual reference-laptop sign-off required)"

type ThemeTrace = {
  theme: "dark" | "light"
  colorScheme: string | undefined
  forced: boolean
  motion: string | undefined
  durationMs: number
  frames: number
  meanMs: number
  p95Ms: number
  maxMs: number
  over33: number
  cardsSeen: number
}

test.describe("perf proxy: brain governor trace", () => {
  test.setTimeout(300_000)

  test("headless rAF trace over a >=40-card thread at forced full tempo, both themes", async ({ page }) => {
    expect(fixture.messages[fixture.targetID].length).toBeGreaterThanOrEqual(40) // the long-thread fixture

    await mockOpenCodeServer(page, {
      sessions: fixture.sessions,
      provider: fixture.provider,
      directory: fixture.directory,
      project: fixture.project,
      pageMessages,
    })
    await seedStorage(page, fixture.directory)

    const traces: ThemeTrace[] = []
    for (const theme of ["dark", "light"] as const) {
      await page.emulateMedia({ colorScheme: theme }) // chat colorScheme defaults to "system"
      await page.goto(`/${base64Encode(fixture.directory)}/session/${fixture.targetID}?brainForceActive`)
      await expectSessionTitle(page, fixture.expected.targetTitle)
      await expect(page.locator("[data-timeline-row]").first()).toBeVisible()
      await expect(page.locator('[data-component="brain-atmosphere"] canvas')).toBeAttached()

      // the force hook must be live: Brain pinned busy, governor disabled
      const stats = await page.evaluate(
        () => (window as Window & { __amicoBrainStats?: () => { active: boolean; motion: string } }).__amicoBrainStats?.(),
      )
      expect(stats?.active).toBe(true)
      expect(stats?.motion).toBe("full")

      const trace = await tracedScroll(page, SCROLL_MS)
      traces.push({
        theme,
        colorScheme: trace.colorScheme,
        forced: stats?.active === true && stats?.motion === "full",
        motion: stats?.motion,
        ...trace.report,
      })
    }

    const report = { label: PROXY_LABEL, traces }
    console.log(`[brain-perf-proxy] ${JSON.stringify(report, null, 2)}`)

    // the harness ran and reported — shape only, never a numeric perf verdict
    expect(report.label).toContain("pre-gate proxy")
    expect(traces).toHaveLength(2)
    for (const t of traces) {
      expect(t.colorScheme).toBe(t.theme) // the theme actually applied
      expect(t.forced).toBe(true) // un-eased worst case measured
      expect(t.durationMs).toBeGreaterThanOrEqual(10_000) // >=10s continuous scroll
      expect(t.frames).toBeGreaterThan(100)
      expect(t.p95Ms).toBeGreaterThan(0)
      expect(t.maxMs).toBeGreaterThanOrEqual(t.p95Ms)
      expect(t.over33).toBeGreaterThanOrEqual(0)
      expect(t.cardsSeen).toBeGreaterThanOrEqual(10) // the sweep truly moved through the thread
    }
  })
})

/** rAF-interval sampler: scrolls the timeline continuously (up through
    history, bouncing at the ends) inside the SAME rAF loop that samples the
    frame intervals — the trace measures the app under scroll, not idle. */
async function tracedScroll(page: Page, minMs: number) {
  return page.evaluate(async (durationMs) => {
    const scroller = [...document.querySelectorAll<HTMLElement>(".scroll-view__viewport")].find((el) =>
      el.querySelector("[data-timeline-row]"),
    )
    if (!scroller) throw new Error("perf trace: no timeline scroller found")
    const seen = new Set<string>()
    const intervals: number[] = []
    let dir = -1 // start at the thread's foot, sweep up through history
    await new Promise<void>((resolve) => {
      let last = -1
      let t0 = -1
      const step = (now: number) => {
        if (t0 < 0) {
          t0 = now
          last = now
        } else {
          intervals.push(now - last)
          last = now
        }
        scroller.scrollTop += dir * 90
        if (scroller.scrollTop <= 2) dir = 1
        else if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) dir = -1
        if (intervals.length % 20 === 0) {
          for (const el of scroller.querySelectorAll<HTMLElement>("[data-message-id]")) {
            if (el.dataset.messageId) seen.add(el.dataset.messageId)
          }
        }
        if (now - t0 >= durationMs) return resolve()
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    const sorted = intervals.slice().sort((a, b) => a - b)
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0
    const round = (v: number) => Math.round(v * 100) / 100
    return {
      colorScheme: document.documentElement.dataset.colorScheme,
      report: {
        durationMs: Math.round(intervals.reduce((a, b) => a + b, 0)),
        frames: intervals.length,
        meanMs: round(intervals.reduce((a, b) => a + b, 0) / Math.max(intervals.length, 1)),
        p95Ms: round(q(0.95)),
        maxMs: round(sorted[sorted.length - 1] ?? 0),
        over33: intervals.filter((d) => d > 33).length,
        cardsSeen: seen.size,
      },
    }
  }, minMs)
}

/** the same storage seed the smoke spec uses: a known project + settings */
async function seedStorage(page: Page, directory: string) {
  await page.addInitScript((dir) => {
    localStorage.setItem(
      "opencode.global.dat:server",
      JSON.stringify({
        projects: { local: [{ worktree: dir, expanded: true }] },
        lastProject: { local: dir },
      }),
    )
  }, directory)
}
