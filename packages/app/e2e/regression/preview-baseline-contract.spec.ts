import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/PreviewBaselineContract"
const projectID = "proj_preview_baseline_contract"
const sessionID = "ses_preview_baseline_contract"
const title = "Preview baseline contract"
const markdownFile = "notes/baseline.md"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const markdownContent = ["# Baseline Preview", "", "The renderer must keep focus."]
  .concat(Array.from({ length: 200 }, (_, index) => `Scrollable preview paragraph ${index}.`))
  .join("\n\n")

test.use({ viewport: { width: 1440, height: 900 } })

test("keeps Markdown typing in CodeMirror after its language support loads", async ({ page }) => {
  await openPreview(page)

  const panel = page.locator("#review-panel")
  await panel.getByRole("button", { name: "Edit" }).click()

  const editor = panel.locator(".cm-content")
  await expect(editor).toBeVisible()
  await expect(editor.locator("span").filter({ hasText: "Baseline Preview" })).toBeVisible()
  await editor.click()
  await editor.press("End")
  await editor.type("\nTyped after language loading.")

  await expect(editor).toContainText("Typed after language loading.")
  await expect(editor).toBeFocused()
  await expect(page.locator('[data-component="prompt-input"]')).toHaveText("")
})

test("keeps ordinary Preview scrolling at the position selected by the user", async ({ page }) => {
  await openPreview(page)

  const renderer = page
    .getByText("The renderer must keep focus.", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'overflow-auto')][1]")
  await renderer.hover()
  await page.mouse.wheel(0, 800)
  await expect.poll(() => renderer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

  const position = await renderer.evaluate((element) => element.scrollTop)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )
  await expect.poll(() => renderer.evaluate((element) => element.scrollTop)).toBe(position)
})

test("writes the current editor content on Cmd+S without moving focus to the composer", async ({ page }) => {
  await openPreview(page)

  const panel = page.locator("#review-panel")
  await panel.getByRole("button", { name: "Edit" }).click()

  const editor = panel.locator(".cm-content")
  await expect(editor).toBeVisible()
  await expect(editor.locator("span").filter({ hasText: "Baseline Preview" })).toBeVisible()
  await editor.click()
  await editor.press(await page.evaluate(() => (navigator.platform.includes("Mac") ? "Meta+a" : "Control+a")))
  await editor.type("Saved from CodeMirror.")
  await expect(panel.getByLabel("Unsaved changes")).toBeVisible()

  const write = page.waitForRequest(
    (request) => new URL(request.url()).pathname.endsWith("/file/write") && request.method() === "POST",
  )
  await editor.press(await page.evaluate(() => (navigator.platform.includes("Mac") ? "Meta+s" : "Control+s")))

  expect((await write).postDataJSON()).toEqual({
    path: markdownFile,
    content: "Saved from CodeMirror.",
  })
  await expect(editor).toBeFocused()
  await expect(page.locator('[data-component="prompt-input"]')).toHaveText("")
})

async function openPreview(page: Parameters<typeof mockOpenCodeServer>[0]) {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "preview-baseline-contract",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions: [
      {
        id: sessionID,
        slug: sessionID,
        projectID,
        directory,
        title,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    fileContent: (path) => {
      if (path !== markdownFile) return undefined
      return { type: "text", content: markdownContent }
    },
    pageMessages: () => ({ items: [] }),
  })

  await page.addInitScript(
    ({ directory, server, sessionID }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ review: { diffStyle: "split", panelOpened: true } }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: sessionID }]),
      )
    },
    { directory, server, sessionID },
  )

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  await page.evaluate((path) => {
    window.postMessage({ source: "amicode", kind: "preview-file", path }, "*")
  }, markdownFile)
  await expect(page.locator("#review-panel").getByRole("tab", { name: "Preview" })).toHaveAttribute("data-selected", "")
  await expect(page.getByText("The renderer must keep focus.", { exact: true })).toBeVisible()
}
