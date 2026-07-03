// AMICODE: pure helper mapping amicode_* tool names to interview-stage labels.
// Kept JSX-free so it is directly testable under `bun test` (repo idiom:
// message-part.test.ts / message-part-text.ts).

const STAGES: Record<string, string> = {
  amicode_pick_system: "System",
  amicode_set_model: "Model",
  amicode_formulate: "Formulation",
  amicode_solve: "Run",
}

export function amicodeStage(tool: string) {
  const known = STAGES[tool]
  if (known) return known
  const raw = tool.replace(/^amicode_/, "").replaceAll("_", " ")
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : tool
}
