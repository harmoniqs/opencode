# CM6 Editing Shortcuts — Manual Test Plan

Open the Files Changed tab in the side panel with any file that has edits (e.g. make a change in a session, or pick a file the agent modified).

## 1. Selection highlight

| # | Step | Expected |
|---|------|----------|
| 1.1 | Click inside the editable (right/modified) pane and drag across several words | Selected text is visibly highlighted — not invisible |
| 1.2 | Click inside the read-only (left/original) pane and drag | Selection highlight is visible there too |
| 1.3 | Click outside the editor (e.g. the chat area) so the editor loses focus | The selection dims but remains faintly visible (unfocused state) |

## 2. Undo / Redo

| # | Step | Expected |
|---|------|----------|
| 2.1 | Type some text in the editable pane | Text appears |
| 2.2 | Press **Cmd+Z** (Mac) / **Ctrl+Z** (Win/Linux) | The typed text is undone |
| 2.3 | Press **Cmd+Shift+Z** or **Cmd+Y** | The undone text is redone |
| 2.4 | Wait for the agent to push a file update (or trigger one via a new message) | The content updates in place — no scroll jump |
| 2.5 | Press **Cmd+Z** after the agent update | The agent's update is NOT undone (external updates are excluded from history) |

## 3. Copy / Paste / Cut

| # | Step | Expected |
|---|------|----------|
| 3.1 | Select text in the editable pane, press **Cmd+C**, then **Cmd+V** in a different app (e.g. Notes) | The correct selected text appears — no garbled/extra content |
| 3.2 | Switch to **unified** diff style, select text, press **Cmd+C**, paste elsewhere | Only the modified file content is copied — deleted lines from the diff are NOT included |
| 3.3 | Press **Cmd+A** then **Cmd+C** in the editable pane, paste elsewhere | The entire file content is copied correctly |
| 3.4 | Select text, press **Cmd+X** | Text is removed from the editor AND appears on the clipboard |
| 3.5 | After cutting, press **Cmd+Z** | The cut text is restored (cut is undoable) |
| 3.6 | Press **Cmd+V** to paste clipboard text into the editor | Text is inserted at the cursor |

## 4. Select All

| # | Step | Expected |
|---|------|----------|
| 4.1 | Click in the editable pane, press **Cmd+A** | All text **within that editor pane** is selected — not the entire review panel |
| 4.2 | Click in the prompt composer (not the editor), press **Cmd+A** | The prompt text (or full chat timeline if empty) is selected — editor is unaffected |

## 5. Bracket matching

| # | Step | Expected |
|---|------|----------|
| 5.1 | Open a file with brackets/parens (e.g. `.ts`, `.json`) and place the cursor next to a `(`, `## 6. Revert

| # | Step | Expected |
|---|------|----------|
| 6.1 | Make edits in the editable pane, then click the **Revert** button | Content reverts to the original |
| 6.2 | Immediately press **Cmd+Z** | The revert is undone — your edits are restored |

## 7. Read-only mode

| # | Step | Expected |
|---|------|----------|
| 7.1 | While the agent is busy (editor locked), try **Cmd+Z** | Nothing happens — no error, no unexpected behavior |
| 7.2 | While read-only, select text with mouse and press **Cmd+C**, paste elsewhere | The selected text is copied correctly |
| 7.3 | While read-only, press **Cmd+A** then **Cmd+C**, paste elsewhere | The full file content is copied correctly |

## 8. No regressions

| # | Step | Expected |
|---|------|----------|
| 8.1 | In the **prompt composer**, type text, Cmd+A, Cmd+C, paste elsewhere | Works as before — composer is not affected by CM6 changes |
| 8.2 | In a **profile field** (Settings), type text, Cmd+V to paste | Works as before — profile fields still own their paste |
| 8.3 | In the **chat area** (non-editable), Cmd+A then Cmd+C | Selects the full chat and copies it — not broken by CM6 changes |
