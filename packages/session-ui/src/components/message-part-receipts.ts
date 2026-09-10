import type { Part as PartType } from "@opencode-ai/sdk/v2"
import { parseDiffSentinel } from "@opencode-ai/ui/amicode-receipt"
import { receiptRunKey, type ReceiptKey } from "@opencode-ai/ui/amicode-receipt-runs"

// Only completed amicode tool calls with a parseable receipt can be collapsed.
export function amicodeReceiptCandidateKey(part: PartType | undefined): { key?: ReceiptKey; seq?: number } {
  if (!part || part.type !== "tool" || typeof part.tool !== "string" || !part.tool.startsWith("amicode_")) return {}
  if (part.state.status !== "completed") return {}
  const sentinel = parseDiffSentinel(part.state.output)
  return { key: receiptRunKey(sentinel), seq: sentinel?.seq }
}
