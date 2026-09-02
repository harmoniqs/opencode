/**
 * Shared utility: build a flat list of rows from file paths, collapsing
 * single-child directory chains into combined labels (e.g. "src/v2/components"
 * instead of three separate levels).
 *
 * Used by both the Files Changed file picker (review-panel-v2) and the
 * Preview tab's project file tree (session-preview-tab).
 */

export type CollapsedRow = {
  type: "dir" | "file"
  label: string
  path?: string
  depth: number
  /** Depth levels where a vertical guide line should be drawn (ancestor has more siblings) */
  guides: number[]
}

type TreeNode = { children: Map<string, TreeNode>; files: string[] }

/**
 * Build a flat list of rows from an array of relative file paths.
 * Single-child directory chains are collapsed into combined labels.
 * Long collapsed chains (>3 segments) are abbreviated with "/.../".
 */
export function buildCollapsedTree(files: string[], _active?: string): CollapsedRow[] {
  const root: TreeNode = { children: new Map(), files: [] }

  for (const file of files) {
    const parts = file.split("/")
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children.has(parts[i])) {
        node.children.set(parts[i], { children: new Map(), files: [] })
      }
      node = node.children.get(parts[i])!
    }
    node.files.push(file)
  }

  const rows: CollapsedRow[] = []

  function walk(node: TreeNode, depth: number, prefix: string, inheritedGuides: number[]) {
    const dirs = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const nodeFiles = [...node.files].sort((a, b) => {
      const nameA = a.split("/").pop()!
      const nameB = b.split("/").pop()!
      return nameA.localeCompare(nameB)
    })

    const children: Array<{ type: "dir"; name: string; node: TreeNode } | { type: "file"; file: string }> = [
      ...dirs.map(([name, child]) => ({ type: "dir" as const, name, node: child })),
      ...nodeFiles.map((file) => ({ type: "file" as const, file })),
    ]

    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const isLast = i === children.length - 1
      // This row's guides: inherited from parent + current depth if NOT last sibling
      const rowGuides = [...inheritedGuides]
      // Guides for children of this row
      const childGuides = isLast ? [...inheritedGuides] : [...inheritedGuides, depth]

      if (child.type === "dir") {
        let collapsed = child.name
        let current = child.node
        while (current.children.size === 1 && current.files.length === 0) {
          const [nextName, nextChild] = [...current.children.entries()][0]
          collapsed += "/" + nextName
          current = nextChild
        }

        let label = collapsed
        const collapsedParts = collapsed.split("/")
        if (collapsedParts.length > 3) {
          label = collapsedParts[0] + "/.../" + collapsedParts[collapsedParts.length - 1]
        }

        rows.push({ type: "dir", label: label + "/", depth, guides: rowGuides })
        walk(current, depth + 1, prefix + collapsed + "/", childGuides)
      } else {
        const filename = child.file.split("/").pop()!
        rows.push({ type: "file", label: filename, path: child.file, depth, guides: rowGuides })
      }
    }
  }

  walk(root, 0, "", [])
  return rows
}

/**
 * Filter collapsed tree rows by a case-insensitive substring match on
 * file path or name. Returns only file rows (and their ancestor dirs)
 * that match the query.
 */
export function filterCollapsedTree(files: string[], query: string): string[] {
  if (!query.trim()) return files
  const q = query.toLowerCase()
  return files.filter((f) => f.toLowerCase().includes(q))
}
