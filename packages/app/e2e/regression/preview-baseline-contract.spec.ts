import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/PreviewBaselineContract"
const projectID = "proj_preview_baseline_contract"
const sessionID = "ses_preview_baseline_contract"
const title = "Preview baseline contract"
const markdownFile = "notes/baseline.md"
const secondMarkdownFile = "notes/second.md"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const markdownContent = ["# Baseline Preview", "", "The renderer must keep focus."]
  .concat(Array.from({ length: 200 }, (_, index) => `Scrollable preview paragraph ${index}.`))
  .join("\n\n")
const secondMarkdownContent = "# Second Preview\n\nThe second renderer stays alive."

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

test("retains renderer hosts and editor state through inner and outer Preview tabs", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const tabs = panel.getByRole("tablist", { name: "Open previews" })
  await expect(tabs.getByRole("tab", { name: "baseline.md" })).toBeVisible()
  await expect(tabs.getByRole("tab", { name: "second.md" })).toBeVisible()
  await expect(panel.getByText("The second renderer stays alive.", { exact: true })).toBeVisible()

  await tabs.getByRole("tab", { name: "baseline.md" }).click()
  const baselineHost = panel.locator('[data-preview-host="notes/baseline.md"]')
  await expect(baselineHost).toBeVisible()
  const host = await baselineHost.elementHandle()
  expect(host).not.toBeNull()

  await panel.getByRole("button", { name: "Edit" }).click()
  const editor = baselineHost.locator(".cm-content")
  await editor.click()
  await editor.press("End")
  await editor.type("\nRetained draft.")
  await expect(editor).toContainText("Retained draft.")

  await tabs.getByRole("tab", { name: "second.md" }).click()
  await expect(baselineHost).toBeAttached()
  await tabs.getByRole("tab", { name: "baseline.md" }).click()
  await expect(baselineHost).toBeVisible()
  await expect(editor).toContainText("Retained draft.")
  expect(await host!.evaluate((element) => element.isConnected)).toBe(true)

  await panel.getByRole("tab", { name: "Home" }).click()
  await panel.getByRole("tab", { name: "Preview" }).click()
  await expect(baselineHost).toBeVisible()
  await expect(editor).toContainText("Retained draft.")
  expect(await host!.evaluate((element) => element.isConnected)).toBe(true)
})

test("keeps a dirty tab open on cancel and delegates save before closing", async ({ page }) => {
  await openPreview(page)

  const panel = page.locator("#review-panel")
  await panel.getByRole("button", { name: "Edit" }).click()
  const editor = panel.locator('[data-preview-host="notes/baseline.md"] .cm-content')
  await editor.click()
  await editor.press("End")
  await editor.type("\nSave before close.")

  await panel.getByRole("button", { name: "Close baseline.md" }).click()
  const dialog = panel.getByRole("dialog", { name: "Unsaved changes" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(panel.getByRole("tab", { name: "baseline.md" })).toBeVisible()
  await expect(editor).toContainText("Save before close.")

  const write = page.waitForRequest(
    (request) => new URL(request.url()).pathname.endsWith("/file/write") && request.method() === "POST",
  )
  await panel.getByRole("button", { name: "Close baseline.md" }).click()
  await dialog.getByRole("button", { name: "Save" }).click()

  const saved = (await write).postDataJSON()
  expect(saved.path).toBe(markdownFile)
  expect(saved.content).toContain("Save before close.")
  await expect(panel.getByRole("tab", { name: "baseline.md" })).toHaveCount(0)

  await openPreviewFile(page, markdownFile)
  await panel.getByRole("button", { name: "Edit" }).click()
  const reopenedEditor = panel.locator('[data-preview-host="notes/baseline.md"] .cm-content')
  await reopenedEditor.click()
  await reopenedEditor.type("Discard this draft.")
  await panel.getByRole("button", { name: "Close baseline.md" }).click()
  await dialog.getByRole("button", { name: "Discard" }).click()
  await expect(panel.getByRole("tab", { name: "baseline.md" })).toHaveCount(0)
})

test("reuses an open path and refuses a ninth renderer host", async ({ page }) => {
  await openPreview(page)
  const panel = page.locator("#review-panel")
  const baselineHost = panel.locator('[data-preview-host="notes/baseline.md"]')
  const host = await baselineHost.elementHandle()

  await openPreviewFile(page, markdownFile)
  await expect(panel.getByRole("tablist", { name: "Open previews" }).getByRole("tab")).toHaveCount(1)
  expect(await host!.evaluate((element) => element.isConnected)).toBe(true)

  for (const index of Array.from({ length: 7 }, (_, value) => value + 1)) {
    await openPreviewFile(page, `notes/capacity-${index}.md`)
  }
  await expect(panel.getByRole("tablist", { name: "Open previews" }).getByRole("tab")).toHaveCount(8)

  await openPreviewFile(page, "notes/capacity-8.md")
  await expect(panel.getByRole("alert")).toHaveText("Close an existing Preview tab before opening another file.")
  await expect(baselineHost).toBeAttached()
  expect(await host!.evaluate((element) => element.isConnected)).toBe(true)
})

test("closing clean tabs selects the previous tab then the empty placeholder", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  await panel.getByRole("button", { name: "Close second.md" }).click()
  await expect(panel.getByRole("tab", { name: "second.md" })).toHaveCount(0)
  await expect(panel.getByRole("tab", { name: "baseline.md" })).toHaveAttribute("aria-selected", "true")

  await panel.getByRole("button", { name: "Close baseline.md" }).click()
  await expect(panel.getByText("Select a file from the sidebar", { exact: true })).toBeVisible()
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
      if (path === markdownFile) return { type: "text", content: markdownContent }
      if (path === secondMarkdownFile) return { type: "text", content: secondMarkdownContent }
      if (path.startsWith("notes/capacity-")) return { type: "text", content: `# ${path}` }
      return undefined
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
  await openPreviewFile(page, markdownFile)
  await expect(page.getByText("The renderer must keep focus.", { exact: true })).toBeVisible()
}

async function openPreviewFile(page: Parameters<typeof mockOpenCodeServer>[0], path: string) {
  await page.evaluate((path) => {
    window.postMessage({ source: "amicode", kind: "preview-file", path }, "*")
  }, path)
  await expect(page.locator("#review-panel").getByRole("tab", { name: "Preview" })).toHaveAttribute("data-selected", "")
}
