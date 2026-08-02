/** @jsxImportSource @opentui/solid */
import { TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import type { QuestionRequest } from "@opencode-ai/sdk/v2"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

// Render coverage for the question card shapes (amicode#245): a Free-form
// Question (kind: "text") renders a text card — the header plus a bare text
// input with submit, no option rows and no "Type your own answer"
// pseudo-option — and its answer resolves through the typed-custom-answer
// path. A Choice Question renders its options, with the pseudo-option only
// when the question allows a custom answer.

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

type Captured = { pathname: string; body: unknown }

async function mountQuestion(input: { root: string; request: QuestionRequest; captured: Captured[] }) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (req.method === "POST") {
        input.captured.push({ pathname: url.pathname, body: await req.json().catch(() => null) })
        return Response.json(true)
      }
      return new Response("not found", { status: 404 })
    },
  })

  const [
    { ThemeProvider },
    { TuiConfigProvider },
    { KVProvider },
    { SDKProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
    { QuestionPrompt },
  ] = await Promise.all([
    import("../../../src/context/theme"),
    import("../../../src/config"),
    import("../../../src/context/kv"),
    import("../../../src/context/sdk"),
    import("../../../src/keymap"),
    import("../../../src/routes/session/question"),
  ])

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({ leader_timeout: 1000 })
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)

    return (
      <TestTuiContexts
        directory={input.root}
        paths={{
          home: input.root,
          state,
          worktree: input.root,
        }}
      >
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={resolvedConfig}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <SDKProvider url={`http://127.0.0.1:${server.port}`} events={{ subscribe: async () => () => {} }}>
                  <QuestionPrompt request={input.request} directory={input.root} />
                </SDKProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { kittyKeyboard: true })
  return {
    app,
    async cleanup() {
      app.renderer.destroy()
      server.stop(true)
    },
  }
}

const textRequest: QuestionRequest = {
  id: "que_text",
  sessionID: "ses_test",
  questions: [
    {
      question: "What should we call you?",
      header: "Name",
      options: [],
      kind: "text",
    },
  ],
}

const choiceRequest: QuestionRequest = {
  id: "que_choice",
  sessionID: "ses_test",
  questions: [
    {
      question: "Which environment?",
      header: "Env",
      options: [
        { label: "local-sim", description: "Local simulation" },
        { label: "qick-lab", description: "The QICK lab" },
      ],
    },
  ],
}

test("a free-form question renders a text card — no option rows, no pseudo-option", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion({ root: tmp.path, request: textRequest, captured: [] })

  try {
    await wait(() => prompt.app.captureCharFrame().includes("What should we call you?"))
    const frame = prompt.app.captureCharFrame()
    expect(frame).not.toContain("Type your own answer")
    expect(frame).not.toContain("local-sim")
    await wait(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)
  } finally {
    await prompt.cleanup()
  }
})

test("a text card submits the typed answer through the custom-answer path", async () => {
  await using tmp = await tmpdir()
  const captured: Captured[] = []
  const prompt = await mountQuestion({ root: tmp.path, request: textRequest, captured })

  try {
    await wait(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)

    await prompt.app.mockInput.typeText("JJ Lee")
    prompt.app.mockInput.pressEnter()

    await wait(() => captured.some((item) => item.pathname === "/question/que_text/reply"))
    const reply = captured.find((item) => item.pathname === "/question/que_text/reply")
    expect(reply?.body).toEqual({ answers: [["JJ Lee"]] })
  } finally {
    await prompt.cleanup()
  }
})

test("a text card does not submit empty text", async () => {
  await using tmp = await tmpdir()
  const captured: Captured[] = []
  const prompt = await mountQuestion({ root: tmp.path, request: textRequest, captured })

  try {
    await wait(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)

    prompt.app.mockInput.pressEnter()
    await Bun.sleep(300)
    expect(captured.filter((item) => item.pathname === "/question/que_text/reply")).toEqual([])
  } finally {
    await prompt.cleanup()
  }
})

test("a choice question renders its options and the typed-custom-answer row", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountQuestion({ root: tmp.path, request: choiceRequest, captured: [] })

  try {
    await wait(() => prompt.app.captureCharFrame().includes("Which environment?"))
    const frame = prompt.app.captureCharFrame()
    expect(frame).toContain("local-sim")
    expect(frame).toContain("qick-lab")
    expect(frame).toContain("Type your own answer")
  } finally {
    await prompt.cleanup()
  }
})

test("a choice question with custom disabled renders no pseudo-option", async () => {
  await using tmp = await tmpdir()
  const request: QuestionRequest = {
    ...choiceRequest,
    questions: [{ ...choiceRequest.questions[0], custom: false }],
  }
  const prompt = await mountQuestion({ root: tmp.path, request, captured: [] })

  try {
    await wait(() => prompt.app.captureCharFrame().includes("Which environment?"))
    const frame = prompt.app.captureCharFrame()
    expect(frame).toContain("local-sim")
    expect(frame).not.toContain("Type your own answer")
  } finally {
    await prompt.cleanup()
  }
})
