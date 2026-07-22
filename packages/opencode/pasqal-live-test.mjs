// Live Pasqal test for the #194 keychain silent-re-auth workaround.
// Runs the REAL fork-server code paths (submitCredentialResponse /
// revalidateResponse / disconnectResponse) against LIVE Pasqal via the staged
// validator + pasqal_cloud SDK, and the REAL OS keychain. Isolated: token +
// status files go to a temp dir, the keychain uses a "live-test" slot, and
// everything is cleaned up at the end — your real ~/.amico state is untouched.
//
// Driven by pasqal-live-test.sh (which collects the password without echo).
// Credentials arrive via env: PASQAL_LIVE_USER / PASQAL_LIVE_PW / PASQAL_LIVE_PROJECT.
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const user = process.env.PASQAL_LIVE_USER ?? ""
const pw = process.env.PASQAL_LIVE_PW ?? ""
const project = process.env.PASQAL_LIVE_PROJECT ?? ""
if (!user || !pw || !project) {
  console.error("missing PASQAL_LIVE_USER / PASQAL_LIVE_PW / PASQAL_LIVE_PROJECT — run via pasqal-live-test.sh")
  process.exit(2)
}

// Isolate at-rest state to a temp dir BEFORE importing the module (it reads
// these env vars on first use). Keychain is isolated by using a distinct slot.
const dir = mkdtempSync(path.join(tmpdir(), "pasqal-live-"))
process.env.AMICO_PASQAL_FILE = path.join(dir, "pasqal.json")
process.env.AMICODE_CONNECTIONS_FILE = path.join(dir, "connections.json")
// AMICODE_OPS_DIR + AMICO_PYTHON left at defaults so the REAL staged validator
// (~/.amico/amicode/scripts/pasqal-connector/pasqal_validate.py) + pasqal_cloud run.

const { submitCredentialResponse, revalidateResponse, disconnectResponse, PASQAL_SECRET_ACCOUNT } = await import(
  "./src/server/amicode/connections.ts"
)
const { keychainSecretStore, setPasqalSecretStore } = await import("./src/server/amicode/pasqal-secret.ts")

// Re-point the keychain slot to a test account so we never touch "default".
const LIVE_ACCOUNT = "live-test"
setPasqalSecretStore({
  read: (a) => keychainSecretStore.read(a === PASQAL_SECRET_ACCOUNT ? LIVE_ACCOUNT : a),
  write: (a, s) => keychainSecretStore.write(a === PASQAL_SECRET_ACCOUNT ? LIVE_ACCOUNT : a, s),
  clear: (a) => keychainSecretStore.clear(a === PASQAL_SECRET_ACCOUNT ? LIVE_ACCOUNT : a),
})

const line = (b) => JSON.parse(b).connection ?? JSON.parse(b)
const show = (label, b) => {
  const c = line(b)
  console.log(`\n${label}`)
  console.log("  state    :", c.state)
  console.log("  identity :", c.identity ?? "—")
  console.log("  devices  :", (c.devices ?? []).map((d) => d.name).join(", ") || "—")
  console.log("  expires  :", c.expires_at ?? "—")
  if (JSON.parse(b).error) console.log("  note     :", JSON.parse(b).error)
}
const tokenOnDisk = () =>
  existsSync(process.env.AMICO_PASQAL_FILE) ? JSON.parse(readFileSync(process.env.AMICO_PASQAL_FILE, "utf8")).token : null

try {
  console.log("=== #194 live Pasqal test — real validator, real Pasqal, real keychain (isolated) ===")

  // 1) LIVE connect: real ROPC against Pasqal via the staged validator.
  const body = JSON.stringify({ id: "pasqal-cloud", username: user, password: pw, project_id: project })
  show("1) Connect (live password grant)", await submitCredentialResponse(body))
  const t1 = tokenOnDisk()
  const stored = keychainSecretStore.read(LIVE_ACCOUNT)
  console.log("  token minted & on disk:", t1 ? `yes (${t1.slice(0, 6)}…, ${t1.length} chars)` : "NO")
  console.log("  password in keychain  :", stored ? `yes (${stored.username})` : "NO")
  if (!t1) {
    console.log("\nConnect did not mint a token — check the credentials/project and the validator output above.")
    process.exit(1)
  }

  // 2) Force the token expired on disk, then revalidate → SILENT RE-MINT (a
  //    second real ROPC from the keychain password, no prompt).
  const cred = JSON.parse(readFileSync(process.env.AMICO_PASQAL_FILE, "utf8"))
  cred.expires_at = "2020-01-01T00:00:00+00:00"
  ;(await import("node:fs")).writeFileSync(process.env.AMICO_PASQAL_FILE, JSON.stringify(cred))
  console.log("\n2) Forced token expiry on disk (simulating the ~24h lapse)…")
  show("   Revalidate (silent re-mint from keychain)", await revalidateResponse(JSON.stringify({ id: "pasqal-cloud" })))
  const t2 = tokenOnDisk()
  console.log("  token re-minted:", t2 && t2 !== cred.token ? "yes (fresh token, no prompt)" : t2 ? "same value returned" : "NO")
  console.log("  → this is the workaround: an expired token renewed itself with zero user interaction.")

  // 3) Disconnect wipes the keychain slot.
  show("3) Disconnect", disconnectResponse(JSON.stringify({ id: "pasqal-cloud" })))
  console.log("  keychain after disconnect:", keychainSecretStore.read(LIVE_ACCOUNT) ?? "wiped ✓")
  console.log("\n=== done — live connect + silent re-mint + disconnect all exercised ===")
} finally {
  keychainSecretStore.clear(LIVE_ACCOUNT) // belt-and-suspenders: never leave a test secret behind
  rmSync(dir, { recursive: true, force: true })
}
