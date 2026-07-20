// Static UI assets the browser fetches without app-managed credentials, e.g.
// the manifest link in <head>. These bypass auth so the page can install/render
// the manifest icons even when a server password is configured.
export const PUBLIC_UI_PATHS = new Set<string>([
  "/site.webmanifest",
  "/web-app-manifest-192x192.png",
  "/web-app-manifest-512x512.png",
  // Widget frames are iframe DOCUMENT requests — they cannot carry a
  // credential (same constraint as the /assets/ sub-resources below). The
  // served document embeds only registry widget code + the frame runtime
  // (its CSP is default-src 'none'; data arrives via the mediated postMessage
  // bridge after boot), so it is public-shell class within the same-user
  // trust model. The widget registry route (/amicode/widgets) stays authed.
  "/amicode/widget-frame",
  // The amico brain ("amico is thinking") is the same constraint class: an
  // iframe DOCUMENT request from the session timeline (brain-strip.tsx) plus
  // its one external script — neither can carry ?auth_token= or a Basic
  // header, so with a password armed the brain rendered a blank 401 frame.
  // Both are static shipped app content (the script bakes only the prototype
  // sample atlas; live session data arrives via postMessage after load), so
  // they are public-shell class. The API surface stays fully authed.
  "/brain.html",
  "/brain.js",
])

// The app shell's fingerprinted bundles live under /assets/. They are plain
// <script src>/<link href> sub-resource fetches — the browser cannot attach
// ?auth_token= or a Basic header to them, so gating them behind server auth
// blanks the whole UI whenever a password is set (the document authenticates,
// its own bundle 401s). The compiled, content-hashed shell carries no secrets;
// the API surface stays fully authed. GET-only, exact prefix.
const PUBLIC_UI_PREFIX = "/assets/"

export function isPublicUIPath(method: string, pathname: string) {
  return method === "GET" && (PUBLIC_UI_PATHS.has(pathname) || pathname.startsWith(PUBLIC_UI_PREFIX))
}
