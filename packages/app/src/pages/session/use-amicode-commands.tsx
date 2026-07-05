import { useCommand, type CommandOption } from "@/context/command"

// amicode: ops commands bridged to the VS Code extension host. Registered on BOTH
// the session and the new-session (draft) pages so they work everywhere inside
// Amicode — the draft page has no command palette (DialogSelectFile needs session
// context), so restart/update-memory carry direct keybinds, which the global
// command keydown handler fires with no dialog. The rest stay palette-discoverable
// inside a session. Shown only when framed. en-only by design.
//
// Each command posts {source:"amicode",kind:"command",command} to window.parent;
// chat_panel.ts relays it to an ALLOWLISTED vscode command.

const inAmicode = () => typeof window !== "undefined" && window.self !== window.top

const postAmicode = (command: string) => {
  try {
    window.parent?.postMessage({ source: "amicode", kind: "command", command }, "*")
  } catch {}
}

export function useAmicodeCommands() {
  const command = useCommand()
  const amico = (option: Omit<CommandOption, "category">): CommandOption => ({ ...option, category: "Amico" })

  command.register("amicode", () =>
    inAmicode()
      ? [
          amico({
            id: "amicode.restartServer",
            title: "Restart Amico server",
            description: "Relaunch the opencode server — picks up a rebuilt binary",
            keybind: "mod+alt+r",
            onSelect: () => postAmicode("amicode.restartServer"),
          }),
          amico({
            id: "amicode.distillNow",
            title: "Update my memory now",
            description: "Run the background distiller over recent work",
            keybind: "mod+alt+m",
            onSelect: () => postAmicode("amicode.distillNow"),
          }),
          amico({
            id: "amicode.stopRun",
            title: "Stop current solve",
            onSelect: () => postAmicode("amicode.stopRun"),
          }),
          amico({
            id: "amicode.savePulse",
            title: "Save pulse from current run",
            onSelect: () => postAmicode("amicode.savePulse"),
          }),
          amico({
            id: "amicode.openRunDir",
            title: "Open current run directory",
            onSelect: () => postAmicode("amicode.openRunDir"),
          }),
          amico({
            id: "amicode.openInspector",
            title: "Open run inspector",
            onSelect: () => postAmicode("amicode.openInspector"),
          }),
        ]
      : [],
  )
}
