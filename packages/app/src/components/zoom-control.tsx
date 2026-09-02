import { createSignal, type Accessor, type Setter } from "solid-js"

// ─── Zoom state hook ────────────────────────────────────────────────────────

export interface ZoomState {
  zoom: Accessor<number>
  setZoom: Setter<number>
  zoomIn: () => void
  zoomOut: () => void
}

/**
 * Create an independent zoom state. Each tab/panel gets its own instance
 * so zoom levels don't bleed across contexts.
 */
export function createZoomState(initial = 100, min = 50, max = 200, step = 10): ZoomState {
  const [zoom, setZoom] = createSignal(initial)
  return {
    zoom,
    setZoom,
    zoomIn: () => setZoom((z) => Math.min(z + step, max)),
    zoomOut: () => setZoom((z) => Math.max(z - step, min)),
  }
}

// ─── Zoom control component ─────────────────────────────────────────────────

export interface ZoomControlProps {
  zoom: Accessor<number>
  setZoom: Setter<number>
  zoomIn: () => void
  zoomOut: () => void
  min?: number
  max?: number
}

/**
 * Compact zoom control widget: [100% | − +]
 * Renders an editable percentage input with decrement/increment buttons.
 */
export function ZoomControl(props: ZoomControlProps) {
  const min = () => props.min ?? 50
  const max = () => props.max ?? 200

  return (
    <div class="shrink-0 flex items-center h-7 rounded-md border border-border-base overflow-hidden">
      <input
        type="text"
        class="w-11 h-full text-center text-12-regular text-text-base bg-transparent outline-none"
        value={`${props.zoom()}%`}
        onInput={(e) => {
          const val = parseInt(e.currentTarget.value)
          if (!isNaN(val) && val >= min() && val <= max()) props.setZoom(val)
        }}
        onBlur={(e) => {
          e.currentTarget.value = `${props.zoom()}%`
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur()
          }
        }}
      />
      <div class="flex items-center border-l border-border-base">
        <button
          class="flex items-center justify-center w-5 h-full text-text-weak hover:text-text-base hover:bg-background-stronger transition-colors"
          onClick={props.zoomOut}
          aria-label="Zoom out"
        >
          <span class="text-12-medium leading-none">−</span>
        </button>
        <button
          class="flex items-center justify-center w-5 h-full text-text-weak hover:text-text-base hover:bg-background-stronger transition-colors -ml-0.5"
          onClick={props.zoomIn}
          aria-label="Zoom in"
        >
          <span class="text-12-medium leading-none">+</span>
        </button>
      </div>
    </div>
  )
}
