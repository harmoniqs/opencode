/**
 * preview-search-utils — Pure helpers for breadcrumb parsing and file search.
 *
 * No SolidJS, no DOM — just string operations for breadcrumb segments and
 * substring search over the cached renderable file set.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BreadcrumbSegment {
  /** Display label for this segment (directory name, or "~" for root). */
  label: string
  /** Full relative path up to and including this segment. Empty string for root. */
  path: string
}

// ---------------------------------------------------------------------------
// Breadcrumb parsing
// ---------------------------------------------------------------------------

/**
 * Parse a relative directory path into clickable breadcrumb segments.
 * Always starts with a root segment ("~" → "").
 *
 * Example: "src/components/session" →
 *   [{ label: "~", path: "" }, { label: "src", path: "src" },
 *    { label: "components", path: "src/components" },
 *    { label: "session", path: "src/components/session" }]
 */
export function parseBreadcrumbSegments(currentPath: string): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [{ label: "~", path: "" }]

  if (!currentPath) return segments

  const parts = currentPath.split("/")
  for (let i = 0; i < parts.length; i++) {
    segments.push({
      label: parts[i],
      path: parts.slice(0, i + 1).join("/"),
    })
  }

  return segments
}

// ---------------------------------------------------------------------------
// File search
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string so it can be used as a literal
 * pattern in a RegExp constructor.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Filter renderable file paths by substring match (case-insensitive).
 * Returns empty array for empty query (intentional — don't show all files
 * when the user hasn't typed anything).
 */
export function searchRenderableFiles(query: string, paths: string[]): string[] {
  if (!query) return []

  const escaped = escapeRegex(query)
  const pattern = new RegExp(escaped, "i")

  return paths.filter((path) => pattern.test(path))
}
