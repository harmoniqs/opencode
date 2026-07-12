import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  forkManifestToml,
  forkWidgetResponse,
  loadRegistry,
  widgetCodeResponse,
  widgetsResponse,
} from "../../src/server/amicode/widgets"

let dir: string | undefined
const userDir = () => {
  dir = mkdtempSync(path.join(tmpdir(), "amc-widgets-reg-"))
  process.env.AMICODE_WIDGETS_DIR = dir
  return dir
}
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
  delete process.env.AMICODE_WIDGETS_DIR
})

const BUILTIN_ORDER = ["meet-amico", "about-you", "jump-back-in", "now-solving", "pulse-bank", "showcase", "library"]

describe("loadRegistry", () => {
  test("lists 7 built-ins in default order with stable hashes", () => {
    userDir()
    const { widgets, warnings } = loadRegistry()
    expect(widgets.map((w) => w.manifest.id)).toEqual(BUILTIN_ORDER)
    expect(widgets.every((w) => w.builtin && !w.overridden)).toBe(true)
    expect(warnings).toEqual([])
    const again = loadRegistry()
    expect(again.widgets.map((w) => w.hash)).toEqual(widgets.map((w) => w.hash))
  })

  test("user widget appears; same-id user widget wins with overridden flag", () => {
    const root = userDir()
    mkdirSync(path.join(root, "my-widget"))
    writeFileSync(path.join(root, "my-widget", "manifest.toml"), 'id = "my-widget"\nname = "Mine"')
    writeFileSync(path.join(root, "my-widget", "widget.js"), "export default { mount() {} }")
    mkdirSync(path.join(root, "pulse-bank"))
    writeFileSync(path.join(root, "pulse-bank", "manifest.toml"), 'id = "pulse-bank"\nname = "My bank"')
    writeFileSync(path.join(root, "pulse-bank", "widget.js"), "export default { mount() {} }")

    const { widgets } = loadRegistry()
    const mine = widgets.find((w) => w.manifest.id === "my-widget")!
    expect(mine.builtin).toBe(false)
    expect(mine.path).toContain("my-widget")
    const bank = widgets.find((w) => w.manifest.id === "pulse-bank")!
    expect(bank.overridden).toBe(true)
    expect(bank.manifest.name).toBe("My bank")
  })

  test("bad user manifest → warning, widget skipped", () => {
    const root = userDir()
    mkdirSync(path.join(root, "broken"))
    writeFileSync(path.join(root, "broken", "manifest.toml"), 'id = "mismatch"\nname = "X"')
    writeFileSync(path.join(root, "broken", "widget.js"), "export default { mount() {} }")
    const { widgets, warnings } = loadRegistry()
    expect(widgets.some((w) => w.manifest.id === "mismatch")).toBe(false)
    expect(warnings.some((w) => w.id === "broken")).toBe(true)
  })
})

describe("widget routes", () => {
  test("widgetsResponse carries manifests + hash; widgetCodeResponse serves code", () => {
    userDir()
    const list = JSON.parse(widgetsResponse())
    expect(list.ok).toBe(true)
    expect(list.widgets).toHaveLength(7)
    expect(list.widgets[0].hash).toMatch(/^[0-9a-f]{16}$/)

    const code = JSON.parse(widgetCodeResponse("meet-amico"))
    expect(code.ok).toBe(true)
    expect(code.code).toContain("mount")
    expect(code.hash).toBe(list.widgets[0].hash)
  })

  test("bad ids rejected without throwing", () => {
    userDir()
    expect(JSON.parse(widgetCodeResponse("../etc/passwd")).ok).toBe(false)
    expect(JSON.parse(widgetCodeResponse(undefined)).ok).toBe(false)
    expect(JSON.parse(widgetCodeResponse("nope-widget")).ok).toBe(false)
  })

  test("fork copies a built-in, rewrites id, appends origin; forked widget is valid in registry", () => {
    const root = userDir()
    const r = JSON.parse(forkWidgetResponse(JSON.stringify({ id: "pulse-bank", new_id: "my-bank", session: "s1" })))
    expect(r.ok).toBe(true)
    expect(r.id).toBe("my-bank")
    expect(existsSync(path.join(root, "my-bank", "widget.js"))).toBe(true)
    const manifest = readFileSync(path.join(root, "my-bank", "manifest.toml"), "utf8")
    expect(manifest).toContain('id = "my-bank"')
    expect(manifest).toContain("[origin]")
    expect(manifest).toContain('session = "s1"')

    const { widgets, warnings } = loadRegistry()
    const forked = widgets.find((w) => w.manifest.id === "my-bank")!
    expect(forked.builtin).toBe(false)
    expect(forked.manifest.origin?.session).toBe("s1")
    expect(warnings).toEqual([])
  })

  test("fork errors: unknown source, existing target, bad body", () => {
    userDir()
    expect(JSON.parse(forkWidgetResponse(JSON.stringify({ id: "ghost" }))).ok).toBe(false)
    expect(JSON.parse(forkWidgetResponse(JSON.stringify({ id: "pulse-bank", new_id: "showcase" }))).ok).toBe(false)
    expect(JSON.parse(forkWidgetResponse("not json")).ok).toBe(false)
  })

  test("forkManifestToml rewrites only the id line", () => {
    const out = forkManifestToml('id = "a"\nname = "A"\nheight = 96', "b", undefined)
    expect(out).toContain('id = "b"')
    expect(out).toContain('name = "A"')
    expect(out).toContain("[origin]")
  })
})
