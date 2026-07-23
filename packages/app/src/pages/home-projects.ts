// amicode#203: project-first dashboard logic — pure helpers for the Projects
// menu and the New-project creation flow. Kept vscode/solid-free so it unit-
// tests headless (the home.tsx consumer wires these to the SDK + dialogs).

/** Slugify a project name into a folder basename: lowercase, whitespace and
 *  underscores to hyphens, drop anything outside [a-z0-9-], collapse repeats,
 *  trim leading/trailing hyphens. */
export function projectNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export type CreationTarget =
  | { ok: true; slug: string; path: string }
  | { ok: false; reason: "empty-name" }

/** Resolve the target directory for a new project from its name + parent.
 *  Collision/permission are RUNTIME outcomes (see classifyCreateError) — this
 *  only rejects a name that slugifies to nothing. */
export function resolveCreationTarget(input: { name: string; parentDir: string }): CreationTarget {
  const slug = projectNameToSlug(input.name)
  if (!slug) return { ok: false, reason: "empty-name" }
  const sep = input.parentDir.endsWith("/") ? "" : "/"
  return { ok: true, slug, path: `${input.parentDir}${sep}${slug}` }
}

export type CreateErrorKind = "collision" | "unwritable" | "other"

/** Map a filesystem error (by errno code, else message) to the inline error the
 *  dialog shows. EEXIST is a name collision; permission/read-only/missing-parent
 *  is an unwritable location; anything else is a generic failure. */
export function classifyCreateError(err: { code?: string; message?: string } | undefined): CreateErrorKind {
  const code = (err?.code ?? "").toUpperCase()
  if (code === "EEXIST") return "collision"
  if (code === "EACCES" || code === "EPERM" || code === "EROFS" || code === "ENOENT" || code === "ENOTDIR")
    return "unwritable"
  const msg = (err?.message ?? "").toLowerCase()
  if (msg.includes("exists")) return "collision"
  if (msg.includes("permission") || msg.includes("read-only") || msg.includes("not a directory")) return "unwritable"
  return "other"
}

/** Best-effort git-init: the project is created regardless; a non-ok result
 *  only means change-tracking is unavailable and the caller shows a notice. */
export function gitInitNeedsNotice(result: { ok: boolean }): boolean {
  return !result.ok
}

export type ProjectGroup<P, S> = { project: P; sessions: S[] }
export type OrphanGroup<S> = { directory: string; sessions: S[] }

/** Nest sessions under their project; sessions whose project is unknown become
 *  orphans grouped by directory — NEVER dropped (amicode#203 AC7, replacing the
 *  old drop-on-no-project behavior). Projects keep their input order and appear
 *  even with zero sessions; sessions keep their input order within a group;
 *  orphan groups appear in first-seen order. */
export function groupSessionsByProject<P extends { worktree: string }, S>(input: {
  projects: P[]
  sessions: S[]
  projectOf: (s: S) => P | undefined
  directoryOf: (s: S) => string
}): { projectGroups: ProjectGroup<P, S>[]; orphans: OrphanGroup<S>[] } {
  const byWorktree = new Map<string, ProjectGroup<P, S>>()
  const projectGroups = input.projects.map((project) => {
    const g: ProjectGroup<P, S> = { project, sessions: [] }
    byWorktree.set(project.worktree, g)
    return g
  })
  const orphanMap = new Map<string, OrphanGroup<S>>()
  const orphans: OrphanGroup<S>[] = []
  for (const s of input.sessions) {
    const p = input.projectOf(s)
    const group = p ? byWorktree.get(p.worktree) : undefined
    if (group) {
      group.sessions.push(s)
      continue
    }
    const dir = input.directoryOf(s)
    let og = orphanMap.get(dir)
    if (!og) {
      og = { directory: dir, sessions: [] }
      orphanMap.set(dir, og)
      orphans.push(og)
    }
    og.sessions.push(s)
  }
  return { projectGroups, orphans }
}
