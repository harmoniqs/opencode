import { onCleanup, onMount } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useServerSDK } from "@/context/server-sdk"
import { decode64 } from "@/utils/base64"
import { pathKey } from "@/utils/path-key"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"

// ---------------------------------------------------------------------------
// Module-level state — tracks which worktrees this client created and which
// have already been auto-renamed. Keyed by server scope + directory so
// multiple server connections don't collide.
// ---------------------------------------------------------------------------

const createdWorktrees = new Set<string>()
const renamedWorktrees = new Set<string>()

function scopedKey(scope: ServerScope, directory: string): string {
  return ScopedKey.from(scope, directory)
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Slugify a session title into a filesystem-safe name (max 40 chars). */
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

/** True when the title is the LLM-generated default placeholder. */
export function isDefaultTitle(title: string | undefined): boolean {
  return !title || title.startsWith("New session")
}

// ---------------------------------------------------------------------------
// Tracking: created worktrees
// ---------------------------------------------------------------------------

/** Mark a worktree as created by this client session (eligible for rename). */
export function markWorktreeCreated(scope: ServerScope, directory: string): void {
  createdWorktrees.add(scopedKey(scope, directory))
}

/** Check whether a worktree was created by this client session. */
export function wasCreatedByUs(scope: ServerScope, directory: string): boolean {
  return createdWorktrees.has(scopedKey(scope, directory))
}

/** Remove a worktree from the created tracking set. */
export function clearCreated(scope: ServerScope, directory: string): void {
  createdWorktrees.delete(scopedKey(scope, directory))
}

// ---------------------------------------------------------------------------
// Tracking: renamed worktrees (prevents duplicates)
// ---------------------------------------------------------------------------

/** Mark a worktree as having been renamed (prevent duplicate renames). */
export function markRenamed(scope: ServerScope, directory: string): void {
  renamedWorktrees.add(scopedKey(scope, directory))
}

/** Check whether a worktree has already been renamed. */
export function wasRenamed(scope: ServerScope, directory: string): boolean {
  return renamedWorktrees.has(scopedKey(scope, directory))
}

/** Allow retry after a failed rename. */
export function clearRenamed(scope: ServerScope, directory: string): void {
  renamedWorktrees.delete(scopedKey(scope, directory))
}

// ---------------------------------------------------------------------------
// Test-only reset
// ---------------------------------------------------------------------------

/** @internal Clear all module state — for tests only. */
export function _resetForTesting(): void {
  createdWorktrees.clear()
  renamedWorktrees.clear()
}

// ---------------------------------------------------------------------------
// Hook: auto-rename worktrees from session titles
// ---------------------------------------------------------------------------

/**
 * Watches for `session.renamed` events on worktrees created by this client,
 * slugifies the title, and calls the rename endpoint. On success, handles
 * `worktree.renamed` to update the navigation URL.
 *
 * Mount from both layout roots (layout.tsx and layout-new.tsx).
 */
export function useWorktreeAutoRename() {
  const serverSDK = useServerSDK()
  const navigate = useNavigate()
  const params = useParams()

  onMount(() => {
    // The event type union is SDK-generated and may not include newly added
    // event types (worktree.renamed, session.renamed) until the next codegen.
    // Extract the type as a plain string to avoid a strict-union comparison error.
    const eventType = (event: { details?: { type?: string } }) => event.details?.type

    const unsub = serverSDK().event.listen((event) => {
      // ---------------------------------------------------------------
      // 1. session.renamed → trigger rename for worktrees we created
      // ---------------------------------------------------------------
      if (eventType(event) === "session.renamed") {
        const props = event.details!.properties as { sessionID: string; title: string }
        const directory = event.name as string
        const title = props.title
        const scope = serverSDK().scope

        // Guard: only for worktrees we created
        if (!wasCreatedByUs(scope, directory)) return

        // Guard: don't rename twice
        if (wasRenamed(scope, directory)) return

        // Guard: skip default titles
        if (isDefaultTitle(title)) return

        // Slugify the title
        const slug = slugifyTitle(title)
        if (!slug) return

        // Mark as renamed (prevent duplicate renames)
        markRenamed(scope, directory)

        // Call the rename endpoint via raw fetch (the SDK client hasn't
        // generated a typed method for this endpoint yet).
        const renameUrl = new URL("/experimental/worktree/rename", serverSDK().url)
        renameUrl.searchParams.set("directory", directory)

        void fetch(renameUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directory, newName: slug }),
        })
          .then((response) => {
            if (!response.ok) throw new Error(`rename responded ${response.status}`)
            // Clean up the created tracking — the worktree.renamed event handles navigation
            clearCreated(scope, directory)
          })
          .catch((err) => {
            // Non-fatal: the worktree keeps its random name
            clearRenamed(scope, directory) // allow retry on next title change
            console.warn("[worktree-auto-rename] rename failed", { directory, slug, error: err })
          })

        return
      }

      // ---------------------------------------------------------------
      // 2. worktree.renamed → update navigation URL if affected
      // ---------------------------------------------------------------
      if (eventType(event) === "worktree.renamed") {
        const props = event.details!.properties as { name: string; branch?: string; oldDirectory: string }
        const newDirectory = event.name as string
        const oldDirectory = props.oldDirectory

        // If we're currently viewing a session in the old directory, navigate to the new one
        const currentDir = decode64(params.dir)
        if (currentDir && pathKey(currentDir) === pathKey(oldDirectory)) {
          const sessionID = params.id
          if (sessionID) {
            navigate(`/${base64Encode(newDirectory)}/session/${sessionID}`, { replace: true })
          }
        }
      }
    })

    onCleanup(unsub)
  })
}
