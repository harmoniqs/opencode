import { describe, expect, test } from "bun:test"
import type { QuestionRequest } from "@opencode-ai/sdk/v2"
import {
  createQuestionBodyState,
  questionConfirm,
  questionCustom,
  questionHint,
  questionOther,
  questionReject,
  questionSave,
  questionSelect,
  questionSetSelected,
  questionStoreCustom,
  questionSubmit,
  questionSync,
  questionText,
  questionTotal,
} from "@/cli/cmd/run/question.shared"

function req(input: Partial<QuestionRequest> = {}): QuestionRequest {
  return {
    id: "question-1",
    sessionID: "session-1",
    questions: [
      {
        question: "Mode?",
        header: "Mode",
        options: [{ label: "chunked", description: "Incremental output" }],
        multiple: false,
      },
    ],
    ...input,
  }
}

describe("run question shared", () => {
  test("replies immediately for a single-select question", () => {
    const out = questionSelect(createQuestionBodyState("question-1"), req())

    expect(out.reply).toEqual({
      requestID: "question-1",
      answers: [["chunked"]],
    })
  })

  test("advances multi-question flows and submits from confirm", () => {
    const ask = req({
      questions: [
        {
          question: "Mode?",
          header: "Mode",
          options: [{ label: "chunked", description: "Incremental output" }],
          multiple: false,
        },
        {
          question: "Output?",
          header: "Output",
          options: [
            { label: "yes", description: "Show tool output" },
            { label: "no", description: "Hide tool output" },
          ],
          multiple: false,
        },
      ],
    })

    let state = questionSelect(createQuestionBodyState("question-1"), ask).state
    expect(state.tab).toBe(1)

    state = questionSetSelected(state, 1)
    state = questionSelect(state, ask).state
    expect(questionConfirm(ask, state)).toBe(true)
    expect(questionSubmit(ask, state)).toEqual({
      requestID: "question-1",
      answers: [["chunked"], ["no"]],
    })
  })

  test("toggles answers for multiple-choice questions", () => {
    const ask = req({
      questions: [
        {
          question: "Tags?",
          header: "Tags",
          options: [{ label: "bug", description: "Bug fix" }],
          multiple: true,
        },
      ],
    })

    let state = questionSelect(createQuestionBodyState("question-1"), ask).state
    expect(state.answers).toEqual([["bug"]])

    state = questionSelect(state, ask).state
    expect(state.answers).toEqual([[]])
  })

  test("stores and submits custom answers", () => {
    let state = questionSetSelected(createQuestionBodyState("question-1"), 1)
    let next = questionSelect(state, req())
    expect(next.state.editing).toBe(true)

    state = questionStoreCustom(next.state, 0, "  custom mode  ")
    next = questionSave(state, req())
    expect(next.reply).toEqual({
      requestID: "question-1",
      answers: [["custom mode"]],
    })
  })

  test("a text-kind question renders no options and no pseudo-option", () => {
    const ask = req({
      questions: [
        {
          question: "What should we call you?",
          header: "Name",
          options: [],
          kind: "text",
        },
      ],
    })
    const state = createQuestionBodyState("question-1")

    expect(questionText(ask, state)).toBe(true)
    expect(questionTotal(ask, state)).toBe(0)
    expect(questionOther(ask, state)).toBe(false)
    expect(questionCustom(ask, state)).toBe(false)
    expect(questionSelect(state, ask).state).toBe(state)
  })

  test("a text-kind question submits typed text through the custom-answer path", () => {
    const ask = req({
      questions: [
        {
          question: "What should we call you?",
          header: "Name",
          options: [],
          kind: "text",
        },
      ],
    })

    const state = questionStoreCustom(createQuestionBodyState("question-1"), 0, "  JJ  ")
    const next = questionSave(state, ask)
    expect(next.reply).toEqual({
      requestID: "question-1",
      answers: [["JJ"]],
    })
  })

  test("a text-kind question does not submit empty text", () => {
    const ask = req({
      questions: [
        {
          question: "What should we call you?",
          header: "Name",
          options: [],
          kind: "text",
        },
      ],
    })

    const next = questionSave(createQuestionBodyState("question-1"), ask)
    expect(next.reply).toBeUndefined()
    expect(next.state.editing).toBe(true)
    expect(next.state.answers[0] ?? []).toEqual([])
    expect(questionHint(ask, next.state)).toBe("enter submit   esc dismiss")
  })

  test("a choice question without kind keeps its options and pseudo-option", () => {
    const state = createQuestionBodyState("question-1")
    const ask = req()

    expect(questionText(ask, state)).toBe(false)
    expect(questionTotal(ask, state)).toBe(2)
    expect(questionCustom(ask, state)).toBe(true)
  })

  test("a choice question with custom disabled shows no pseudo-option", () => {
    const state = createQuestionBodyState("question-1")
    const ask = req({
      questions: [
        {
          question: "Mode?",
          header: "Mode",
          options: [{ label: "chunked", description: "Incremental output" }],
          multiple: false,
          custom: false,
        },
      ],
    })

    expect(questionTotal(ask, state)).toBe(1)
    expect(questionOther(ask, state)).toBe(false)
  })

  test("resets state when the request id changes and builds reject payloads", () => {
    const state = questionSetSelected(createQuestionBodyState("question-1"), 1)

    expect(questionSync(state, "question-1")).toBe(state)
    expect(questionSync(state, "question-2")).toEqual(createQuestionBodyState("question-2"))
    expect(questionReject(req())).toEqual({
      requestID: "question-1",
    })
  })
})
