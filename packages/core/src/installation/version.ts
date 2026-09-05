declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
  const OPENCODE_SHA: string
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
// The git sha the binary was built from — "unknown" outside a release build
// (the define is only set by script/build.ts). Carried in the boot parity
// record; the comparison itself is tag-based (dist-tags carry versions).
export const InstallationSha = typeof OPENCODE_SHA === "string" ? OPENCODE_SHA : "unknown"
export const InstallationLocal = InstallationChannel === "local"
