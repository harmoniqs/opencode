export function hasStringToolName(value: unknown): value is { tool: string } {
  return typeof value === "object" && value !== null && "tool" in value && typeof value.tool === "string"
}
