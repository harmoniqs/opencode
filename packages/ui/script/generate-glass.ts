#!/usr/bin/env bun

// Re-derive the AA-floored glass tiers for every bundled chat theme and emit
// the committed CSS (#60). The output is pure derived data — the drift test
// (glass-tokens.test.ts) keeps it byte-identical to generateGlassCss().

import { generateGlassCss } from "../src/amicode/glass-tokens"

const out = import.meta.dir + "/../src/amicode/glass.css"
await Bun.write(out, generateGlassCss())
console.log("Wrote", out)
