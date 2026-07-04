// AMICODE: re-export shim (the `"./*": "./src/components/*.tsx"` wildcard) —
// the app also needs the wire parser + label helper this dialog renders from.
export { AmicodeEntityView } from "../amicode/entity-view"
export { entityLabel } from "../amicode/receipt"
export { parseProblemResponse, type ProblemView } from "../amicode/problem"
