import { describe, expect, test } from "bun:test"
import {
  DEFAULT_SIDE_PANEL_TAB_ORDER,
  normalizeSidePanelTabOrder,
  reorderSidePanelTabs,
} from "./layout-side-panel-tabs"

describe("side panel tab order", () => {
  test("normalizes persisted orders without dropping named surfaces", () => {
    expect(normalizeSidePanelTabOrder(["preview", "context", "preview", "unknown"])).toEqual([
      "preview",
      "context",
      "home",
      "review",
      "pulseInspector",
    ])
  })

  test("reorders only the named surface tabs", () => {
    expect(reorderSidePanelTabs(DEFAULT_SIDE_PANEL_TAB_ORDER, "preview", 0)).toEqual([
      "preview",
      "home",
      "review",
      "context",
      "pulseInspector",
    ])
  })
})
