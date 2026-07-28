// Did an assistant turn produce anything the USER can see?
//
// Extracted from the prompt loop so the rule is unit-testable: the loop's
// decision to end a turn hinges on it, and getting it wrong strands the user
// mid-conversation (see the silent-turn guard in prompt.ts).
//
// The distinction that matters: `reasoning` parts are the model THINKING, not
// output. A turn of step-start → reasoning → step-finish looks complete to the
// transport (it even carries a finish reason) but says nothing to the user, so
// treating it as a finished answer ends the turn mid-thought. Open-weight models
// emit these routinely.

/** The part shapes this rule cares about. Structural on purpose — it accepts any
 *  superset, so callers can pass the full SessionV1 part union unchanged. */
export interface TurnPartLike {
  type: string
  text?: string
}

/** True when at least one part is user-visible output: non-empty text, or a tool
 *  call that actually ran. `reasoning` / `step-*` / empty text never count.
 *
 *  @param isOrphaned optional predicate to exclude interrupted tool calls — the
 *  loop passes its own so cleanup-marked orphans aren't mistaken for real work. */
export function producedUserVisibleOutput<T extends TurnPartLike>(
  parts: readonly T[] | undefined,
  isOrphaned: (part: T) => boolean = () => false,
): boolean {
  return (
    parts?.some(
      (part) =>
        (part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") ||
        (part.type === "tool" && !isOrphaned(part)),
    ) ?? false
  )
}
