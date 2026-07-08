import { For, Match, Show, Switch, createResource, createSignal } from "solid-js"
import { amicodeImageBridge } from "./image-bridge"

// AMICODE: native image rendering for tool output. Scripts print marker lines
//   AMICODE_IMAGE: <project-relative-path>
// and any completed tool part whose output carries them gets an image strip
// under its card — the same marker-line idiom as AMICODE_ITER/AMICODE_PULSE.
// Images are fetched through the image bridge (GET /file/content, base64).

const MARKER = /^AMICODE_IMAGE:\s*(.+?)\s*$/
const EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i
const MAX_IMAGES = 6

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
}

/** Pure: extract deduped, extension-safe image paths from tool output. */
export function parseImageMarkers(output: unknown): string[] {
  if (typeof output !== "string" || output.length === 0) return []
  const seen = new Set<string>()
  for (const line of output.split("\n")) {
    const match = MARKER.exec(line)
    if (!match) continue
    const path = match[1]
    // Project-relative only: reject absolute paths and parent traversal so a
    // marker can never read outside the session's project directory.
    if (path.startsWith("/") || path.includes("..")) continue
    if (!EXTENSIONS.test(path)) continue
    seen.add(path)
    if (seen.size >= MAX_IMAGES) break
  }
  return [...seen]
}

function dataUri(path: string, base64: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase()
  return `data:${MIME[ext] ?? "application/octet-stream"};base64,${base64}`
}

function Figure(props: { path: string }) {
  const [expanded, setExpanded] = createSignal(false)
  const [content] = createResource(
    () => ({ bridge: amicodeImageBridge(), path: props.path }),
    async ({ bridge, path }) => (bridge ? await bridge.read(path) : undefined),
  )

  const toggle = () => setExpanded((prior) => !prior)

  return (
    <figure
      data-slot="amicode-image"
      data-path={props.path}
      style={{ margin: "0", display: "flex", "flex-direction": "column", gap: "4px", "min-width": "0" }}
    >
      <Switch>
        <Match when={content.loading}>
          {/* Reserved-height skeleton: no layout shift when the image lands. */}
          <div
            style={{
              height: "120px",
              "border-radius": "8px",
              border: "1px solid var(--v2-border-border-base)",
              background: "var(--v2-background-bg-layer-01)",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              "font-size": "11px",
              color: "var(--v2-text-text-faint)",
            }}
          >
            loading {props.path}…
          </div>
        </Match>
        <Match when={content() !== undefined}>
          <img
            src={dataUri(props.path, content()!)}
            alt={props.path}
            role="button"
            tabindex="0"
            aria-label={`${expanded() ? "collapse" : "expand"} ${props.path}`}
            onClick={toggle}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              toggle()
            }}
            style={{
              "max-width": "100%",
              "max-height": expanded() ? "none" : "420px",
              width: "auto",
              "object-fit": "contain",
              "align-self": "flex-start",
              "border-radius": "8px",
              border: "1px solid var(--v2-border-border-base)",
              background: "#fff", // charts are authored on light surfaces; keep them legible in dark mode
              cursor: expanded() ? "zoom-out" : "zoom-in",
              transition: "opacity 150ms ease-out",
            }}
          />
        </Match>
        <Match when={!content.loading}>
          <div style={{ "font-size": "11px", color: "var(--v2-text-text-muted)" }}>
            couldn't load {props.path}
          </div>
        </Match>
      </Switch>
      <figcaption
        style={{
          "font-size": "11px",
          "line-height": "16px",
          color: "var(--v2-text-text-muted)",
          "font-family": "var(--font-family-mono, monospace)",
        }}
      >
        {props.path}
      </figcaption>
    </figure>
  )
}

export function AmicodeImageStrip(props: { files: string[] }) {
  return (
    <Show when={props.files.length > 0 && amicodeImageBridge()}>
      <div
        data-component="amicode-image-strip"
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "10px",
          "margin-top": "8px",
          "border-left": "3px solid var(--v2-icon-icon-accent)",
          "padding-left": "12px",
          "max-width": "720px",
        }}
      >
        <For each={props.files}>{(path) => <Figure path={path} />}</For>
      </div>
    </Show>
  )
}
