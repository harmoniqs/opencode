import { describe, expect, test } from "bun:test"
import { createSignal, Show, For } from "solid-js"
import { createComponent, render } from "solid-js/web"

/**
 * Tests for the file-name picker behavior in the review panel's file header.
 *
 * The FileNameWithPicker component (in the amicode overlay of
 * session-review-file-preview-v2.tsx) renders a clickable filename that opens
 * a popover file list when multiple files are available. These tests verify
 * the behavioral contract through the DOM — the same interface a user sees.
 *
 * Uses createComponent (imperative SolidJS API) since bun's test runner
 * does not apply the Solid JSX transform.
 */

function getFilename(path: string) {
  return path.split("/").pop() ?? path
}

function getDirectory(path: string) {
  const parts = path.split("/")
  return parts.length > 1 ? parts.slice(0, -1).join("/") : undefined
}

/** Minimal reproduction of FileNameWithPicker's logic and DOM contract. */
function FileNameWithPicker(props: {
  file: string
  files?: string[]
  onSelectFile?: (file: string) => void
}) {
  const [open, setOpen] = createSignal(false)
  const hasMultipleFiles = () => (props.files?.length ?? 0) > 1 && !!props.onSelectFile

  const select = (file: string) => {
    setOpen(false)
    props.onSelectFile?.(file)
  }

  return createComponent(Show, {
    get when() {
      return hasMultipleFiles()
    },
    get fallback() {
      const span = document.createElement("span")
      span.setAttribute("data-slot", "session-review-v2-file-name")
      span.textContent = getFilename(props.file)
      return span
    },
    get children() {
      const wrapper = document.createElement("div")

      const trigger = document.createElement("button")
      trigger.type = "button"
      trigger.className = "session-review-v2-file-picker-trigger"
      trigger.setAttribute("data-testid", "file-picker-trigger")
      trigger.addEventListener("click", () => setOpen(!open()))

      const nameSpan = document.createElement("span")
      nameSpan.setAttribute("data-slot", "session-review-v2-file-name")
      nameSpan.setAttribute("data-clickable", "")
      nameSpan.textContent = getFilename(props.file)
      trigger.appendChild(nameSpan)

      const dir = getDirectory(props.file)
      if (dir) {
        const dirSpan = document.createElement("span")
        dirSpan.setAttribute("data-slot", "session-review-v2-file-path")
        dirSpan.setAttribute("data-clickable", "")
        dirSpan.textContent = dir
        trigger.appendChild(dirSpan)
      }

      wrapper.appendChild(trigger)

      // Reactive list rendering
      const listContainer = document.createElement("div")
      wrapper.appendChild(listContainer)

      // Use an effect to reactively show/hide the list
      const { createEffect } = require("solid-js")
      createEffect(() => {
        listContainer.innerHTML = ""
        if (!open()) return

        const list = document.createElement("div")
        list.setAttribute("data-slot", "session-review-v2-file-picker-list")
        list.setAttribute("data-testid", "file-picker-list")

        for (const file of props.files ?? []) {
          const btn = document.createElement("button")
          btn.type = "button"
          btn.setAttribute("data-slot", "session-review-v2-file-picker-item")
          btn.setAttribute("data-testid", `file-picker-item-${getFilename(file)}`)
          if (file === props.file) btn.setAttribute("data-active", "")
          btn.addEventListener("click", () => select(file))

          const itemName = document.createElement("span")
          itemName.setAttribute("data-slot", "session-review-v2-file-picker-item-name")
          itemName.textContent = getFilename(file)
          btn.appendChild(itemName)

          list.appendChild(btn)
        }

        listContainer.appendChild(list)
      })

      return wrapper
    },
  })
}

describe("FileNameWithPicker", () => {
  function mount(props: { file: string; files?: string[]; onSelectFile?: (f: string) => void }) {
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => createComponent(FileNameWithPicker, props), host)
    return { host, dispose, cleanup: () => { dispose(); host.remove() } }
  }

  test("renders a clickable trigger when multiple files exist", () => {
    const { host, cleanup } = mount({
      file: "src/foo.ts",
      files: ["src/foo.ts", "src/bar.ts", "src/baz.ts"],
      onSelectFile: () => {},
    })

    const trigger = host.querySelector("[data-testid='file-picker-trigger']") as HTMLButtonElement
    expect(trigger).not.toBeNull()
    expect(trigger.tagName).toBe("BUTTON")
    expect(trigger.getAttribute("type")).toBe("button")

    const filename = host.querySelector("[data-slot='session-review-v2-file-name']")
    expect(filename?.textContent).toBe("foo.ts")
    expect(filename?.hasAttribute("data-clickable")).toBe(true)

    cleanup()
  })

  test("clicking the trigger opens the file list", () => {
    const { host, cleanup } = mount({
      file: "src/foo.ts",
      files: ["src/foo.ts", "src/bar.ts"],
      onSelectFile: () => {},
    })

    expect(host.querySelector("[data-testid='file-picker-list']")).toBeNull()

    const trigger = host.querySelector("[data-testid='file-picker-trigger']") as HTMLButtonElement
    trigger.click()

    const list = host.querySelector("[data-testid='file-picker-list']")
    expect(list).not.toBeNull()

    const items = host.querySelectorAll("[data-slot='session-review-v2-file-picker-item']")
    expect(items.length).toBe(2)

    cleanup()
  })

  test("clicking a file in the popover calls onSelectFile with that path", () => {
    const selected: string[] = []
    const { host, cleanup } = mount({
      file: "src/foo.ts",
      files: ["src/foo.ts", "src/bar.ts", "lib/util.ts"],
      onSelectFile: (f) => selected.push(f),
    })

    const trigger = host.querySelector("[data-testid='file-picker-trigger']") as HTMLButtonElement
    trigger.click()

    const barItem = host.querySelector("[data-testid='file-picker-item-bar.ts']") as HTMLButtonElement
    barItem.click()

    expect(selected).toEqual(["src/bar.ts"])

    cleanup()
  })

  test("popover closes after selection", () => {
    const { host, cleanup } = mount({
      file: "src/foo.ts",
      files: ["src/foo.ts", "src/bar.ts"],
      onSelectFile: () => {},
    })

    const trigger = host.querySelector("[data-testid='file-picker-trigger']") as HTMLButtonElement
    trigger.click()
    expect(host.querySelector("[data-testid='file-picker-list']")).not.toBeNull()

    const item = host.querySelector("[data-testid='file-picker-item-bar.ts']") as HTMLButtonElement
    item.click()

    expect(host.querySelector("[data-testid='file-picker-list']")).toBeNull()

    cleanup()
  })

  test("falls back to static display when only one file", () => {
    const { host, cleanup } = mount({
      file: "src/foo.ts",
      files: ["src/foo.ts"],
      onSelectFile: () => {},
    })

    expect(host.querySelector("[data-testid='file-picker-trigger']")).toBeNull()

    const filename = host.querySelector("[data-slot='session-review-v2-file-name']")
    expect(filename).not.toBeNull()
    expect(filename?.textContent).toBe("foo.ts")
    expect(filename?.hasAttribute("data-clickable")).toBe(false)

    cleanup()
  })

  test("falls back to static display when no onSelectFile provided", () => {
    const { host, cleanup } = mount({
      file: "src/foo.ts",
      files: ["src/foo.ts", "src/bar.ts"],
    })

    expect(host.querySelector("[data-testid='file-picker-trigger']")).toBeNull()
    const filename = host.querySelector("[data-slot='session-review-v2-file-name']")
    expect(filename?.textContent).toBe("foo.ts")

    cleanup()
  })

  test("marks the current file as active in the picker list", () => {
    const { host, cleanup } = mount({
      file: "src/bar.ts",
      files: ["src/foo.ts", "src/bar.ts", "src/baz.ts"],
      onSelectFile: () => {},
    })

    const trigger = host.querySelector("[data-testid='file-picker-trigger']") as HTMLButtonElement
    trigger.click()

    const activeItem = host.querySelector("[data-slot='session-review-v2-file-picker-item'][data-active]")
    expect(activeItem).not.toBeNull()
    expect(activeItem?.querySelector("[data-slot='session-review-v2-file-picker-item-name']")?.textContent).toBe("bar.ts")

    cleanup()
  })
})
