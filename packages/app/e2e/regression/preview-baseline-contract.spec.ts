import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Locator } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { createPdfFixture } from "../utils/pdf-fixture"
import { dragSelectText } from "../utils/text-selection"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/PreviewBaselineContract"
const projectID = "proj_preview_baseline_contract"
const sessionID = "ses_preview_baseline_contract"
const title = "Preview baseline contract"
const markdownFile = "notes/baseline.md"
const secondMarkdownFile = "notes/second.md"
const imageFile = "assets/preview.png"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const markdownContent = ["# Baseline Preview", "", "The renderer must keep focus."]
  .concat(Array.from({ length: 200 }, (_, index) => `Scrollable preview paragraph ${index}.`))
  .join("\n\n")
const secondMarkdownContent = "# Second Preview\n\nThe second renderer stays alive."
const imageContent = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR+UgAAAABJRU5ErkJggg=="
const pdfFile = "papers/selectable.pdf"
const pdfText = "Amicode selectable PDF text"
const pdfContent = createPdfFixture([pdfText])
const noTextPdfFile = "papers/no-selectable-text.pdf"
const noTextPdfContent = createPdfFixture([""])
const partialTextPdfFile = "papers/partial-selectable-text.pdf"
const partialTextPdfContent = createPdfFixture([pdfText, ""])

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

test("uses the Preview header for VS Code-style file tabs instead of a duplicate title", async ({ page }) => {
  await openPreview(page)

  const panel = page.locator("#review-panel")
  const tablist = panel.getByRole("tablist", { name: "Open previews" })
  const tab = tablist.getByRole("tab", { name: "baseline.md" })
  await expect(tablist).toHaveCSS("height", "32px")
  await expect(tab.locator("xpath=ancestor::*[@data-slot='tabs-trigger-wrapper']")).toHaveCount(1)
  await expect(panel.getByText("baseline.md", { exact: true })).toHaveCount(1)
  await expect(tablist).toHaveCSS("border-bottom-width", "0px")
  await expect(tablist.evaluate((element) => getComputedStyle(element, "::after").borderBottomWidth)).resolves.toBe("0px")
})

test("allows image previews to zoom to 1000%", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, imageFile)

  const panel = page.locator("#review-panel")
  const zoom = panel.locator(`[data-preview-host="${imageFile}"] input[type="text"]`)
  await expect(panel.getByAltText("preview.png")).toBeVisible()
  await expect(zoom).toHaveValue("100%")
  await zoom.fill("1000")
  await zoom.press("Enter")
  await expect(zoom).toHaveValue("1000%")
})

test("lets a researcher select and copy text from a PDF Preview", async ({ page }) => {
  await openPreview(page)

  await page.evaluate((src) => {
    const writes: string[] = []
    ;(window as Window & { pdfClipboardWrites?: string[] }).pdfClipboardWrites = writes
    window.addEventListener("message", (event) => {
      const data = event.data as { source?: string; kind?: string; text?: string } | undefined
      if (data?.source === "amicode" && data.kind === "clipboard-write" && typeof data.text === "string") {
        writes.push(data.text)
      }
    })
    const iframe = document.createElement("iframe")
    iframe.id = "pdf-preview-webview"
    iframe.src = src
    iframe.style.cssText = "position: fixed; z-index: 9999; inset: 0; width: 100%; height: 100%; border: 0;"
    document.body.append(iframe)
  }, page.url())

  const preview = page.frameLocator("#pdf-preview-webview")
  await expect(preview.getByRole("heading", { name: title })).toBeVisible()
  await expect(preview.locator("#review-panel")).toBeAttached()
  await page.evaluate((path) => {
    document.querySelector<HTMLIFrameElement>("#pdf-preview-webview")?.contentWindow?.postMessage(
      { source: "amicode", kind: "preview-file", path },
      "*",
    )
  }, pdfFile)

  const text = preview.getByText(pdfText, { exact: true })
  await expect(text).toBeVisible()
  await dragSelectText(page, text)
  await expect.poll(() => text.evaluate(() => window.getSelection()?.toString())).toBe(pdfText)
  expect(await text.evaluate((element) => getComputedStyle(element, "::selection").backgroundColor)).not.toBe("rgba(0, 0, 0, 0)")
  await preview.getByRole("tab", { name: "Preview", exact: true }).press(
    await page.evaluate(() => (navigator.platform.includes("Mac") ? "Meta+c" : "Control+c")),
  )

  await expect.poll(() => page.evaluate(() => (window as Window & { pdfClipboardWrites?: string[] }).pdfClipboardWrites)).toEqual([pdfText])
})

test("keeps a PDF with no selectable text visible and explains the limitation", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, noTextPdfFile)

  const panel = page.locator("#review-panel")
  await expect(panel.locator(`[data-preview-host="${noTextPdfFile}"] canvas`)).toBeVisible()
  await expect(panel.getByText("This PDF has no selectable text.", { exact: true })).toBeVisible()
})

test("explains when text selection is unavailable on only some PDF pages", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, partialTextPdfFile)

  const panel = page.locator("#review-panel")
  await expect(panel.locator(`[data-preview-host="${partialTextPdfFile}"] canvas`)).toHaveCount(2)
  await expect(panel.getByText(pdfText, { exact: true })).toBeVisible()
  await expect(panel.getByText("Text selection is unavailable on some pages.", { exact: true })).toBeVisible()
})

test("keeps selectable PDF text aligned with its page after zooming", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, pdfFile)

  const host = page.locator(`#review-panel [data-preview-host="${pdfFile}"]`)
  const canvas = host.locator("canvas")
  const text = host.getByText(pdfText, { exact: true })
  const zoom = host.locator('input[type="text"]')
  await expect(text).toBeVisible()
  await expect.poll(() => textStaysWithinPage(text, canvas)).toBe(true)

  await zoom.fill("200")
  await zoom.press("Enter")
  await expect(zoom).toHaveValue("200%")
  await expect.poll(() => textStaysWithinPage(text, canvas)).toBe(true)
  await text.selectText()
  await expect.poll(() => text.evaluate(() => window.getSelection()?.toString())).toBe(pdfText)
})

test("keeps selectable PDF text live through repeated zoom updates", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, pdfFile)

  const host = page.locator(`#review-panel [data-preview-host="${pdfFile}"]`)
  const text = host.getByText(pdfText, { exact: true })
  const zoom = host.locator('input[type="text"]')
  const scroll = host.locator(".overflow-auto")
  await expect(text).toBeVisible()
  const textHandle = await text.elementHandle()

  for (const deltaY of [-50, -50, -50]) {
    await scroll.dispatchEvent("wheel", { ctrlKey: true, deltaY })
  }

  await expect.poll(async () => Number((await zoom.inputValue()).replace("%", ""))).toBeGreaterThan(100)
  expect(await textHandle?.evaluate((element) => element.isConnected)).toBe(true)
  await expect(text).toBeVisible()
})

test("defers PDF raster replacement until a zoom burst settles", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, pdfFile)

  const host = page.locator(`#review-panel [data-preview-host="${pdfFile}"]`)
  const canvas = host.locator("canvas")
  const scroll = host.locator(".overflow-auto")
  const initialWidth = await canvas.evaluate((element) => (element as HTMLCanvasElement).width)

  await scroll.dispatchEvent("wheel", { ctrlKey: true, deltaY: -50 })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBe(initialWidth)

  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(initialWidth)
})

test("copies a Preview tab filename or full filepath from its context menu", async ({ page }) => {
  await openPreview(page)
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          ;(window as Window & { copiedPreviewValue?: string }).copiedPreviewValue = value
        },
      },
    })
  })

  const tab = page.locator("#review-panel").getByRole("tab", { name: "baseline.md" })
  await tab.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Copy filename" }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { copiedPreviewValue?: string }).copiedPreviewValue)).toBe("baseline.md")

  await tab.click({ button: "right" })
  await page.getByRole("menuitem", { name: "Copy filepath" }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { copiedPreviewValue?: string }).copiedPreviewValue)).toBe(markdownFile)
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
  const secondHost = panel.locator('[data-preview-host="notes/second.md"]')
  await expect(secondHost).toBeVisible()
  await expect(panel.locator('[data-preview-host="notes/baseline.md"]')).toBeHidden()
  await expect(panel.locator('[data-preview-host="notes/baseline.md"]')).toHaveAttribute("hidden", "")
  await expect(panel.getByText("The second renderer stays alive.", { exact: true })).toBeVisible()

  await tabs.getByRole("tab", { name: "baseline.md" }).click()
  const baselineHost = panel.locator('[data-preview-host="notes/baseline.md"]')
  await expect(baselineHost).toBeVisible()
  await expect(secondHost).toBeHidden()
  await expect(secondHost).toHaveAttribute("hidden", "")
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
  await expect(panel.getByRole("tablist", { name: "Open previews" })).toBeHidden()
  await expect(baselineHost).toBeHidden()
  await expect(baselineHost).toBeAttached()
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
  await expect(panel.getByRole("button", { name: "Close baseline.md" }).locator("[data-preview-unsaved]")).toBeVisible()

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

test("reorders Preview tabs without recreating their renderer hosts", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const tabs = panel.getByRole("tablist", { name: "Open previews" })
  const baselineHost = panel.locator('[data-preview-host="notes/baseline.md"]')
  const host = await baselineHost.elementHandle()
  const source = tabs.getByRole("tab", { name: "second.md" })
  const target = tabs.getByRole("tab", { name: "baseline.md" })
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error("Preview tabs must be measurable before dragging")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2 - 12, targetBox.y + targetBox.height / 2, { steps: 8 })
  await page.mouse.up()

  expect(await tabs.getByRole("tab").allTextContents()).toEqual(["second.md", "baseline.md"])
  await expect(baselineHost).toBeAttached()
  expect(await host!.evaluate((element) => element.isConnected)).toBe(true)
})

test("splits a Preview leaf at its right edge without recreating the moved renderer", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const sourceLeaf = panel.locator('[data-preview-leaf="root"]')
  const outerPreview = panel.getByRole("tab", { name: "Preview", exact: true })
  const movedHost = panel.locator('[data-preview-host="notes/second.md"]')
  const host = await movedHost.elementHandle()
  const sourceBox = await source.boundingBox()
  const leafBox = await sourceLeaf.boundingBox()
  const outerPreviewBox = await outerPreview.boundingBox()
  if (!sourceBox || !leafBox || !host || !outerPreviewBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(leafBox.x + leafBox.width - 2, leafBox.y + leafBox.height / 2, { steps: 8 })
  await expect(panel.locator('[data-preview-dragging="notes/second.md"]')).toBeVisible()
  const dragProxy = page.locator("[data-preview-tab-drag-proxy]")
  await expect(dragProxy).toBeVisible()
  await expect(dragProxy).toContainText("second.md")
  await expect(dragProxy).toHaveCSS("pointer-events", "none")
  const dragProxyBox = await dragProxy.boundingBox()
  expect(dragProxyBox).not.toBeNull()
  expect(await dragProxy.evaluate((element) => element.parentElement?.parentElement === document.body)).toBe(true)
  expect(Math.abs(dragProxyBox!.x - (leafBox.x + leafBox.width - 2 + 8))).toBeLessThan(2)
  expect(Math.abs(dragProxyBox!.y - (leafBox.y + leafBox.height / 2 + 8))).toBeLessThan(2)
  const preview = panel.locator('[data-preview-drop-preview="right"]')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveCSS("pointer-events", "none")
  const previewBox = await preview.boundingBox()
  expect(previewBox?.width).toBeGreaterThanOrEqual(leafBox.width / 2 - 2)
  expect(previewBox?.height).toBeGreaterThanOrEqual(leafBox.height - 2)
  await page.mouse.up()
  await page.waitForTimeout(250)
  await expect(preview).toHaveCount(0)
  await expect(dragProxy).toHaveCount(0)

  const destinationLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  await expect(panel.locator("[data-preview-leaf]")).toHaveCount(2)
  await expect(destinationLeaf.getByRole("tab", { name: "second.md" })).toHaveAttribute("aria-selected", "true")
  await expect(destinationLeaf.locator('[data-preview-host="notes/second.md"]')).toBeVisible()
  await expect(destinationLeaf.getByText("The second renderer stays alive.", { exact: true })).toBeVisible()
  await expect(sourceLeaf.getByText("The renderer must keep focus.", { exact: true })).toBeVisible()
  expect(await host.evaluate((element) => element.isConnected)).toBe(true)

  await sourceLeaf.getByText("The renderer must keep focus.", { exact: true }).click()
  await expect(sourceLeaf).toHaveAttribute("data-focused", "true")
  await expect(destinationLeaf).not.toHaveAttribute("data-focused", "true")

  await destinationLeaf.getByText("The second renderer stays alive.", { exact: true }).click()
  await expect(destinationLeaf).toHaveAttribute("data-focused", "true")
  await expect(sourceLeaf).not.toHaveAttribute("data-focused", "true")

  const sourceLeafBox = await sourceLeaf.boundingBox()
  const destinationLeafBox = await destinationLeaf.boundingBox()
  expect(sourceLeafBox?.width).toBeGreaterThanOrEqual(150)
  expect(destinationLeafBox?.width).toBeGreaterThanOrEqual(150)
  expect(destinationLeafBox?.x).toBeGreaterThan(sourceLeafBox!.x)
  expect((await outerPreview.boundingBox())?.x).toBe(outerPreviewBox.x)
  await expect(panel.getByRole("separator", { name: "Resize Preview panes" })).toHaveCSS("width", "1px")
})

test("distinguishes focused and unfocused Preview pane tabs while preserving pane corners", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height - 2, { steps: 8 })
  await page.mouse.up()

  const bottomLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  await expect(bottomLeaf).toHaveAttribute("data-focused", "true")
  await expect(rootLeaf).toHaveCSS("border-bottom-left-radius", "0px")
  await expect(rootLeaf).toHaveCSS("border-bottom-right-radius", "0px")
  await expect(bottomLeaf).toHaveCSS("border-bottom-left-radius", "4px")
  await expect(bottomLeaf).toHaveCSS("border-bottom-right-radius", "4px")

  const selectedTabStyle = (leaf: ReturnType<typeof panel.locator>) =>
    leaf.locator('[data-slot="tabs-trigger-wrapper"]:has([data-selected])').evaluate((element) => {
      const style = getComputedStyle(element)
      return { backgroundColor: style.backgroundColor, color: style.color }
    })

  const focusedStyle = await selectedTabStyle(bottomLeaf)
  const unfocusedStyle = await selectedTabStyle(rootLeaf)
  expect(focusedStyle).not.toEqual(unfocusedStyle)

  await rootLeaf.getByText("The renderer must keep focus.", { exact: true }).click()
  await expect(rootLeaf).toHaveAttribute("data-focused", "true")
  await expect(bottomLeaf).not.toHaveAttribute("data-focused", "true")
  await expect.poll(() => selectedTabStyle(rootLeaf)).toEqual(focusedStyle)
  await expect.poll(() => selectedTabStyle(bottomLeaf)).toEqual(unfocusedStyle)
})

test("transfers a renderer into another leaf and collapses its emptied source", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const initialSourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!initialSourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(initialSourceBox.x + initialSourceBox.width / 2, initialSourceBox.y + initialSourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const splitSource = panel.locator('[data-preview-leaf="pane-1"]')
  const movedHost = splitSource.locator('[data-preview-host="notes/second.md"]')
  const host = await movedHost.elementHandle()
  const transferTab = splitSource.getByRole("tab", { name: "second.md" })
  const transferBox = await transferTab.boundingBox()
  const transferTarget = await rootLeaf.boundingBox()
  if (!host || !transferBox || !transferTarget) throw new Error("Preview leaves must be measurable before transferring")

  await page.mouse.move(transferBox.x + transferBox.width / 2, transferBox.y + transferBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(transferTarget.x + transferTarget.width / 2, transferTarget.y + transferTarget.height / 2, { steps: 8 })

  const mergePreview = panel.locator('[data-preview-drop-preview="center"]')
  await expect(mergePreview).toBeVisible()
  const mergePreviewBox = await mergePreview.boundingBox()
  expect(mergePreviewBox).not.toBeNull()
  expect(Math.abs(mergePreviewBox!.x - transferTarget.x)).toBeLessThan(2)
  expect(Math.abs(mergePreviewBox!.y - transferTarget.y)).toBeLessThan(2)
  expect(Math.abs(mergePreviewBox!.width - transferTarget.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(mergePreviewBox!.height - transferTarget.height)).toBeLessThanOrEqual(2)

  await page.mouse.up()
  await page.waitForTimeout(250)

  await expect(panel.locator("[data-preview-leaf]")).toHaveCount(1)
  await expect(rootLeaf.getByRole("tab", { name: "second.md" })).toHaveAttribute("aria-selected", "true")
  await expect(rootLeaf.locator('[data-preview-host="notes/second.md"]')).toBeVisible()
  await expect(rootLeaf.getByText("The second renderer stays alive.", { exact: true })).toBeVisible()
  expect(await host.evaluate((element) => element.isConnected)).toBe(true)
  await expect
    .poll(() => panel.locator("[data-preview-workspace]").evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1)
})

test("retains an unsaved editor draft through a Preview edge split", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const movedHost = panel.locator('[data-preview-host="notes/second.md"]')
  await panel.getByRole("button", { name: "Edit" }).click()
  const editor = movedHost.locator(".cm-content")
  await editor.click()
  await editor.press("End")
  await editor.type("\nRelocated draft.")
  await expect(editor).toContainText("Relocated draft.")
  const host = await movedHost.elementHandle()

  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!host || !sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)

  const destinationLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  await expect(destinationLeaf.locator('[data-preview-host="notes/second.md"] .cm-content')).toContainText("Relocated draft.")
  expect(await host.evaluate((element) => element.isConnected)).toBe(true)
})

test("keeps Preview zoom independent in split panes", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const destinationLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  const rootZoom = rootLeaf.locator('input[type="text"]:visible')
  const destinationZoom = destinationLeaf.locator('input[type="text"]')
  await expect(rootZoom).toHaveValue("100%")
  await expect(destinationZoom).toHaveValue("100%")

  await rootZoom.fill("130")
  await rootZoom.press("Enter")

  await expect(rootZoom).toHaveValue("130%")
  await expect(destinationZoom).toHaveValue("100%")
})

test("keeps each pane's zoom control inside its minimum-width leaf", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const destinationLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  for (const leaf of [rootLeaf, destinationLeaf]) {
    const leafBox = await leaf.boundingBox()
    const inputBox = await leaf.locator('input[type="text"]:visible').boundingBox()
    if (!leafBox || !inputBox) throw new Error("Preview leaf and zoom input must be measurable")
    expect(inputBox.x).toBeGreaterThanOrEqual(leafBox.x)
    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(leafBox.x + leafBox.width)
  }
})

test("inherits source zoom and focuses the new Preview leaf after a split", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const rootZoom = rootLeaf.locator('[data-preview-host="notes/second.md"] input[type="text"]')
  await rootZoom.fill("130")
  await rootZoom.press("Enter")
  await expect(rootZoom).toHaveValue("130%")

  const source = panel.getByRole("tab", { name: "second.md" })
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const destinationLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  await expect(destinationLeaf).toHaveAttribute("data-focused", "true")
  await expect(destinationLeaf.locator('input[type="text"]')).toHaveValue("130%")
})

test("adopts destination pane zoom when transferring a Preview renderer", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const rootZoom = rootLeaf.locator('input[type="text"]')
  await rootZoom.fill("130")
  await rootZoom.press("Enter")
  await expect(rootZoom).toHaveValue("130%")

  const sourceLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  const movedHost = sourceLeaf.locator('[data-preview-host="notes/second.md"]')
  const host = await movedHost.elementHandle()
  const transferTab = sourceLeaf.getByRole("tab", { name: "second.md" })
  const transferBox = await transferTab.boundingBox()
  const transferTarget = await rootLeaf.boundingBox()
  if (!host || !transferBox || !transferTarget) throw new Error("Preview leaves must be measurable before transferring")

  await page.mouse.move(transferBox.x + transferBox.width / 2, transferBox.y + transferBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(transferTarget.x + transferTarget.width / 2, transferTarget.y + transferTarget.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect(rootLeaf.locator('[data-preview-host="notes/second.md"] input[type="text"]')).toHaveValue("130%")
  expect(await host.evaluate((element) => element.isConnected)).toBe(true)
})

test("keeps both Preview leaves at their minimum width while resizing a divider", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const divider = panel.getByRole("separator", { name: "Resize Preview panes" })
  await expect(divider).toBeVisible()
  const dividerBox = await divider.boundingBox()
  const initialRootLeafBox = await rootLeaf.boundingBox()
  if (!dividerBox || !initialRootLeafBox) throw new Error("Preview pane divider must be measurable")

  const accent = await page.evaluate(() => {
    const probe = document.createElement("div")
    probe.style.color = "var(--accent)"
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })

  await page.mouse.move(dividerBox.x - 3, dividerBox.y + dividerBox.height / 2)
  await page.mouse.down()
  await expect(divider).toHaveAttribute("data-resizing", "true")
  await expect(divider).toHaveCSS("background-color", accent)
  await page.mouse.move(dividerBox.x + 400, dividerBox.y + dividerBox.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(divider).not.toHaveAttribute("data-resizing", "true")

  const resizedDividerBox = await divider.boundingBox()
  if (!resizedDividerBox) throw new Error("Resized Preview pane divider must be measurable")
  await page.mouse.move(resizedDividerBox.x - 3, resizedDividerBox.y + resizedDividerBox.height / 2)
  await expect(divider).toHaveCSS("background-color", accent)

  const destinationLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  const sourceLeafBox = await rootLeaf.boundingBox()
  const destinationLeafBox = await destinationLeaf.boundingBox()
  expect(Math.abs((sourceLeafBox?.width ?? 0) - initialRootLeafBox.width)).toBeGreaterThan(1)
  expect(sourceLeafBox?.width).toBeGreaterThanOrEqual(150)
  expect(destinationLeafBox?.width).toBeGreaterThanOrEqual(150)
})

test("rejects a self-edge drop from a one-tab Preview leaf", async ({ page }) => {
  await openPreview(page)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "baseline.md" })
  const leaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const leafBox = await leaf.boundingBox()
  if (!sourceBox || !leafBox) throw new Error("Preview tab and leaf must be measurable before dragging")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(leafBox.x + leafBox.width - 2, leafBox.y + leafBox.height / 2, { steps: 8 })
  await expect(panel.locator("[data-preview-drop-preview]")).toHaveCount(0)
  await page.mouse.up()

  await expect(panel.locator("[data-preview-leaf]")).toHaveCount(1)
  await expect(leaf.getByRole("tab", { name: "baseline.md" })).toHaveAttribute("aria-selected", "true")
})

for (const edge of ["left", "top", "bottom"] as const) {
  test(`edge-splits a Preview leaf at its ${edge} target`, async ({ page }) => {
    await openPreview(page)
    await openPreviewFile(page, secondMarkdownFile)

    const panel = page.locator("#review-panel")
    const source = panel.getByRole("tab", { name: "second.md" })
    const rootLeaf = panel.locator('[data-preview-leaf="root"]')
    const sourceBox = await source.boundingBox()
    const rootBox = await rootLeaf.boundingBox()
    if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

    const target = {
      left: { x: rootBox.x + 2, y: rootBox.y + rootBox.height / 2 },
      top: { x: rootBox.x + rootBox.width / 2, y: rootBox.y + 2 },
      bottom: { x: rootBox.x + rootBox.width / 2, y: rootBox.y + rootBox.height - 2 },
    }[edge]
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x, target.y, { steps: 8 })
    await expect(panel.locator(`[data-preview-drop-preview="${edge}"]`)).toBeVisible()
    await page.mouse.up()
    await page.waitForTimeout(250)

    const destinationLeaf = panel.locator('[data-preview-leaf="pane-1"]')
    const sourceLeafBox = await rootLeaf.boundingBox()
    const destinationLeafBox = await destinationLeaf.boundingBox()
    await expect(destinationLeaf.getByRole("tab", { name: "second.md" })).toHaveAttribute("aria-selected", "true")
    if (edge === "left") expect(destinationLeafBox?.x).toBeLessThan(sourceLeafBox!.x)
    if (edge === "top") expect(destinationLeafBox?.y).toBeLessThan(sourceLeafBox!.y)
    if (edge === "bottom") expect(destinationLeafBox?.y).toBeGreaterThan(sourceLeafBox!.y)
  })
}

test("clears the prospective pane preview when a Preview drag is cancelled", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const leaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const leafBox = await leaf.boundingBox()
  if (!sourceBox || !leafBox) throw new Error("Preview tab and leaf must be measurable before dragging")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(leafBox.x + leafBox.width - 2, leafBox.y + leafBox.height / 2, { steps: 8 })
  const dragProxy = page.locator("[data-preview-tab-drag-proxy]")
  await expect(dragProxy).toBeVisible()
  await expect(panel.locator('[data-preview-drop-preview="right"]')).toBeVisible()
  await page.mouse.move(leafBox.x - 20, leafBox.y + leafBox.height / 2, { steps: 4 })
  await expect(panel.locator("[data-preview-drop-preview]")).toHaveCount(0)
  await page.mouse.up()
  await expect(dragProxy).toHaveAttribute("data-leaving", "true")
  await page.waitForTimeout(200)
  await expect(dragProxy).toHaveCount(0)

  await expect(panel.locator("[data-preview-leaf]")).toHaveCount(1)
  await expect(leaf.getByRole("tab", { name: "second.md" })).toHaveAttribute("aria-selected", "true")
})

test("uses CSS overflow when nested Preview panes exceed the Work Column", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  await openPreviewFile(page, "notes/third.md")
  const thirdTab = panel.locator('[data-preview-leaf="pane-1"]').getByRole("tab", { name: "third.md" })
  const secondLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  const thirdBox = await thirdTab.boundingBox()
  const secondLeafBox = await secondLeaf.boundingBox()
  if (!thirdBox || !secondLeafBox) throw new Error("Nested Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(secondLeafBox.x + secondLeafBox.width - 2, secondLeafBox.y + secondLeafBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const workspace = panel.locator("[data-preview-workspace]")
  await expect(workspace).toBeVisible()
  await expect.poll(() => workspace.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  await workspace.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect.poll(() => workspace.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
})

test("isolates an outer surface-tab drag from Preview panes", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  const movedHost = panel.locator('[data-preview-host="notes/second.md"]')
  const host = await movedHost.elementHandle()
  const outerPreview = panel.getByRole("tab", { name: "Preview", exact: true })
  const outerFiles = panel.getByRole("tab", { name: /^Files Changed/ })
  const previewBox = await outerPreview.boundingBox()
  const filesBox = await outerFiles.boundingBox()
  if (!host || !previewBox || !filesBox) throw new Error("Outer surface tabs must be measurable before dragging")

  await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(filesBox.x + 12, filesBox.y + filesBox.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => (await outerPreview.boundingBox())?.x ?? Infinity).toBeLessThan(filesBox.x)
  await expect(panel.locator("[data-preview-leaf]")).toHaveCount(2)
  expect(await host.evaluate((element) => element.isConnected)).toBe(true)
})

test("opens a later Preview file in the leaf the researcher focused", async ({ page }) => {
  await openPreview(page)
  await openPreviewFile(page, secondMarkdownFile)

  const panel = page.locator("#review-panel")
  const source = panel.getByRole("tab", { name: "second.md" })
  const rootLeaf = panel.locator('[data-preview-leaf="root"]')
  const sourceBox = await source.boundingBox()
  const rootBox = await rootLeaf.boundingBox()
  if (!sourceBox || !rootBox) throw new Error("Preview tab and leaf must be measurable before splitting")

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rootBox.x + rootBox.width - 2, rootBox.y + rootBox.height / 2, { steps: 8 })
  await page.mouse.up()

  await rootLeaf.getByRole("tab", { name: "baseline.md" }).click()
  await openPreviewFile(page, "notes/third.md")

  const secondLeaf = panel.locator('[data-preview-leaf="pane-1"]')
  await expect(rootLeaf.getByRole("tab", { name: "third.md" })).toHaveAttribute("aria-selected", "true")
  await expect(secondLeaf.getByRole("tab", { name: "third.md" })).toHaveCount(0)
  await expect(rootLeaf.getByText("The nested renderer stays alive.", { exact: true })).toBeVisible()
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
      if (path === imageFile) return { type: "binary", content: imageContent, encoding: "base64", mimeType: "image/png" }
      if (path === pdfFile) return { type: "binary", content: pdfContent, encoding: "base64", mimeType: "application/pdf" }
      if (path === noTextPdfFile) return { type: "binary", content: noTextPdfContent, encoding: "base64", mimeType: "application/pdf" }
      if (path === partialTextPdfFile) return { type: "binary", content: partialTextPdfContent, encoding: "base64", mimeType: "application/pdf" }
      if (path === "notes/third.md") return { type: "text", content: "# Third Preview\n\nThe nested renderer stays alive." }
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
  await expect(page.locator("#review-panel").getByRole("tab", { name: "Preview", exact: true })).toHaveAttribute("data-selected", "")
}

async function textStaysWithinPage(text: Locator, canvas: Locator): Promise<boolean> {
  const [textBox, canvasBox] = await Promise.all([text.boundingBox(), canvas.boundingBox()])
  if (!textBox || !canvasBox) return false
  const tolerance = 2
  return (
    textBox.x >= canvasBox.x - tolerance &&
    textBox.y >= canvasBox.y - tolerance &&
    textBox.x + textBox.width <= canvasBox.x + canvasBox.width + tolerance &&
    textBox.y + textBox.height <= canvasBox.y + canvasBox.height + tolerance
  )
}
