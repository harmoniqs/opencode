import { afterEach, describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import {
  type TitlebarLayout,
  type TitlebarControlId,
  TITLEBAR_CONTROL_IDS,
  defaultTitlebarLayout,
  mountPointId,
  isSessionScoped,
  validateTitlebarLayout,
  createEditModeState,
  reorderWithinSlot,
  moveToSlot,
  createMountPointTracker,
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

describe("reorder operations", () => {
  test("reorderWithinSlot moves a control to a new position in the same slot", () => {
    const layout = {
      left: [],
      right: ["sessions", "status", "side-panel", "profile", "settings"],
    } satisfies TitlebarLayout
    const result = reorderWithinSlot(layout, "right", 0, 2)
    expect(result.right).toEqual(["status", "side-panel", "sessions", "profile", "settings"])
    expect(result.left).toEqual([])
  })

  test("reorderWithinSlot is a no-op when from equals to", () => {
    const layout = defaultTitlebarLayout
    const result = reorderWithinSlot(layout, "right", 1, 1)
    expect(result).toEqual(layout)
  })

  test("moveToSlot transfers a control from right to left", () => {
    const layout = {
      left: [],
      right: ["sessions", "status", "side-panel", "profile", "settings"],
    } satisfies TitlebarLayout
    const result = moveToSlot(layout, "profile", "left", 0)
    expect(result.left).toEqual(["profile"])
    expect(result.right).toEqual(["sessions", "status", "side-panel", "settings"])
  })

  test("moveToSlot transfers a control from left to right at a specific index", () => {
    const layout = {
      left: ["profile", "settings"],
      right: ["sessions", "status", "side-panel"],
    } satisfies TitlebarLayout
    const result = moveToSlot(layout, "profile", "right", 1)
    expect(result.left).toEqual(["settings"])
    expect(result.right).toEqual(["sessions", "profile", "status", "side-panel"])
  })

  test("moveToSlot appends to the end when index equals slot length", () => {
    const layout = {
      left: [],
      right: ["sessions", "status", "side-panel", "profile", "settings"],
    } satisfies TitlebarLayout
    const result = moveToSlot(layout, "settings", "left", 0)
    expect(result.left).toEqual(["settings"])
    expect(result.right).toEqual(["sessions", "status", "side-panel", "profile"])
  })
})

describe("mount-point tracker", () => {
  afterEach(() => {
    // Clean up any mount-point divs left in the document by tests
    for (const id of TITLEBAR_CONTROL_IDS) {
      document.getElementById(mountPointId(id))?.remove()
    }
  })

  test("returns a stable element reference for each session-scoped control", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    let tracker!: ReturnType<typeof createMountPointTracker>
    const dispose = createRoot((d) => {
      tracker = createMountPointTracker()
      return d
    })

    // Simulate what TitlebarControlSlot does: create mount-point divs
    for (const id of TITLEBAR_CONTROL_IDS) {
      if (!isSessionScoped(id)) continue
      const el = document.createElement("div")
      el.id = mountPointId(id)
      container.appendChild(el)
    }

    // Tracker must find them
    const sessionsEl = tracker.element("sessions")
    const statusEl = tracker.element("status")
    const sidePanelEl = tracker.element("side-panel")
    expect(sessionsEl).toBe(container.querySelector(`#${mountPointId("sessions")}`))
    expect(statusEl).toBe(container.querySelector(`#${mountPointId("status")}`))
    expect(sidePanelEl).toBe(container.querySelector(`#${mountPointId("side-panel")}`))

    // Non-session-scoped controls return null (they render inline, not as portals)
    expect(tracker.element("profile")).toBeNull()
    expect(tracker.element("settings")).toBeNull()

    dispose()
    container.remove()
  })

  test("returns the same element reference on repeated calls when the DOM is stable", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    let tracker!: ReturnType<typeof createMountPointTracker>
    const dispose = createRoot((d) => {
      tracker = createMountPointTracker()
      return d
    })

    const el = document.createElement("div")
    el.id = mountPointId("sessions")
    container.appendChild(el)

    const ref1 = tracker.element("sessions")
    const ref2 = tracker.element("sessions")
    expect(ref1).toBe(el)
    expect(ref2).toBe(el)

    dispose()
    container.remove()
  })

  test("detects when a mount-point div is replaced and returns the new element", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    let tracker!: ReturnType<typeof createMountPointTracker>
    const dispose = createRoot((d) => {
      tracker = createMountPointTracker()
      return d
    })

    // First element
    const el1 = document.createElement("div")
    el1.id = mountPointId("sessions")
    container.appendChild(el1)
    expect(tracker.element("sessions")).toBe(el1)

    // Simulate the <Show> bug: remove old div, create replacement
    el1.remove()
    const el2 = document.createElement("div")
    el2.id = mountPointId("sessions")
    container.appendChild(el2)

    // Tracker must return the NEW element, not the stale one
    expect(tracker.element("sessions")).toBe(el2)
    expect(tracker.element("sessions")).not.toBe(el1)

    dispose()
    container.remove()
  })
})
