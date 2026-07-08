import { For, Match, Show, Switch, createResource, createSignal, onCleanup } from "solid-js"
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

/** Pure: foo.png → foo.dark.png (inserted before the final extension). */
export function darkVariant(path: string): string {
  const dot = path.lastIndexOf(".")
  if (dot <= 0) return path
  return `${path.slice(0, dot)}.dark${path.slice(dot)}`
}

// Reactive app color scheme: the boot preload + theme toggle stamp
// data-color-scheme on <html>; watch it so strips re-resolve on toggle.
function createColorScheme() {
  const read = () => (document.documentElement.dataset.colorScheme === "dark" ? "dark" : "light")
  const [scheme, setScheme] = createSignal<"dark" | "light">(read())
  const observer = new MutationObserver(() => setScheme(read()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] })
  onCleanup(() => observer.disconnect())
  return scheme
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
  const scheme = createColorScheme()
  // Theme-matched variant first (foo.dark.png in dark mode), falling back to
  // the authored file. `themed` records whether the variant matched, so the
  // fallback keeps a light backing behind light-surface charts in dark mode.
  const [content] = createResource(
    () => ({ bridge: amicodeImageBridge(), path: props.path, dark: scheme() === "dark" }),
    async ({ bridge, path, dark }) => {
      if (!bridge) return undefined
      if (dark) {
        const variant = await bridge.read(darkVariant(path))
        if (variant !== undefined) return { base64: variant, themed: true }
      }
      const base = await bridge.read(path)
      return base === undefined ? undefined : { base64: base, themed: !dark }
    },
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
            src={dataUri(props.path, content()!.base64)}
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
              // Theme-matched variants carry their own surface; only a light
              // asset shown in dark mode needs a light backing to stay legible.
              background: content()!.themed ? "transparent" : "#fff",
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
