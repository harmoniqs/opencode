import { describe, expect, test } from "bun:test"
import { adoptBugReportFlag, bugReportEnabled } from "./amicode-bug-report"

// amicode#116: the report-a-bug button renders only when the extension passes
// the `amicode_bug_report=1` boot param — without it the composer row must be
// untouched. Same adopt-once boot-param convention as amicode-hide-project
// (entry.tsx reads location.search once at boot; the router rewrites the URL
// after, so a live read would flip mid-flight).
describe("amicode bug-report boot param (amicode/opencode#116)", () => {
  test("off without the param; on with amicode_bug_report=1", () => {
    adoptBugReportFlag("?colorScheme=dark")
    expect(bugReportEnabled()).toBe(false)

    adoptBugReportFlag("?amicode_bug_report=1&auth_token=x")
    expect(bugReportEnabled()).toBe(true)
  })

  test("only the exact value 1 enables it", () => {
    adoptBugReportFlag("?amicode_bug_report=0")
    expect(bugReportEnabled()).toBe(false)

    adoptBugReportFlag("?amicode_bug_report=true")
    expect(bugReportEnabled()).toBe(false)

    adoptBugReportFlag("")
    expect(bugReportEnabled()).toBe(false)
  })
})
