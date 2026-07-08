import { createSignal } from "solid-js"

// AMICODE: module-level bridge between the app side (which has an SDK client
// that can read project files via GET /file/content) and AmicodeImageStrip
// instances rendered deep inside the message-part dispatch, where no app
// context is reachable. Same pattern as ask-bridge.ts. When no bridge is
// registered (share page, headless), strips render nothing — image markers
// degrade to the plain text already present in the tool output.

export interface ImageBridge {
  /** Read a project-relative file; resolves to base64 content or undefined. */
  read: (path: string) => Promise<string | undefined>
}

const [current, setCurrent] = createSignal<ImageBridge | undefined>(undefined)

export const amicodeImageBridge = current

export function registerAmicodeImageBridge(bridge: ImageBridge): () => void {
  setCurrent(bridge)
  return () => {
    if (current() === bridge) setCurrent(undefined)
  }
}
