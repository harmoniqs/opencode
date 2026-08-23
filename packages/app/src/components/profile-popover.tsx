import { batch, createEffect, createSignal, Show } from "solid-js"
import { Popover } from "@opencode-ai/ui/popover"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { announceChromeDropdown, chromeDropdownOpenId, clearChromeDropdown } from "@/utils/chrome-dropdown"
import { useServer } from "@/context/server"
import { amicodeGet, amicodePost } from "@/utils/amicode-fetch"

interface ProfileData {
  name: string
  role: string | null
  affiliation: string | null
  affiliation_logo: string | null
  focus: string | null
  description: string | null
  github: string | null
  scholar: string | null
  custom_link: { url: string; label: string } | null
}

export function ProfilePopoverTrigger() {
  const [shown, setShownRaw] = createSignal(false)
  const [profile, setProfile] = createSignal<ProfileData | null>(null)
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal({
    name: "",
    role: "",
    affiliation: "",
    focus: "",
    description: "",
    scholar: "",
    github: "",
    custom_link_url: "",
    custom_link_label: "",
  })
  const server = useServer()

  const setShown = (next: boolean) => {
    batch(() => {
      if (next) announceChromeDropdown("profile")
      else clearChromeDropdown("profile")
      setShownRaw(next)
    })
  }

  createEffect(() => {
    if (chromeDropdownOpenId() !== "profile" && shown()) setShownRaw(false)
  })

  const fetchProfile = async () => {
    try {
      const data = await amicodeGet(server.current, "/amicode/profile") as any
      if (data.ok && data.you) setProfile(data.you)
    } catch {
      /* silent */
    }
  }

  createEffect(() => {
    if (shown()) void fetchProfile()
  })

  const beginEdit = () => {
    const p = profile()
    setDraft({
      name: p?.name ?? "",
      role: p?.role ?? "",
      affiliation: p?.affiliation ?? "",
      focus: p?.focus ?? "",
      description: p?.description ?? "",
      scholar: p?.scholar ?? "",
      github: p?.github ?? "",
      custom_link_url: p?.custom_link?.url ?? "",
      custom_link_label: p?.custom_link?.label ?? "",
    })
    setEditing(true)
  }

  const save = async () => {
    const d = draft()
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(d)) params.set(k, v)
    try {
      const data = await amicodePost(server.current, `/amicode/profile?${params.toString()}`) as any
      if (data.ok && data.you) setProfile(data.you)
      setEditing(false)
    } catch {
      /* silent */
    }
  }

  const initials = () => {
    const p = profile()
    if (!p?.name) return ""
    const parts = p.name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0][0]?.toUpperCase() ?? ""
  }

  const isEmpty = () => {
    const p = profile()
    if (!p) return true
    // Show edit mode only when there's truly nothing set (no name beyond default, no role, no affiliation)
    return (!p.name || p.name === "Practitioner") && !p.role && !p.affiliation && !p.focus
  }

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noreferrer")
  }

  return (
    <Popover
      open={shown()}
      onOpenChange={setShown}
      triggerAs="button"
      triggerProps={{
        type: "button",
        "aria-label": "Profile",
        class: "shrink-0",
        style: {
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          width: "36px",
          height: "36px",
          border: "none",
          "border-radius": "8px",
          background: shown() ? "var(--v2-background-bg-layer-02)" : "transparent",
          cursor: "pointer",
          padding: "0",
          color: "var(--v2-text-text-muted)",
        },
      }}
      trigger={<IconV2 name="person" />}
      class="[&_[data-slot=popover-body]]:p-0 w-[320px] max-w-[calc(100vw-40px)] bg-transparent border-0 shadow-none rounded-lg"
      gutter={8}
      placement="bottom-start"
    >
      <Show when={shown()}>
        <div
          style={{
            background: "var(--v2-background-bg-base)",
            border: "1px solid var(--v2-border-border-base)",
            "border-radius": "10px",
            padding: "16px",
            "box-shadow": "var(--shadow-lg-border-base)",
          }}
        >
          <Show
            when={!editing() && !isEmpty()}
            fallback={<EditForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(false)} isEmpty={isEmpty()} />}
          >
            <ReadView profile={profile()!} initials={initials()} onEdit={beginEdit} onOpenExternal={openExternal} />
          </Show>
        </div>
      </Show>
    </Popover>
  )
}

function ReadView(props: {
  profile: ProfileData
  initials: string
  onEdit: () => void
  onOpenExternal: (url: string) => void
}) {
  const [logoBroken, setLogoBroken] = createSignal(false)

  return (
    <div>
      {/* Header: avatar + name/role/affiliation */}
      <div style={{ display: "flex", gap: "12px", "align-items": "flex-start" }}>
        {/* Avatar */}
        <div
          style={{
            width: "48px",
            height: "48px",
            "border-radius": "10px",
            "flex-shrink": "0",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            overflow: "hidden",
            background: "var(--accent, #fff676)",
            color: "var(--accent-ink, #111214)",
            "font-size": "16px",
            "font-weight": "700",
          }}
        >
          <Show when={props.initials} fallback={<IconV2 name="person" />}>
            {props.initials}
          </Show>
        </div>
        {/* Name + Role + Affiliation */}
        <div style={{ flex: "1", "min-width": "0" }}>
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
            <div
              style={{
                "font-size": "15px",
                "font-weight": "600",
                color: "var(--v2-text-text-base)",
                overflow: "hidden",
                "text-overflow": "ellipsis",
                "white-space": "nowrap",
              }}
            >
              {props.profile.name}
            </div>
            <button
              type="button"
              onClick={props.onEdit}
              title="Edit profile"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--v2-text-text-faint)",
                "font-size": "12px",
                padding: "2px",
                "line-height": "1",
              }}
            >
              ✎
            </button>
          </div>
          <Show when={props.profile.role}>
            <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)", "margin-top": "1px" }}>
              {props.profile.role}
            </div>
          </Show>
          <Show when={props.profile.affiliation}>
            <div style={{ "font-size": "12px", color: "var(--v2-text-text-muted)", "margin-top": "1px" }}>
              {props.profile.affiliation}
            </div>
          </Show>
        </div>
      </div>

      {/* Focus + Description */}
      <Show when={props.profile.focus || props.profile.description}>
        <div style={{ "margin-top": "12px" }}>
          <Show when={props.profile.focus}>
            <div style={{ "font-size": "12px", color: "var(--v2-text-text-base)", "font-weight": "500" }}>
              {props.profile.focus}
            </div>
          </Show>
          <Show when={props.profile.description}>
            <div
              style={{
                "font-size": "12px",
                color: "var(--v2-text-text-muted)",
                "margin-top": "4px",
                display: "-webkit-box",
                "-webkit-line-clamp": "2",
                "-webkit-box-orient": "vertical",
                overflow: "hidden",
              }}
            >
              {props.profile.description}
            </div>
          </Show>
        </div>
      </Show>

      {/* Link pills */}
      <div style={{ display: "flex", gap: "8px", "margin-top": "12px" }}>
        <LinkPill
          icon="🎓"
          url={props.profile.scholar}
          tooltip="Google Scholar"
          onOpen={props.onOpenExternal}
        />
        <LinkPill
          icon="GH"
          url={props.profile.github}
          tooltip="GitHub"
          onOpen={props.onOpenExternal}
        />
        <LinkPill
          icon="🔗"
          url={props.profile.custom_link?.url ?? null}
          tooltip={props.profile.custom_link?.label || "Custom link"}
          onOpen={props.onOpenExternal}
        />
      </div>
    </div>
  )
}

function LinkPill(props: { icon: string; url: string | null; tooltip: string; onOpen: (url: string) => void }) {
  const filled = () => !!props.url
  return (
    <button
      type="button"
      title={props.tooltip}
      disabled={!filled()}
      onClick={() => filled() && props.onOpen(props.url!)}
      style={{
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        width: "28px",
        height: "28px",
        "border-radius": "6px",
        border: "1px solid var(--v2-border-border-base)",
        background: "var(--v2-background-bg-layer-01)",
        cursor: filled() ? "pointer" : "default",
        opacity: filled() ? "1" : "0.35",
        "font-size": "12px",
        color: "var(--v2-text-text-muted)",
        padding: "0",
      }}
    >
      {props.icon}
    </button>
  )
}

function EditForm(props: {
  draft: () => Record<string, string>
  setDraft: (d: Record<string, string>) => void
  onSave: () => void
  onCancel: () => void
  isEmpty: boolean
}) {
  const update = (key: string, value: string) => props.setDraft({ ...props.draft(), [key]: value })

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
      <input
        class="amc-input amc-input--compact"
        placeholder="Your name"
        value={props.draft().name}
        onInput={(e) => update("name", e.currentTarget.value)}
        autofocus={props.isEmpty}
        style={{ "font-size": "14px", "font-weight": "600" }}
      />
      <input
        class="amc-input amc-input--compact"
        placeholder="Role (e.g. Postdoc, PhD Student)"
        value={props.draft().role}
        onInput={(e) => update("role", e.currentTarget.value)}
      />
      <input
        class="amc-input amc-input--compact"
        placeholder="Affiliation"
        value={props.draft().affiliation}
        onInput={(e) => update("affiliation", e.currentTarget.value)}
      />
      <input
        class="amc-input amc-input--compact"
        placeholder="Research area"
        value={props.draft().focus}
        onInput={(e) => update("focus", e.currentTarget.value)}
      />
      <textarea
        class="amc-input amc-input--compact"
        placeholder="Short bio"
        value={props.draft().description}
        onInput={(e) => update("description", e.currentTarget.value)}
        rows={2}
        style={{ resize: "none" }}
      />
      <div style={{ display: "flex", gap: "6px", "margin-top": "4px" }}>
        <input
          class="amc-input amc-input--compact"
          placeholder="Scholar URL"
          value={props.draft().scholar}
          onInput={(e) => update("scholar", e.currentTarget.value)}
          style={{ flex: "1" }}
        />
        <input
          class="amc-input amc-input--compact"
          placeholder="GitHub URL"
          value={props.draft().github}
          onInput={(e) => update("github", e.currentTarget.value)}
          style={{ flex: "1" }}
        />
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          class="amc-input amc-input--compact"
          placeholder="Custom link URL"
          value={props.draft().custom_link_url}
          onInput={(e) => update("custom_link_url", e.currentTarget.value)}
          style={{ flex: "1" }}
        />
        <input
          class="amc-input amc-input--compact"
          placeholder="Label"
          value={props.draft().custom_link_label}
          onInput={(e) => update("custom_link_label", e.currentTarget.value)}
          style={{ width: "80px" }}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end", "margin-top": "4px" }}>
        <Show when={!props.isEmpty}>
          <button
            type="button"
            onClick={props.onCancel}
            style={{
              background: "none",
              border: "1px solid var(--v2-border-border-base)",
              "border-radius": "6px",
              padding: "4px 12px",
              "font-size": "12px",
              color: "var(--v2-text-text-muted)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </Show>
        <button
          type="button"
          onClick={props.onSave}
          style={{
            background: "var(--accent, #fff676)",
            color: "var(--accent-ink, #111214)",
            border: "none",
            "border-radius": "6px",
            padding: "4px 12px",
            "font-size": "12px",
            "font-weight": "600",
            cursor: "pointer",
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}
