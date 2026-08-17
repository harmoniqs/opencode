# ADR 0005: Server Boot-ID and SSE Connection Resilience

## Status

Accepted

## Context

The opencode web app (`packages/app`) connects to the local server via
Server-Sent Events (SSE). When the server restarts — due to a container rebuild,
explicit restart command, or process crash — the SSE stream disconnects and the
client retries every 250 ms.

The fundamental issue is an asymmetry in persistence lifetimes: the webview's
localStorage lives on the **host machine** (or in VS Code Server's profile storage)
and survives container rebuilds, process restarts, and window reloads. The server
port, however, is **ephemeral** — determined at startup by whichever port happens
to be free. There is no stable identity linking "this localStorage scope" to "this
server instance." The extension host is the only component that knows the correct
server URL at all times (it spawned the process), making it the authoritative
source for runtime connection parameters. The webview should receive these from the
host, not persist and re-read them independently.

Three problems existed:

1. **No restart detection**: the `server.connected` SSE event carried
   `properties: {}`. The client could not distinguish "same server, reconnected"
   from "different server boot on the same port" from "stale URL, server gone."

2. **Stale URL persistence**: the web app persisted a `defaultServerUrl` in
   localStorage that could override `location.origin`. In the Amicode webview
   (iframe), `location.origin` is always correct — the override caused the SSE
   loop to connect to a dead port indefinitely.

3. **Infinite retry burn**: the SSE reconnect loop retried forever with no
   escalation. A genuinely unreachable server consumed CPU and produced no user
   feedback.

## Decision

### Server-side: boot-ID generation

- A new module `src/server/boot-id.ts` generates a `crypto.randomUUID()` on each
  `Server.listen()` call and exports it via `BootId.get()`.
- Both SSE handlers (instance at `/api/event` and global at `/global/event`) emit
  `{ bootId: BootId.get() }` in the `server.connected` event's `properties`.
- Each `listen()` call (including restarts) produces a fresh ID.

### Client-side: stale URL prevention

- In `entry.tsx`, the `getDefaultUrl()` function is gated: when running inside
  the Amicode webview (`inAmicode()`), the `defaultServerUrl` localStorage key is
  never consulted. `location.origin` is used unconditionally.

### Client-side: reconnect escalation

- A `consecutiveFailures` counter in `server-sdk.tsx` tracks connection failures.
- After 10 consecutive failures (2.5 seconds), the SSE loop breaks with a warning
  log. The `streamStatus` signal remains `"disconnected"` — the ConnectionBanner
  surfaces this to the user.
- A page visibility cycle (`pagehide` → `pageshow`) restarts the loop, providing
  a user-initiated recovery path.

### Client-side: boot-ID persistence and mismatch detection

- The server store (`packages/app/src/context/server.tsx`) gains a
  `lastBootId: Record<string, string>` field, persisted in localStorage alongside
  the existing server list and project state.
- On each `server.connected` event, the client extracts `properties.bootId`,
  compares it to the persisted value, logs a warning on mismatch, and persists the
  new value.
- The existing `server-sync.tsx` logic already triggers a full refresh (session
  list refetch, directory re-bootstrap) on `server.connected` — the boot-ID
  mismatch log provides additional observability for debugging.

## Consequences

- Servers that restart on the same port (the common case with
  `amicode.opencodePort = 43117`) reconnect seamlessly: the SSE loop retries,
  connects, receives the new boot-ID, and triggers a refresh.
- Servers on a different port after restart are handled by the extension host's
  panel-recreation mechanism (see amicode ADR 0008).
- The 10-failure abort prevents infinite CPU burn on genuinely unreachable servers.
- Future: the abort will be upgraded to self-healing (post `server-url-changed` to
  self and redirect) once Phase 4's `AmicodeServerBridge` listener is stable.
- The `lastBootId` persistence enables detecting restarts that happened while the
  webview was closed — on next open, the first `server.connected` event's boot-ID
  won't match, and the full refresh path fires.

## Alternatives Considered

### Boot-ID as HTTP response header on all responses

Adding `X-OpenCode-Boot-ID` to every HTTP response via a global middleware. This
would benefit non-SSE clients (REST API callers, CLI) but adds middleware
complexity with no immediate gain for the webview client, which connects
exclusively via SSE. The `BootId` module is importable by any future middleware
should this be needed.

### Self-healing reconnect via postMessage

After the failure threshold, the SSE loop posts a `server-url-changed` message to
itself, which the `AmicodeServerBridge` handles by updating the server store and
reconnecting. This provides seamless recovery without user intervention. Deferred
until Phase 4's bridge is validated — documented in
`plans/followup-self-healing-reconnect.md`.

### Forced page reload on failure threshold

Calling `window.location.reload()` after 10 consecutive failures. Guarantees
recovery (Phase 2 ensures the fresh load uses `location.origin`) but loses all
in-memory state (open editors, scroll positions, draft prompts). Rejected as too
disruptive for a recoverable failure.

### Port 0 (OS-assigned) with readback

Changing the extension to pass port `0` and read back the actual bound port from
the server's response. Eliminates port collisions but requires restructuring the
terminal launch protocol and does not address the stale-URL problem (the webview
still needs to discover the new port). Deferred — the fixed-port default (43117)
is the primary mitigation.
