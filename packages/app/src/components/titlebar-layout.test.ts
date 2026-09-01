import { describe, expect, test } from "bun:test"
import {
  type TitlebarLayout,
  TITLEBAR_CONTROL_IDS,
  defaultTitlebarLayout,
  mountPointId,
  isSessionScoped,
  validateTitlebarLayout,
  createEditModeState,
} from "./titlebar-layout"

describe("titlebar layout", () => {
  test("the default layout places all five controls on the right in canonical order", () => {
    expect(defaultTitlebarLayout).toEqual({
      left: [],
      right: ["sessions", "status", "side-panel", "profile", "settings"],
    } satisfies TitlebarLayout)
    expect([...defaultTitlebarLayout.left, ...defaultTitlebarLayout.right].sort()).toEqual(
      [...TITLEBAR_CONTROL_IDS].sort(),
    )
  })

  test("a valid layout with all controls on the right passes through", () => {
    const input = {
      left: [],
      right: ["sessions", "status", "side-panel", "profile", "settings"],
    } satisfies TitlebarLayout
    expect(validateTitlebarLayout(input)).toEqual(input)
  })

  test("a valid layout split across left and right passes through", () => {
    const input = {
      left: ["profile", "settings"],
      right: ["sessions", "status", "side-panel"],
    } satisfies TitlebarLayout
    expect(validateTitlebarLayout(input)).toEqual(input)
  })

  test("malformed values fall back to the default layout", () => {
    expect(validateTitlebarLayout(null)).toEqual(defaultTitlebarLayout)
    expect(validateTitlebarLayout(undefined)).toEqual(defaultTitlebarLayout)
    expect(validateTitlebarLayout("string")).toEqual(defaultTitlebarLayout)
    expect(validateTitlebarLayout(42)).toEqual(defaultTitlebarLayout)
    expect(validateTitlebarLayout({})).toEqual(defaultTitlebarLayout)
    expect(validateTitlebarLayout({ left: "not-array", right: [] })).toEqual(defaultTitlebarLayout)
    expect(validateTitlebarLayout({ left: [], right: "not-array" })).toEqual(defaultTitlebarLayout)
    expect(validateTitlebarLayout({ right: ["sessions", "status", "side-panel", "profile", "settings"] })).toEqual(
      defaultTitlebarLayout,
    )
  })

  test("duplicate IDs fall back to the default layout", () => {
    expect(
      validateTitlebarLayout({
        left: ["sessions"],
        right: ["sessions", "status", "side-panel", "profile", "settings"],
      }),
    ).toEqual(defaultTitlebarLayout)
  })

  test("missing IDs fall back to the default layout", () => {
    expect(
      validateTitlebarLayout({
        left: [],
        right: ["sessions", "status", "side-panel", "profile"],
      }),
    ).toEqual(defaultTitlebarLayout)
  })

  test("unknown IDs fall back to the default layout", () => {
    expect(
      validateTitlebarLayout({
        left: ["unknown-button"],
        right: ["sessions", "status", "side-panel", "profile", "settings"],
      }),
    ).toEqual(defaultTitlebarLayout)
  })

  test("a valid layout with all controls on the left passes through", () => {
    const input = {
      left: ["sessions", "status", "side-panel", "profile", "settings"],
      right: [],
    } satisfies TitlebarLayout
    expect(validateTitlebarLayout(input)).toEqual(input)
  })

  test("mountPointId produces the portal element ID for each control", () => {
    expect(mountPointId("sessions")).toBe("opencode-titlebar-sessions")
    expect(mountPointId("status")).toBe("opencode-titlebar-status")
    expect(mountPointId("side-panel")).toBe("opencode-titlebar-side-panel")
    expect(mountPointId("profile")).toBe("opencode-titlebar-profile")
    expect(mountPointId("settings")).toBe("opencode-titlebar-settings")
  })

  test("isSessionScoped identifies controls that require a session to render", () => {
    expect(isSessionScoped("sessions")).toBe(true)
    expect(isSessionScoped("status")).toBe(true)
    expect(isSessionScoped("side-panel")).toBe(true)
    expect(isSessionScoped("profile")).toBe(false)
    expect(isSessionScoped("settings")).toBe(false)
  })
})

describe("edit mode state", () => {
  test("starts inactive", () => {
    const state = createEditModeState()
    expect(state.active()).toBe(false)
  })

  test("enter activates, exit deactivates", () => {
    const state = createEditModeState()
    state.enter()
    expect(state.active()).toBe(true)
    state.exit()
    expect(state.active()).toBe(false)
  })

  test("reset writes the default layout and exits edit mode", () => {
    const state = createEditModeState()
    let written: TitlebarLayout | undefined
    state.enter()
    state.reset((layout) => {
      written = layout
    })
    expect(written).toEqual(defaultTitlebarLayout)
    expect(state.active()).toBe(false)
  })
})
