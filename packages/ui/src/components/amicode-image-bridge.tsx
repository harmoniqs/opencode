// AMICODE: re-export shim so packages/app imports resolve through the existing
// "./*": "./src/components/*.tsx" export wildcard (same pattern as the rail).
export { registerAmicodeImageBridge, amicodeImageBridge, type ImageBridge } from "../amicode/image-bridge"
