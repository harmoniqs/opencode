// AMICODE: Connections routes data source (amicode#165 / parent #159, ADR
// 0002) — Company Compute connect path. Probe-first validation: a submitted
// key is classified against the solve service's fake-task status route BEFORE
// anything touches disk; only auth-passed classes write through the #162
// CredentialStore seam. SECURITY: secrets ride POST bodies and Authorization
// headers ONLY — never URLs, never query params, never error messages or
// logs. Every status response is built through a redacting whitelist parser,
// so no input (cache file, in-memory state) can leak a token into a body.
export type ProbeOutcome = "valid" | "invalid" | "unreachable"

/** Injectable fetch seam — tests stub this; production uses global fetch.
 *  Only the status code matters to classification. */
export type FetchImpl = (
  url: string,
  init: { method: "GET"; headers: Record<string, string> },
) => Promise<{ status: number }>

const PROBE_PATH = "/solves/__validate__/status"

/** Classify a Company Compute credential against the fake-task status route
 *  (parent #159 probe contract: the authorizer rejects bad keys before the
 *  handler; good keys reach the handler's not-found/forbidden).
 *    401                → invalid      (authorizer rejected the key)
 *    2xx / 403 / 404    → valid        (key got past the authorizer)
 *    anything else      → unreachable  (service or network trouble)
 *  The token rides the Authorization header ONLY — never the URL. */
export async function probeCompanyCompute(
  baseUrl: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ProbeOutcome> {
  const url = baseUrl.replace(/\/+$/, "") + PROBE_PATH
  let status: number
  try {
    status = (await fetchImpl(url, { method: "GET", headers: { authorization: `Bearer ${token}` } })).status
  } catch {
    return "unreachable"
  }
  if (status === 401) return "invalid"
  if ((status >= 200 && status < 300) || status === 403 || status === 404) return "valid"
  return "unreachable"
}
