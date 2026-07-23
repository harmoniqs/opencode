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
- **Dashboard widget pinning** ("pin to dashboard", the aggregate grid,
  `/amicode/dashboard`) → retired: the dashboard is unreachable, so nothing pins there.
  The widget infrastructure itself (`amicode_author_widget`, the widget grid) is **kept** —
  widgets still render inline in the Chat (the message timeline). Only the dashboard as a
  pin target is gone. See ADR 0001.
- **Home cards** "Meet Amico" and "Jump back in" → folded into the first-run Landing and
  the Chats surface respectively; they are no longer standalone surfaces.
