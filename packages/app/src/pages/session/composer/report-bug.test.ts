import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { bugDock } from "./bug-dock"
import { REPORT_BUG_COMMAND, reportBug } from "./report-bug"

// amicode#116: the v2 composer's report-a-bug button. Dock absent/closed →
// post the bridge command (the extension host opens the flow); dock open →
// reveal/re-expand it and post nothing. The dock itself is slice #117, built
// against the bugDock seam — these tests drive the signal directly.
describe("reportBug", () => {
  afterEach(() => bugDock.close())

  test("posts exactly one amicode.reportBug bridge message when no dock is open", () => {
    const spy = spyOn(window.parent, "postMessage").mockImplementation(() => {})
    try {
      reportBug()
      expect(spy).toHaveBeenCalledTimes(1)
      // Same envelope contract as postAmicode — chat_panel.ts relays only
      // allowlisted commands, so the shape and command string are load-bearing.
      const [message, targetOrigin] = spy.mock.calls[0] as unknown as [unknown, unknown]
      expect(message).toEqual({ source: "amicode", kind: "command", command: REPORT_BUG_COMMAND })
      expect(REPORT_BUG_COMMAND).toBe("amicode.reportBug")
      expect(targetOrigin).toBe("*")
    } finally {
      spy.mockRestore()
    }
  })
})
