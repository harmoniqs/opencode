import { For, Show, createEffect, createMemo, on, type JSX, createSignal, onCleanup } from "solid-js"
import { Mark } from "../components/logo"

// AMICODE: home-screen card strip (the "central screen" Aaron wanted the H-bot
// and useful practitioner info on). Two identity heroes — MEET AMICO (who your
// pal is + what it can do) and ABOUT YOU (your profile, earned stats, and the
// live "Amico remembers" trust surface) — over a row of action cards. All
// presentation: the app owns fetching (/amicode/profile, /amicode/problems,
// /amicode/run-status) and passes data + callbacks. Inline styles on v2 tokens,
// matching the entity-rail/getting-started convention → dark/light correct.
// en-only by design, consistent with the default-locale-en patch.

// ---------------------------------------------------------------------------
// profile response shape + parser (mirrors ./problem.ts's parse discipline:
// one success schema, tolerant of missing fields, never throws)
// ---------------------------------------------------------------------------
export interface ProfileStats {
  problems: number
  runs: number
  best_fidelity: number | null
  banked: number
  since: string | null
}
export interface ProfileYou {
  name: string
  affiliation: string | null
  scholar: string | null
  affiliation_logo: string | null
  focus: string | null
  avatar: string | null
  platforms: string[]
  stats: ProfileStats
  remembers: { title: string; detail: string }[]
}
export type ProfileView = { ok: true; you: ProfileYou } | { ok: false; error: string }

export function parseProfileResponse(raw: unknown): ProfileView {
  const r = raw as any
  if (!r || typeof r !== "object" || r.ok !== true || !r.you) {
    return { ok: false, error: typeof r?.error === "string" ? r.error : "unavailable" }
  }
  const you = r.you
  const stats = you.stats ?? {}
  return {
    ok: true,
    you: {
      name: typeof you.name === "string" ? you.name : "Practitioner",
      affiliation: typeof you.affiliation === "string" ? you.affiliation : null,
      scholar: typeof you.scholar === "string" ? you.scholar : null,
      affiliation_logo: typeof you.affiliation_logo === "string" ? you.affiliation_logo : null,
      focus: typeof you.focus === "string" ? you.focus : null,
      avatar: typeof you.avatar === "string" ? you.avatar : null,
      platforms: Array.isArray(you.platforms) ? you.platforms.filter((p: unknown) => typeof p === "string") : [],
      stats: {
        problems: Number(stats.problems) || 0,
        runs: Number(stats.runs) || 0,
        best_fidelity: typeof stats.best_fidelity === "number" ? stats.best_fidelity : null,
        banked: Number(stats.banked) || 0,
        since: typeof stats.since === "string" ? stats.since : null,
      },
      remembers: Array.isArray(you.remembers)
        ? you.remembers
            .filter((m: any) => m && typeof m.title === "string" && m.title.trim())
            .map((m: any) => ({ title: String(m.title), detail: String(m.detail ?? m.title) }))
        : [],
    },
  }
}

// ---------------------------------------------------------------------------
// display helpers
// ---------------------------------------------------------------------------
const PLATFORM_DISPLAY: Record<string, string> = {
  rydberg: "neutral atoms",
  transmon: "transmon",
  "cavity-transmon": "cavity-QED",
  "spin qubits": "spin qubits",
  fluxonium: "fluxonium",
  ions: "trapped ions",
  bosonic: "bosonic",
}
function platformName(key: string): string {
  return PLATFORM_DISPLAY[key] ?? key
}
function derivedFocus(platforms: string[]): string {
  const top = platforms.slice(0, 2).map(platformName)
  if (top.length === 0) return "quantum control"
  return `${top.join(" & ")} pulse design`
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function fidelity(value: number | null): string {
  if (value === null) return "—"
  if (value >= 1) return "1.0"
  return value.toFixed(5)
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function sinceLabel(iso: string | null): string | undefined {
  if (!iso) return undefined
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const month = MONTHS[Number(m[2]) - 1] ?? m[2]
  const day = Number(m[3])
  const started = Date.parse(iso)
  const label = `since ${month} ${day}`
  if (Number.isNaN(started)) return label
  const days = Math.max(0, Math.round((Date.now() - started) / 86_400_000))
  if (days <= 0) return `${label} · today`
  return `${label} · ${days} day${days === 1 ? "" : "s"}`
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------
const CARD: JSX.CSSProperties = {
  "display": "flex",
  "flex-direction": "column",
  "min-width": "0",
  "border": "1px solid var(--v2-border-border-base)",
  "border-radius": "10px",
  "background": "var(--v2-background-bg-layer-01)",
  "padding": "14px 16px",
}
const HERO_CARD: JSX.CSSProperties = { ...CARD, "border-left": "3px solid var(--v2-icon-icon-accent)" }
const EYEBROW: JSX.CSSProperties = {
  "font-size": "10px",
  "font-weight": "700",
  "letter-spacing": "0.1em",
  "text-transform": "uppercase",
  "color": "var(--v2-text-text-faint)",
}
const DIVIDER: JSX.CSSProperties = { "height": "1px", "background": "var(--v2-border-border-base)", "margin": "12px 0" }

function Bullet(props: { children: JSX.Element; title?: string }) {
  return (
    <div
      title={props.title}
      style={{
        "display": "flex",
        "gap": "6px",
        "align-items": "baseline",
        "min-width": "0",
        "font-size": "12px",
        "line-height": "18px",
        "color": "var(--v2-text-text-base)",
      }}
    >
      <span style={{ color: "var(--v2-text-text-accent)", "flex-shrink": "0" }}>›</span>
      <span style={{ "overflow": "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
        {props.children}
      </span>
    </div>
  )
}

function PrimaryButton(props: { children: JSX.Element; onClick: () => void; slot?: string }) {
  return (
    <button
      type="button"
      data-slot={props.slot}
      onClick={() => props.onClick()}
      style={{
        "align-self": "flex-start",
        "border": "1px solid var(--v2-icon-icon-accent)",
        "border-radius": "6px",
        "background": "var(--v2-background-bg-layer-02)",
        "color": "var(--v2-text-text-base)",
        "padding": "5px 12px",
        "font-size": "12px",
        "line-height": "16px",
        "cursor": "pointer",
      }}
    >
      {props.children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// MEET AMICO — static identity + capabilities (the H-bot's home)
// ---------------------------------------------------------------------------
const AMICO_CAN = [
  "design pulses from a conversation",
  "optimize for fidelity, speed, or robustness",
  "warm-start from your pulse bank",
  "tune & calibrate on real hardware",
]

function MeetAmicoCard(props: { onStart: (prompt: string) => void }) {
  // Hover: gold shine sweeps left→right + the card lifts; click anywhere on
  // the card (except its inner CTA) opens a fresh session — the Amicode page.
  const [hover, setHover] = createSignal(false)
  return (
    <div
      data-component="amicode-card-meet"
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return
        props.onStart("")
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.target as HTMLElement).closest("button")) props.onStart("")
      }}
      style={{
        ...HERO_CARD,
        "position": "relative",
        "overflow": "hidden",
        "cursor": "pointer",
        "transform": hover() ? "translateY(-3px)" : "none",
        "box-shadow": hover() ? "var(--v2-elevation-raised, 0 6px 20px rgba(0,0,0,0.18))" : "none",
        "transition": "transform 0.18s ease, box-shadow 0.18s ease",
      }}
    >
      {/* gold shine: sweeps on hover-in; opacity-fades + snaps back (transform
          intentionally untransitioned on leave) so it never sweeps backwards */}
      <div
        aria-hidden="true"
        style={{
          "position": "absolute",
          "inset": "0",
          "pointer-events": "none",
          "width": "55%",
          "background": "linear-gradient(105deg, transparent 0%, color-mix(in srgb, var(--v2-icon-icon-accent) 30%, transparent) 50%, transparent 100%)",
          "opacity": hover() ? "1" : "0",
          "transform": hover() ? "translateX(280%)" : "translateX(-160%)",
          "transition": hover() ? "transform 0.85s ease, opacity 0.12s ease" : "opacity 0.3s ease",
        }}
      />
      <div style={EYEBROW}>Meet Amico</div>
      <div style={{ "display": "flex", "gap": "12px", "align-items": "center", "margin-top": "10px" }}>
        <Mark class="w-12 h-auto shrink-0" />
        <div style={{ "min-width": "0" }}>
          <div style={{ "font-size": "18px", "font-weight": "600", "color": "var(--v2-text-text-base)" }}>Amico</div>
          <div style={{ "font-size": "12px", "line-height": "16px", "color": "var(--v2-text-text-muted)" }}>
            Your friendly Quantum Computing Agent
          </div>
          <div style={{ "font-size": "11px", "line-height": "16px", "color": "var(--v2-text-text-faint)" }}>
            powered by the Piccolo engine
          </div>
        </div>
      </div>
      <div style={DIVIDER} />
      <div style={{ "font-size": "11px", "color": "var(--v2-text-text-muted)", "margin-bottom": "6px" }}>
        I can help you
      </div>
      <div style={{ "display": "flex", "flex-direction": "column", "gap": "3px", "margin-bottom": "12px" }}>
        <For each={AMICO_CAN}>{(line) => <Bullet>{line}</Bullet>}</For>
      </div>
      {/* Primary CTA: big, center-left — the front door. Opens a fresh chat
          (same destination as clicking the card). */}
      <button
        type="button"
        data-slot="amicode-card-meet-cta"
        onClick={() => props.onStart("")}
        style={{
          "align-self": "flex-start",
          "display": "inline-flex",
          "align-items": "center",
          "gap": "10px",
          "margin-top": "4px",
          "padding": "12px 22px",
          "border": "none",
          "border-radius": "10px",
          "cursor": "pointer",
          "background": "var(--v2-icon-icon-accent)",
          "color": "var(--v2-background-bg-base, #000)",
          "font-size": "15px",
          "font-weight": "650",
          "box-shadow": "0 2px 10px color-mix(in srgb, var(--v2-icon-icon-accent) 35%, transparent)",
        }}
      >
        Open chat
        <span aria-hidden="true" style={{ "font-size": "16px", "line-height": "1" }}>↗</span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ABOUT YOU — profile, earned stats, live "Amico remembers"
// ---------------------------------------------------------------------------
function Avatar(props: { name: string; src: string | null }) {
  return (
    <Show
      when={props.src}
      fallback={
        <div
          style={{
            "width": "44px",
            "height": "44px",
            "flex-shrink": "0",
            "border-radius": "10px",
            "background": "var(--v2-background-bg-layer-03)",
            "color": "var(--v2-text-text-muted)",
            "display": "flex",
            "align-items": "center",
            "justify-content": "center",
            "font-size": "15px",
            "font-weight": "600",
            "letter-spacing": "0.02em",
          }}
        >
          {initials(props.name)}
        </div>
      }
    >
      {(src) => (
        <img
          src={src()}
          alt={props.name}
          style={{ "width": "44px", "height": "44px", "border-radius": "10px", "object-fit": "cover", "flex-shrink": "0" }}
        />
      )}
    </Show>
  )
}

function Stat(props: { value: string; label: string }) {
  return (
    <div style={{ "display": "flex", "flex-direction": "column", "gap": "1px", "min-width": "0" }}>
      <span
        style={{
          "font-size": "16px",
          "font-weight": "600",
          "color": "var(--v2-text-text-base)",
          "font-variant-numeric": "tabular-nums",
          "line-height": "20px",
        }}
      >
        {props.value}
      </span>
      <span style={{ "font-size": "10px", "color": "var(--v2-text-text-faint)", "line-height": "12px" }}>
        {props.label}
      </span>
    </div>
  )
}

function AboutYouCard(props: {
  view: ProfileView | undefined
  onEdit: () => void
  onSave?: (fields: { name?: string; affiliation?: string; focus?: string; scholar?: string; affiliation_logo?: string }) => Promise<void>
  onStart: (prompt: string) => void
}) {
  const you = createMemo(() => (props.view?.ok ? props.view.you : undefined))
  // In-place editing (replaces the edit-in-chat flow when onSave is wired):
  // the pencil toggles a small form over the identity fields; Save posts and
  // the card re-renders from the refetched profile.
  const [editing, setEditing] = createSignal(false)
  // A persisted-but-dead logo URL (e.g. the sunset Clearbit CDN) must fall
  // back to the monogram tile, not render the broken-image glyph in the hero.
  const [logoBroken, setLogoBroken] = createSignal(false)
  createEffect(on(() => (props.view?.ok ? props.view.you.affiliation_logo : undefined), () => setLogoBroken(false)))
  const [saving, setSaving] = createSignal(false)
  const [draft, setDraft] = createSignal({ name: "", affiliation: "", focus: "", scholar: "", affiliation_logo: "" })
  const [suggestions, setSuggestions] = createSignal<{ name: string; domain: string; logo: string }[]>([])
  const beginEdit = () => {
    setSuggestions([])   // a dropdown left open at cancel must not haunt the next edit
    const y = you()
    setDraft({
      name: y?.name ?? "", affiliation: y?.affiliation ?? "", focus: y?.focus ?? "",
      scholar: y?.scholar ?? "", affiliation_logo: y?.affiliation_logo ?? "",
    })
    setEditing(true)
  }
  // Institution logos ride Google's favicon service — clearbit's logo CDN is
  // sunset (autocomplete lives on for name+domain, which is all we need).
  const institutionLogoUrl = (domain: string) =>
    `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(domain)}&size=256`

  // LinkedIn-style institution lookup: Clearbit's free autocomplete (no key,
  // CORS-open) → name + domain + logo. Picking a suggestion fills affiliation
  // AND its logo; free text still saves as a plain affiliation.
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let searchSeq = 0   // out-of-order guard: a slow "har" response must not clobber "harvard"'s
  onCleanup(() => { if (searchTimer) clearTimeout(searchTimer) })
  const searchInstitutions = (q: string) => {
    if (searchTimer) clearTimeout(searchTimer)
    if (q.trim().length < 2) { searchSeq++; setSuggestions([]); return }
    searchTimer = setTimeout(() => {
      const seq = ++searchSeq
      fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: any) => { if (seq === searchSeq) setSuggestions(Array.isArray(rows) ? rows.slice(0, 5) : []) })
        .catch(() => { if (seq === searchSeq) setSuggestions([]) })
    }, 200)
  }
  // Counter, not boolean: pick A then B while A's Wikidata round-trip is in
  // flight — A's finally must not re-enable Save while B still resolves (the
  // boolean version re-introduced the save-races-logo bug it claimed to fix).
  const [resolvingLogo, setResolvingLogo] = createSignal(0)
  const wikiJson = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined)
  const pickInstitution = async (sug: { name: string; domain: string; logo: string }) => {
    // Instant favicon mark, then resolve the real BRAND logo: Wikidata P154
    // ("logo image" — e.g. the purple NYU torch, not the seal) rasterized by
    // Commons at 512px → crisp at any tile size. Fallbacks: Wikipedia page
    // image, then the favicon. Save is held while resolving so the upgraded
    // URL is what gets persisted (the old async upgrade lost a race with Save).
    setDraft({ ...draft(), affiliation: sug.name, affiliation_logo: institutionLogoUrl(sug.domain) })
    setSuggestions([])
    setResolvingLogo((n) => n + 1)
    try {
      let logo: string | undefined
      const found = await wikiJson(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(sug.name)}&language=en&format=json&origin=*`,
      )
      const qid = found?.search?.[0]?.id
      if (qid) {
        const claims = await wikiJson(
          `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P154&format=json&origin=*`,
        )
        const file = claims?.claims?.P154?.[0]?.mainsnak?.datavalue?.value
        if (typeof file === "string" && file) {
          logo = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=512`
        }
      }
      if (!logo) {
        const page = await wikiJson(
          `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&titles=${encodeURIComponent(sug.name)}&prop=pageimages&piprop=original`,
        )
        const orig = (Object.values(page?.query?.pages ?? {})[0] as any)?.original?.source
        if (typeof orig === "string" && /\.(svg|png|jpe?g|webp)$/i.test(orig)) logo = orig
      }
      if (logo && draft().affiliation === sug.name) setDraft({ ...draft(), affiliation_logo: logo })
    } finally {
      setResolvingLogo((n) => Math.max(0, n - 1))
    }
  }

  const openExternal = (url: string) => {
    if (window.parent !== window) window.parent.postMessage({ source: "amicode", kind: "open-external", url }, "*")
    else window.open(url, "_blank", "noreferrer")
  }

  const [saveError, setSaveError] = createSignal<string | undefined>(undefined)
  const save = async () => {
    if (!props.onSave) return
    setSaving(true)
    setSaveError(undefined)
    try {
      await props.onSave(draft())
      setEditing(false)
    } catch {
      // Silent reverts read as "the button is broken" — say what happened.
      setSaveError("Couldn't save — server unreachable. Try again.")
    } finally {
      setSaving(false)
    }
  }
  /** ⌘/Ctrl+V fallback: neither native paste nor navigator.clipboard reach a
   *  cross-origin iframe inside a VS Code webview (the parent has no
   *  clipboard-read to delegate) — so ask the EXTENSION HOST over the message
   *  bridge; it reads the OS clipboard and replies. navigator.clipboard is
   *  still tried first for plain-browser contexts. */
  const readClipboardViaBridge = () =>
    new Promise<string>((resolve) => {
      const nonce = Math.random().toString(36).slice(2)
      const onMsg = (e: MessageEvent) => {
        const d = e.data as { source?: string; kind?: string; nonce?: string; text?: string } | undefined
        if (d?.source !== "amicode" || d.kind !== "clipboard" || d.nonce !== nonce) return
        window.removeEventListener("message", onMsg)
        resolve(typeof d.text === "string" ? d.text : "")
      }
      window.addEventListener("message", onMsg)
      window.parent.postMessage({ source: "amicode", kind: "clipboard-request", nonce }, "*")
      setTimeout(() => { window.removeEventListener("message", onMsg); resolve("") }, 1500)
    })
  const pasteFallback = (apply: (value: string) => void) => async (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "v") return
    // Plain-browser contexts: native paste works — never preventDefault it
    // (Firefox/Safari would lose paste entirely; the bridge is iframe-only).
    if (window.parent === window) return
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLInputElement
    let clip = ""
    try { clip = (await navigator.clipboard.readText()) ?? "" } catch { /* delegated-permission miss */ }
    if (!clip && window.parent !== window) clip = await readClipboardViaBridge()
    if (!clip) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    apply(el.value.slice(0, start) + clip + el.value.slice(end))
  }

  const FIELD: JSX.CSSProperties = {
    "width": "100%",
    "box-sizing": "border-box",
    "background": "var(--v2-background-bg-layer-02, transparent)",
    "border": "1px solid var(--v2-border-border-base)",
    "border-radius": "6px",
    "padding": "4px 8px",
    "font-size": "12px",
    "color": "var(--v2-text-text-base)",
  }
  const focusLine = createMemo(() => {
    const y = you()
    if (!y) return ""
    const focus = y.focus ?? derivedFocus(y.platforms)
    return y.affiliation ? `${y.affiliation} · ${focus}` : focus
  })
  const fresh = createMemo(() => {
    const y = you()
    return !!y && y.stats.problems === 0 && y.stats.runs === 0
  })

  return (
    <div data-component="amicode-card-you" style={HERO_CARD}>
      <div style={{ "display": "flex", "align-items": "center", "justify-content": "space-between" }}>
        <div style={{ "display": "flex", "align-items": "baseline", "gap": "8px" }}>
          <div style={EYEBROW}>About you</div>
          <span style={{ "font-size": "10px", "color": "var(--v2-text-text-faint)" }}>self-improving — Amico refines this as you work</span>
        </div>
        <Show when={you()}>
          <button
            type="button"
            data-slot="amicode-card-you-edit"
            title={props.onSave ? (editing() ? "Cancel editing" : "Edit profile") : "Edit profile in chat"}
            onClick={() => (props.onSave ? (editing() ? (setEditing(false), setSuggestions([])) : beginEdit()) : props.onEdit())}
            style={{
              "background": "none",
              "border": "none",
              "cursor": "pointer",
              "color": "var(--v2-text-text-faint)",
              "font-size": "12px",
              "padding": "0",
              "line-height": "1",
            }}
          >
            ✎
          </button>
        </Show>
      </div>

      <Show
        when={you()}
        fallback={
          <div style={{ "margin-top": "10px", "font-size": "12px", "color": "var(--v2-text-text-faint)" }}>
            {props.view && !props.view.ok ? "Profile unavailable." : "Loading…"}
          </div>
        }
      >
        {(y) => (
          <>
            <Show when={y().affiliation}>
              <div
                data-slot="amicode-you-institution"
                style={{
                  "display": "flex", "gap": "10px", "align-items": "center", "margin-top": "10px",
                  "padding": "8px 10px", "border-radius": "8px",
                  "background": "color-mix(in srgb, var(--v2-icon-icon-accent) 7%, transparent)",
                  "border": "1px solid color-mix(in srgb, var(--v2-icon-icon-accent) 25%, var(--v2-border-border-base))",
                }}
              >
                <Show
                  when={y().affiliation_logo && !logoBroken()}
                  fallback={
                    <span style={{
                      "display": "inline-flex", "align-items": "center", "justify-content": "center",
                      "width": "44px", "height": "44px", "border-radius": "8px", "flex": "none",
                      "background": "var(--v2-icon-icon-accent)", "color": "var(--v2-background-bg-base, #000)",
                      "font-size": "15px", "font-weight": "700", "letter-spacing": "0.5px",
                    }}>
                      {(y().affiliation ?? "").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase()}
                    </span>
                  }
                >
                  {/* LinkedIn-style logo card: white tile + padding keeps any
                      mark crisp and consistent on both themes */}
                  <span style={{
                    "display": "inline-flex", "align-items": "center", "justify-content": "center",
                    "width": "44px", "height": "44px", "border-radius": "8px", "flex": "none",
                    "background": "#FFFFFF", "border": "1px solid var(--v2-border-border-base)", "padding": "5px",
                  }}>
                    <img
                      src={y().affiliation_logo!}
                      alt={y().affiliation ?? "institution"}
                      style={{ "width": "100%", "height": "100%", "object-fit": "contain" }}
                      onError={() => setLogoBroken(true)}
                    />
                  </span>
                </Show>
                <div style={{ "min-width": "0", "flex": "1" }}>
                  <div style={{ "font-size": "14px", "font-weight": "650", "color": "var(--v2-text-text-base)", "overflow": "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                    {y().affiliation}
                  </div>
                  <div style={{ "font-size": "11px", "color": "var(--v2-text-text-faint)" }}>Institution</div>
                </div>

              </div>
            </Show>
            <div style={{ "display": "flex", "gap": "12px", "align-items": "center", "margin-top": "10px" }}>
              <div style={{ "min-width": "0", "flex": "1" }}>
                <div
                  style={{
                    "font-size": "16px",
                    "font-weight": "600",
                    "color": "var(--v2-text-text-base)",
                    "overflow": "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                  }}
                >
                  <Show when={!editing()} fallback={
                    <input
                      data-slot="amicode-you-name"
                      style={FIELD}
                      value={draft().name}
                      placeholder="Name"
                      onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })}
                      onKeyDown={pasteFallback((v) => setDraft({ ...draft(), name: v }))}
                    />
                  }>
                    <span style={{ "display": "inline-flex", "align-items": "center", "gap": "8px", "max-width": "100%" }}>
                      <span style={{ "overflow": "hidden", "text-overflow": "ellipsis" }}>{y().name}</span>
                      <Show when={y().scholar}>
                        <button
                          type="button"
                          data-slot="amicode-you-scholar"
                          onClick={() => openExternal(y().scholar!)}
                          style={{
                            "font-size": "11px", "font-weight": "600", "flex": "none", "cursor": "pointer",
                            "color": "var(--v2-text-text-accent)", "background": "none",
                            "border": "1px solid color-mix(in srgb, var(--v2-icon-icon-accent) 40%, transparent)",
                            "border-radius": "999px", "padding": "3px 10px",
                          }}
                        >
                          Scholar ↗
                        </button>
                      </Show>
                    </span>
                  </Show>
                </div>
                <div
                  style={{
                    "font-size": "12px",
                    "line-height": "16px",
                    "color": "var(--v2-text-text-muted)",
                    "overflow": "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                  }}
                >
                  <Show when={!editing()} fallback={
                    <div style={{ "display": "flex", "flex-direction": "column", "gap": "4px", "margin-top": "4px" }}>
                      <div style={{ "position": "relative" }}>
                        <div style={{ "display": "flex", "gap": "6px", "align-items": "center" }}>
                          <Show when={draft().affiliation_logo}>
                            <img src={draft().affiliation_logo} alt="" style={{ "width": "20px", "height": "20px", "object-fit": "contain", "border-radius": "4px", "flex": "none" }} onError={(e) => (e.currentTarget.style.display = "none")} />
                          </Show>
                          <input
                            data-slot="amicode-you-affiliation"
                            style={{ ...FIELD, "flex": "1" }}
                            value={draft().affiliation}
                            placeholder="University or company — search like LinkedIn"
                            onInput={(e) => {
                              setDraft({ ...draft(), affiliation: e.currentTarget.value })
                              searchInstitutions(e.currentTarget.value)
                            }}
                            onKeyDown={pasteFallback((v) => { setDraft({ ...draft(), affiliation: v }); searchInstitutions(v) })}
                          />
                        </div>
                        <Show when={suggestions().length > 0}>
                          <div style={{
                            "position": "absolute", "top": "100%", "left": "0", "right": "0", "z-index": "10",
                            "margin-top": "4px", "border-radius": "8px", "overflow": "hidden",
                            "background": "var(--v2-background-bg-layer-02, var(--v2-background-bg-layer-01))",
                            "border": "1px solid var(--v2-border-border-base)",
                            "box-shadow": "var(--v2-elevation-raised, 0 6px 20px rgba(0,0,0,0.2))",
                          }}>
                            <For each={suggestions()}>
                              {(sug) => (
                                <button
                                  type="button"
                                  onClick={() => pickInstitution(sug)}
                                  style={{
                                    "display": "flex", "gap": "8px", "align-items": "center", "width": "100%",
                                    "padding": "6px 8px", "background": "none", "border": "none", "cursor": "pointer",
                                    "text-align": "left", "color": "var(--v2-text-text-base)", "font-size": "12px",
                                  }}
                                >
                                  <img src={institutionLogoUrl(sug.domain)} alt="" style={{ "width": "18px", "height": "18px", "object-fit": "contain", "border-radius": "4px", "flex": "none" }} onError={(e) => (e.currentTarget.style.display = "none")} />
                                  <span style={{ "flex": "1", "overflow": "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>{sug.name}</span>
                                  <span style={{ "color": "var(--v2-text-text-faint)", "font-size": "10px" }}>{sug.domain}</span>
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                      <input
                        data-slot="amicode-you-focus"
                        style={FIELD}
                        value={draft().focus}
                        placeholder="What you work on"
                        onInput={(e) => setDraft({ ...draft(), focus: e.currentTarget.value })}
                        onKeyDown={pasteFallback((v) => setDraft({ ...draft(), focus: v }))}
                      />
                      <input
                        data-slot="amicode-you-scholar-input"
                        style={FIELD}
                        value={draft().scholar}
                        placeholder="Google Scholar URL (optional)"
                        onInput={(e) => setDraft({ ...draft(), scholar: e.currentTarget.value })}
                        onKeyDown={pasteFallback((v) => setDraft({ ...draft(), scholar: v }))}
                      />
                      <div style={{ "display": "flex", "gap": "8px", "align-items": "center" }}>
                        <button
                          type="button"
                          data-slot="amicode-you-save"
                          disabled={saving() || resolvingLogo() > 0}
                          onClick={() => void save()}
                          style={{
                            "background": "var(--v2-icon-icon-accent)",
                            "color": "var(--v2-background-bg-base, #000)",
                            "border": "none",
                            "border-radius": "6px",
                            "padding": "4px 10px",
                            "font-size": "12px",
                            "font-weight": "600",
                            "cursor": saving() ? "wait" : "pointer",
                          }}
                        >
                          {saving() ? "Saving…" : resolvingLogo() > 0 ? "Finding logo…" : "Save"}
                        </button>
                        <Show when={saveError()} fallback={<span style={{ "font-size": "11px", "color": "var(--v2-text-text-faint)" }}>saves to your profile</span>}>
                          <span style={{ "font-size": "11px", "color": "var(--v2-state-fg-danger)" }}>{saveError()}</span>
                        </Show>
                      </div>
                    </div>
                  }>
                    {focusLine()}
                  </Show>
                </div>
                <Show when={y().platforms.length > 0}>
                  <div style={{ "font-size": "11px", "color": "var(--v2-text-text-faint)", "margin-top": "1px" }}>
                    <For each={y().platforms.slice(0, 3)}>
                      {(p, i) => (
                        <span>
                          {i() > 0 ? "  " : ""}◇ {platformName(p)}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>

            <Show
              when={!fresh()}
              fallback={
                <>
                  <div style={DIVIDER} />
                  <div style={{ "font-size": "12px", "color": "var(--v2-text-text-muted)", "margin-bottom": "8px" }}>
                    No solves yet — tell Amico what you're working on and it'll start remembering.
                  </div>
                  <PrimaryButton
                    slot="amicode-card-you-firstrun"
                    onClick={() => props.onStart("help me set up my first pulse-design problem")}
                  >
                    Get started →
                  </PrimaryButton>
                </>
              }
            >
              <div style={DIVIDER} />
              <div
                style={{
                  "display": "grid",
                  "grid-template-columns": "repeat(4, minmax(0, 1fr))",
                  "gap": "8px",
                }}
              >
                <Stat value={String(y().stats.problems)} label="problems" />
                <Stat value={String(y().stats.runs)} label="runs" />
                <Stat value={fidelity(y().stats.best_fidelity)} label="best F" />
                <Stat value={String(y().stats.banked)} label="banked" />
              </div>

              <Show when={y().remembers.length > 0}>
                <div style={DIVIDER} />
                <div style={{ "font-size": "11px", "color": "var(--v2-text-text-muted)", "margin-bottom": "6px" }}>
                  Amico remembers
                </div>
                <div style={{ "display": "flex", "flex-direction": "column", "gap": "3px" }}>
                  <For each={y().remembers}>{(m) => <Bullet title={m.detail}>{m.title}</Bullet>}</For>
                </div>
              </Show>

              <Show when={sinceLabel(y().stats.since)}>
                {(label) => (
                  <div style={{ "font-size": "10px", "color": "var(--v2-text-text-faint)", "margin-top": "10px" }}>
                    {label()}
                  </div>
                )}
              </Show>
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}

// ---------------------------------------------------------------------------
// action cards
// ---------------------------------------------------------------------------
function ActionCard(props: {
  eyebrow: string
  slot: string
  onClick?: () => void
  children: JSX.Element
}) {
  return (
    <div
      data-component="amicode-action-card"
      data-slot={props.slot}
      onClick={() => props.onClick?.()}
      style={{
        ...CARD,
        "gap": "6px",
        "cursor": props.onClick ? "pointer" : "default",
        "min-height": "88px",
      }}
    >
      <div style={EYEBROW}>{props.eyebrow}</div>
      {props.children}
    </div>
  )
}

const CARD_TITLE: JSX.CSSProperties = {
  "font-size": "13px",
  "font-weight": "600",
  "color": "var(--v2-text-text-base)",
  "overflow": "hidden",
  "text-overflow": "ellipsis",
  "white-space": "nowrap",
}
const CARD_SUB: JSX.CSSProperties = {
  "font-size": "11px",
  "color": "var(--v2-text-text-muted)",
  "overflow": "hidden",
  "text-overflow": "ellipsis",
  "white-space": "nowrap",
}
const SPARK_W = 96
const SPARK_H = 22
function Sparkline(props: { values: number[] }) {
  const path = createMemo(() => {
    const v = props.values
    if (v.length < 2) return undefined
    const min = Math.min(...v)
    const max = Math.max(...v)
    const span = max - min || 1
    const step = SPARK_W / (v.length - 1)
    return v
      .map((y, i) => {
        const px = (i * step).toFixed(1)
        const py = (SPARK_H - 2 - ((y - min) / span) * (SPARK_H - 4)).toFixed(1)
        return `${i === 0 ? "M" : "L"}${px},${py}`
      })
      .join(" ")
  })
  return (
    <Show when={path()}>
      {(d) => (
        <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} style={{ "flex-shrink": "0" }}>
          <path d={d()} fill="none" stroke="var(--v2-icon-icon-accent)" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
      )}
    </Show>
  )
}

export interface HomeLiveRun {
  name?: string
  iteration?: number | null
  fidelity?: number | null
  series?: number[]
}


// ---------------------------------------------------------------------------
// height compaction — the home page must fit ONE screen on a laptop (no box
// scrolling; scrolling is a phone affordance). Cards style inline, so these
// overrides need !important; thresholds are the WEBVIEW height (editor chrome
// already spent), not the display's.
// ---------------------------------------------------------------------------
const COMPACT_CSS = `
@media (max-height: 880px) {
  [data-slot="amicode-home-shell"] { padding-top: 16px !important; gap: 14px !important; }
  [data-slot="amicode-home-band"] { max-height: 250px !important; }
  [data-component="amicode-home-cards"] { gap: 8px !important; }
  [data-component="amicode-card-meet"], [data-component="amicode-card-you"] { padding: 10px 14px !important; }
  [data-component="amicode-card-meet"] svg { width: 36px !important; }
  [data-component="amicode-action-card"] { padding: 10px 12px !important; }
  [data-slot="amicode-card-meet-cta"] { padding: 8px 16px !important; font-size: 13px !important; }
  [data-component="amicode-footer"] { padding-top: 6px !important; }
}
@media (max-height: 760px) {
  [data-slot="amicode-home-shell"] { padding-top: 8px !important; gap: 8px !important; padding-bottom: 10px !important; }
  [data-slot="amicode-home-band"] { max-height: 180px !important; }
  [data-component="amicode-card-meet"], [data-component="amicode-card-you"] { padding: 8px 12px !important; }
  [data-slot="amicode-card-meet-cta"] { padding: 6px 14px !important; }
}
`

export function AmicodeHomeCards(props: {
  profile: ProfileView | undefined
  starters: readonly { label: string; prompt: string }[]
  onStart: (prompt: string) => void
  onEditProfile: () => void
  onSaveProfile?: (fields: { name?: string; affiliation?: string; focus?: string; scholar?: string; affiliation_logo?: string }) => Promise<void>
  // Jump back in
  resumeName?: string
  resumeMeta?: string
  onResume?: () => void
  // Now solving
  liveRun?: HomeLiveRun
  onOpenLiveRun?: () => void
  // Pulse bank
  onWarmStart?: () => void
}) {
  const stats = createMemo(() => (props.profile?.ok ? props.profile.you.stats : undefined))
  return (
    <div data-component="amicode-home-cards" style={{ "display": "flex", "flex-direction": "column", "gap": "12px" }}>
      <style>{COMPACT_CSS}</style>
      <div
        style={{
          "display": "grid",
          "grid-template-columns": "repeat(2, minmax(0, 1fr))",
          "gap": "12px",
        }}
      >
        <MeetAmicoCard onStart={props.onStart} />
        <AboutYouCard view={props.profile} onEdit={props.onEditProfile} onSave={props.onSaveProfile} onStart={props.onStart} />
      </div>

      <div
        style={{
          "display": "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(150px, 1fr))",
          "gap": "8px",
        }}
      >
        {/* Jump back in */}
        <Show when={props.resumeName}>
          <ActionCard eyebrow="Jump back in" slot="amicode-card-resume" onClick={props.onResume}>
            <div style={CARD_TITLE}>{props.resumeName}</div>
            <Show when={props.resumeMeta}>
              <div style={CARD_SUB}>{props.resumeMeta}</div>
            </Show>
            <div style={{ "font-size": "11px", "color": "var(--v2-text-text-accent)", "margin-top": "auto" }}>
              Resume →
            </div>
          </ActionCard>
        </Show>

        {/* Now solving */}
        <Show when={props.liveRun}>
          {(run) => (
            <ActionCard eyebrow="Now solving" slot="amicode-card-live" onClick={props.onOpenLiveRun}>
              <div style={CARD_TITLE}>{run().name ?? "current run"}</div>
              <div style={{ "display": "flex", "align-items": "center", "gap": "8px", "min-width": "0" }}>
                <span style={{ ...CARD_SUB, "font-variant-numeric": "tabular-nums" }}>
                  iter {run().iteration ?? "—"} · F {fidelity(run().fidelity ?? null)}
                </span>
              </div>
              <div style={{ "margin-top": "auto" }}>
                <Sparkline values={run().series ?? []} />
              </div>
            </ActionCard>
          )}
        </Show>

        {/* Pulse bank */}
        <Show when={(stats()?.banked ?? 0) > 0}>
          <ActionCard eyebrow="Pulse bank" slot="amicode-card-bank" onClick={props.onWarmStart}>
            <div style={CARD_TITLE}>
              {stats()!.banked} pulse{stats()!.banked === 1 ? "" : "s"} banked
            </div>
            <div style={{ ...CARD_SUB, "font-variant-numeric": "tabular-nums" }}>
              best F {fidelity(stats()!.best_fidelity)}
            </div>
            <div style={{ "font-size": "11px", "color": "var(--v2-text-text-accent)", "margin-top": "auto" }}>
              Warm-start →
            </div>
          </ActionCard>
        </Show>

        {/* Start something */}
        <ActionCard eyebrow="Start something" slot="amicode-card-start">
          <div style={{ "display": "flex", "flex-wrap": "wrap", "gap": "5px", "margin-top": "2px" }}>
            <For each={props.starters}>
              {(starter) => (
                <button
                  type="button"
                  data-slot="amicode-card-start-chip"
                  onClick={() => props.onStart(starter.prompt)}
                  style={{
                    "border": "1px solid var(--v2-border-border-base)",
                    "border-radius": "6px",
                    "background": "var(--v2-background-bg-layer-02)",
                    "color": "var(--v2-text-text-base)",
                    "padding": "3px 9px",
                    "font-size": "11px",
                    "line-height": "15px",
                    "cursor": "pointer",
                  }}
                >
                  {starter.label}
                </button>
              )}
            </For>
          </div>
        </ActionCard>
      </div>
    </div>
  )
}
