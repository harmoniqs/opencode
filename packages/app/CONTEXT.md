# Amicode App — UI Structure

The SolidJS surface of the Amicode extension. This context covers how the window is
laid out and how a researcher moves between chat and the supporting surfaces. It is a
glossary only — no implementation details, no routing tables, no component names.

For the conversation/session runtime context, see the repo-root `CONTEXT.md`.

## Language

### The shell

**Landing**:
What the window shows on launch. The Landing is always a fresh, empty chat — a new
composer awaiting a first prompt — never a dashboard or a resumed session. Prior
sessions and setup are one interaction away in the **Rail**, never in the way.
_Avoid_: Home, Home page, Dashboard, Start screen

**Chat**:
The single persistent hub of the window — the composer and its conversation. Every
other surface opens beside or in front of the Chat; the Chat is never replaced by
another surface, only overlaid. There is no view in which the Chat is absent.
_Avoid_: Main view, editor, session pane (as the whole hub)

**Context tree**:
The organic graph of what the agent is actually holding in mind, rendered inside the
**context side panel** (opened from the progress-circle ring button in the session
header). Root = amico at center, the session's turns orbiting it (one per user prompt,
however many assistant messages it spans), and the markdown, source, skills, and agents
each turn pulled into context clustering around their turn. Shared context sits between
the turns that recall it. Interactive: clicking a file node opens the real file (project
files as a session tab, vault files in the **Vault panel**). One per session view; absent
until the session holds context. On-demand — visible only when the context panel is open,
never persistent. See ADR 0004 (relocated from the former top panel of ADR 0003).
_Avoid_: Brain (that was the ambient, non-interactive strip), knowledge graph, minimap

**Titlebar controls:**
The five icon buttons a researcher can reposition within the titlebar: Sessions, Status,
Side Panel, Profile, and Settings. Each control occupies one of two configurable **slots**
-- left of the tab strip or right of it -- and can be drag-reordered within or across
slots via an explicit edit mode (right-click the titlebar). The channel badge, tab strip,
and new-tab button are fixed titlebar chrome, not titlebar controls.
_Avoid_: toolbar buttons, action buttons, chrome strip (retired)

**Vault panel**:
The dismissible drawer that puts the vault — every attached mount and every file inside
it — in the interface. Read-only browsing with inline markdown/source rendering; opened
from the titlebar vault button, the command palette, or a **Context tree** click on a
vault node.
_Avoid_: Vaults tab (that is the mount *list* in status), file manager, explorer

**Rail**:
The one narrow vertical strip of icons along the window's leading edge. Collapsed to
icons by default; each icon reveals its text label on hover. The Rail is the only
persistent navigation chrome — it replaces the former top chrome strip and the former
project-avatar strip, which no longer exist.
_Avoid_: Sidebar (the Rail is not the Panel), toolbar, activity bar

**Rail surface**:
One thing the Rail can open, represented by a single icon. The navigation surfaces are
Chats, Projects, Run gallery, Pulse bank, and Library. A Rail surface is a destination,
not a document — it lists or collects things the researcher then acts on.
_Avoid_: Widget, card, tab

**Panel**:
The dismissible drawer a **Rail surface** opens beside the **Chat**. Exactly one Panel
is open at a time; opening another replaces it; dismissing it returns the window to
Chat-only. Selecting an item inside a Panel acts in the Chat rather than navigating
away from it.
_Avoid_: Modal, page, route, flyout

**Account zone**:
The cluster at the foot of the **Rail** for identity and configuration, distinct from
the navigation surfaces above it. Holds the researcher profile (About You), backend
Connections, solver/model Defaults, and Settings. These are set-and-forget surfaces,
not places a researcher browses.
_Avoid_: Settings menu (the zone is broader), footer

### Brand

**Brand sheet**:
The one token file, canonical for every design-system value — hue, corner, unit, type, hairline, focus, motion — and holding nothing else. A value that disagrees with it is wrong; a value not in it is not part of the system; a rule that styles a surface is a **Skin**. See DESIGN.md.
_Avoid_: theme (that is the **Theme palette**), stylesheet, design tokens file, polish

**Skin**:
A rule that applies the **Brand sheet** to a named surface — the composer, the send button, the solver banner. Skins live in their own stylesheet, are gated exactly like any component, and never define a token or force themselves over the sheet. See DESIGN.md, Law 9.
_Avoid_: polish, override, theme tweak, component style (as something exempt)

**Design law**:
A rule of the brand that no token can express — how the accent may be paired, what a border is, what may move. Laws live in DESIGN.md with their reasons and are enforced by the **Design gate**.
_Avoid_: guideline, style rule, convention, best practice

**Design gate**:
The checks that fail a build when code disagrees with the **Brand sheet** or a **Design law**: the static gate reads the source for literals, the rendered gate reads the running app in both schemes. A law without a gate is not yet a law.
_Avoid_: lint, style check, visual test

**Brand accent**:
The one yellow the interface carries, and it carries it for one reason: it is the **Call to action**. Paired only as black-on-yellow or yellow-on-dark, never as a yellow foreground on a light surface, and never for selection, emphasis, or status. See DESIGN.md, Law 1.
_Avoid_: highlight colour, primary colour, gold, "the yellow" (unqualified), second accent, selected colour

**Call to action**:
The one control on a surface that prompts the researcher's immediate next action — send, connect, approve, begin — and the only thing that carries the **Brand accent**. A surface has at most one; a state is never one; yellow prompts and never points. See DESIGN.md, Law 1.
_Avoid_: primary button (generic), accent button, yellow button, highlight, active state

**Semantic state**:
The colours that mean something — success, warning, danger, and the session status dots — and the only chromatic hues besides the **Brand accent**. Never decorative, never an accent, never an edge; the meaning is always also carried by text or an icon. See DESIGN.md, Laws 1 and 3.
_Avoid_: status colours (as a design category), alert colours, accent (for these), error border

**Data-viz palette**:
The defined set of categorical colours the context tree and brain engines paint from — one hue per category, chosen under the accent law. The canvas is inside the system: its live marker is a pointer and is neutral. See DESIGN.md, Law 1.
_Avoid_: chart theme, secondary palette, accent set, exemption

**Principle**:
A behavioural rule of the interface — reduce choices, show progress, end flows well — that a designer checks in review rather than a gate checks in a build. Principles guide decisions; **Design laws** bind them. See DESIGN.md, Principles.
_Avoid_: law (for these), heuristic (as the canonical word), guideline, rule of thumb

**Theme palette**:
The surfaces, text, borders, and **Semantic state** colours the theme owns per scheme. The **Brand sheet** consumes it and never redefines it; the palette's accent is the **Brand accent** by reference. See DESIGN.md, Law 8.
_Avoid_: theme (as the whole design system), skin, colour scheme (that is light / dark), palette (unqualified)

**Hairline**:
The only edge the interface draws: one width, solid, in a neutral tone — or the call-to-action edge, ink on the armed fill and the scheme's own ink or cream on the idle outline. A state is never an edge; a floating surface is a hairline-bordered surface on its own ground layer; nothing casts a shadow. See DESIGN.md, Laws 2 and 3.
_Avoid_: emphasis border, ring, inset shadow, bevel, elevation, divider (as a distinct thing), error border

**Corner**:
The one rounding every control and surface shares; dots and round pills are circles. Nothing is rounded more or less than anything else, and hierarchy never comes from corner size. See DESIGN.md, Law 4.
_Avoid_: radius scale, size-tiered corners, pill (for a non-round control), soft corner

**Unit**:
The one spacing measure every padding, margin, and gap is a multiple of. A half-unit exists only as an inset beside a **Hairline**. See DESIGN.md, Law 10.
_Avoid_: spacing scale, half-step, tight padding, off-grid (say "off the unit")

**UI type**:
The size at which the interface describes itself — labels, controls, chrome, panels. Everything the interface says about itself is UI type; what the agent and researcher write is **Content type**. See DESIGN.md, Law 5.
_Avoid_: body text, small text, chrome text (as a size), base size

**Content type**:
The size at which what the agent and the researcher write — message prose and tool output — renders, one step above **UI type**. See DESIGN.md, Law 5.
_Avoid_: body text (ambiguous between the two), base size, base text, prose size

**Focus ring**:
The thin outline, set off from the control, that marks keyboard focus — ink on light, cream on dark, never the **Brand accent**, because yellow prompts and never points. Present on every interactive element and never removed. See DESIGN.md, Laws 1 and 7.
_Avoid_: focus outline (generic), focus state (broader), blue ring, yellow ring, glow

**Arrival**:
The first of three movements the interface makes: a block entering the timeline, or a card swapping into the dock, rises and un-blurs into place; nothing moves on hover, press, or state change. Under reduced motion an arrival is a fade. See DESIGN.md, Law 6.
_Avoid_: animation (generic), hover lift, micro-interaction, bounce, transition (for the movement itself)

**Glide**:
The second movement: a marker that follows attention — the tour spotlight — moving between positions, position only. Under reduced motion a glide is a jump-cut with a fade. See DESIGN.md, Law 6.
_Avoid_: slide, tween, animated highlight, teleport (that is the reduced-motion fallback, not the behaviour)

**Working**:
The third and last movement: an indeterminate indicator — a loader, a pulse, a shimmer — running continuously within its own bounds, never travelling or scaling. Under reduced motion it holds a still frame. See DESIGN.md, Law 6.
_Avoid_: spinner (as the concept), loading animation, busy state (broader), determinate progress (shares the marker; it is not a movement)

**Quiet control**:
A control that is visually muted until hovered or focused but always exists — in the tab order, named, and fully visible on focus. Hover changes its emphasis, never its presence. See DESIGN.md, Law 7.
_Avoid_: hover-reveal (as the concept), hidden control, hover-only action, ghost button (that is a variant, not a behaviour)

### Ambient surfaces

**Live-solve indicator**:
The always-visible readout that a solve is running, shown in the titlebar so it
survives every Chat and Panel change. Reports progress at a glance and, on click, jumps
to the Chat that owns the running solve. Its absence means nothing is solving.
_Avoid_: Now-solving card, status bar, progress toast

**Setup nudge**:
The non-blocking prompt, shown alongside the first-run **Landing**, that reflects the
app-visible onboarding signal (profile completeness plus a dismiss flag today; richer
per-step progress — vault, Julia, connection — would require an extension→app bridge).
It persists until onboarding is complete and then disappears; it never gates the Chat.
_Avoid_: Onboarding modal, wizard (the wizard is the conversational interview; the nudge
only surfaces its state), setup wall

## Relationships

- The **Landing** is a **Chat**; the window never opens on anything else.
- The **Context tree** lives inside the context side panel and belongs to one session;
  the **Vault panel** belongs to the window and opens beside whatever Chat is showing. A
  Context-tree click on a vault node opens the Vault panel on that file — the two surfaces
  reference each other but neither owns the other.
- Every **Rail surface** opens as a **Panel** beside the **Chat**; the Chat is never
  replaced, only overlaid, and at most one Panel is open at a time.
- The **Rail** carries navigation surfaces above and the **Account zone** below; both
  live in the same strip but are different in kind — one is browsed, one is configured.
- The **Live-solve indicator** and the **Setup nudge** are ambient: they belong to no
  single Chat or Panel and persist across navigation until their condition clears
  (nothing solving; onboarding complete).
- A **Setup nudge** reflects onboarding state; it does not own the onboarding flow,
  which is the conversational overture interview conducted in the **Chat** itself.

## Retired concepts

These were real surfaces before the chat-first redesign and are intentionally gone. A
reader meeting them in older code or notes should map them forward:

- **Exemptions** (files and surfaces outside the design laws — logos, the poster, the
  engines, the diff engine, the sheet itself) → gone under DESIGN.md. Every surface is
  inside the system; what was exempt is now defined, or is a delta.
- **State edges** (a red, amber, or green border carrying success / warning / danger) → gone
  under DESIGN.md Law 3. A state is shown by fill, text, or icon; the edge stays a **Hairline**.
- **Yellow selection** (the soft-yellow fill and yellow edge on a selected or active row) → gone
  under DESIGN.md Law 1. Selection is neutral — a ground layer and a strong hairline; the
  **Brand accent** marks only the **Call to action**.
- **Elevation / float shadow** (the named float shadow, the theme's elevation tiers, the
  utility shadows) → gone under DESIGN.md Law 2. A dialog, popover, palette, or toast is a
  **Hairline**-bordered surface on its own ground layer; nothing in the interface casts a
  shadow.
- **Home / Dashboard** (the aggregate widget page) → dissolved. Its widgets became
  **Rail surfaces**, **Account zone** entries, in-Chat context, or first-run affordances.
- **Home top chrome strip** (the Home page's brand mark + defaults capsule + projects
  flyout + connections + gear) → replaced by the **Rail** and **Account zone**.
- **Titlebar Home affordance** — the titlebar's `/`-pointing Home button is repurposed to
  "new chat" once `/` is itself a Chat. The titlebar session/draft **tab strip** stays
  (it tracks *open* sessions); the Chats **Rail surface** is full history — the overlap is
  intentional, not a duplicate.
- **Project-avatar strip** (the always-visible `w-16` avatar rail in `sidebar-shell`) →
  legacy-only; it is already absent when the redesign flag is on. Project switching lives
  in the Projects **Rail surface**.
- **User-authored widget subsystem** (`amicode_author_widget`, "pin to dashboard",
  the widget grid, `/amicode/dashboard`) → retired with the dashboard. Authoring and
  pinning are removed, not re-homed; re-homing authored widgets as in-Chat artifacts is
  a possible future, not part of this redesign. See ADR 0001.
- **Home cards** "Meet Amico" and "Jump back in" → folded into the first-run Landing and
  the Chats surface respectively; they are no longer standalone surfaces.
- **Brain** (the ambient session map — first an inline timeline strip, then ADR 0002's
  proposed chat-wide background) → superseded by the **Context tree** top panel. The
  background direction was parked (ADR 0003); the strip row is deleted; the ambient engine
  survives as a library only. **Glass** (the frosted card surface of the background design)
  retires with it.
