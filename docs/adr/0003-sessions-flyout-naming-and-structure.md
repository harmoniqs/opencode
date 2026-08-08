# Sessions flyout: naming convention and tab structure

Status: accepted (2026-08-08)

Tracking: harmoniqs/amicode#273

The chrome strip's dropdown is labeled **"Sessions"** (not "Chats", not "Projects"). The term "session" is the canonical user-facing noun for a conversation with Amico — consistent with the SDK entity name, the tab labels, the command palette, and the sidebar. "Chat" was trialed briefly and reverted; "Project" refers exclusively to the workspace/directory concept.

## Structure

The flyout has two tabs at the top: **Active** and **Archived**.

- **Active** — shows all non-archived sessions, sorted with open-tab sessions first (green breathing indicator dot, tooltip "Open"), then by recency. Each row has a hover-reveal archive button (right side).
- **Archived** — lazy-loaded on first tab switch. Each row shows a leading archive icon (left of title) and a hover-reveal unarchive button (arrow-undo icon, distinct from the archive box icon). Paginated with "Show more".

The search bar spans both tabs and includes results from both pools (archived results distinguished by the leading archive icon).

## Naming rules

| Concept | Canonical term | Never |
|---------|---------------|-------|
| A conversation with the agent | session | chat, thread |
| The workspace/directory | project | — |
| The dropdown in the chrome strip | sessions flyout | chats flyout |
| Ending a session's active life | archive | delete, close |
| Restoring an archived session | unarchive | restore, reopen |

## Considered

- "Chats" as the button label (rejected: inconsistent with every other surface that says "session").
- A single scrollable list with archived collapsed at the bottom (rejected: archived section unreachable when the active list is long).
- Right-click context menu for archive (rejected: redundant with the hover button, adds complexity).
