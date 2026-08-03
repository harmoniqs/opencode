// amicode/opencode#116: the report-a-bug button in the v2 composer is a
// fork-only feature, gated on the `amicode_bug_report=1` boot param the
// extension passes — standalone opencode never sets it, so the composer's
// control row stays byte-identical there. Read once at boot from entry.tsx
// (same convention as amicode-hide-project): the router rewrites the URL
// after boot, so a live read of window.location.search would flip mid-flight.
let enabled = false

/** Adopt the boot flag from a URL search string — sets the gate to whether
 *  `amicode_bug_report=1` is present (deterministic, so tests can drive both
 *  directions; entry.tsx calls this exactly once with the real boot URL). */
export function adoptBugReportFlag(search: string): void {
  enabled = new URLSearchParams(search).get("amicode_bug_report") === "1"
}

/** Whether the report-a-bug composer button renders. */
export function bugReportEnabled(): boolean {
  return enabled
}
