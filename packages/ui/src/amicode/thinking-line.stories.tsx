// @ts-nocheck
import { AmicoMark } from "./spinner"
import { ThinkingLine } from "./thinking-line"

export default {
  title: "Amicode/ThinkingLine",
  id: "amicode-thinking-line",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Thinking line

The Claude-Code-esque "working" indicator shown beside the AMICO turn signature
while a reply streams. The H-mark glyph pulses (brand motif); the gerund word
cycles every ~2s and shimmers; the meta line ticks elapsed time (and, when the
mount site provides them, token count + an "esc to interrupt" hint).

Under \`prefers-reduced-motion\` the word is static and un-shimmered; the elapsed
counter still advances.`,
      },
    },
  },
}

const Frame = (props) => (
  <span class="amc-sig" style={{ padding: "16px", "font-size": "13px" }}>
    <AmicoMark running />
    <span class="amc-wordmark">AMICO</span>
    {props.children}
  </span>
)

export const Default = () => (
  <Frame>
    <ThinkingLine />
  </Frame>
)

export const WithTokens = () => (
  <Frame>
    <ThinkingLine tokens={2437} />
  </Frame>
)

export const Interruptible = () => (
  <Frame>
    <ThinkingLine tokens={12800} interruptible />
  </Frame>
)
