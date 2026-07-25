// AMICODE: re-export shim so packages/app can import the brain atmosphere
// through the existing `"./*": "./src/components/*.tsx"` export wildcard
// without touching packages/ui/package.json. Logic lives in
// ../amicode/brain-atmosphere.tsx.
export * from "../amicode/brain-atmosphere"
