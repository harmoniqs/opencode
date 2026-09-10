import { amicoBrainRef, type AmicoBrainRef } from "@opencode-ai/ui/amicode-brain-ref"
import { hasStringToolName } from "./message-part-receipt-guard"

export function messagePartBrainRef(value: unknown, input: Record<string, unknown> = {}): AmicoBrainRef | undefined {
  if (!hasStringToolName(value)) return
  return amicoBrainRef(value.tool, input)
}
