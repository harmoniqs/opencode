// AMICODE: re-export shim so packages/app can import the getting-started block
// through the existing `"./*": "./src/components/*.tsx"` export wildcard
// without touching packages/ui/package.json. Logic lives in
// ../amicode/getting-started.tsx.
export { AmicodeGettingStarted, AMICODE_STARTERS } from "../amicode/getting-started"
