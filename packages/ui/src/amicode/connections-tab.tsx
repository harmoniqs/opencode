// AMICODE: Connections tab body for the status popover (amicode#166, Pasqal
// card #169). A thin projection of connections.ts — cardModel/stateCopy carry
// the behavioral contract (and its tests; the repo has no tsx component
// harness), the app layer owns fetching and the one-round-trip overlay, and
// this file only renders. SECURITY: secrets (token, Pasqal password) live in
// password-masked inputs and the submit payload; they are never rendered as
// text and the masked input clears when a submit lands connected.
import { createEffect, createSignal, For, Show } from "solid-js"
import {
  cardModel,
  connectionFormKind,
  connectionTitle,
  pasqalSubmitPayload,
  stateCopy,
  submitPayload,
  type ConnectionActionView,
  type ConnectionsView,
  type ConnectionStateLabels,
  type ConnectionView,
  type CredentialSubmitPayload,
} from "./connections"

export type ConnectionsTabLabels = {
  empty: string
  retry: string
  states: ConnectionStateLabels
  baseUrlPlaceholder: string
  tokenPlaceholder: string
  usernamePlaceholder: string
  passwordPlaceholder: string
  projectIdPlaceholder: string
  submit: string
  disconnect: string
  revalidate: string
  staleHint: string
  sessionOnlyHint: string
}

export function AmicodeConnectionsTab(props: {
  view: ConnectionsView | undefined
  labels: ConnectionsTabLabels
  actionError?: string
  onSubmit: (payload: CredentialSubmitPayload) => Promise<ConnectionActionView>
  onDisconnect: (id: string) => void
  onRevalidate: (id: string) => void
  onRetry: () => void
}) {
  return (
    <div class="flex flex-col" data-component="amicode-connections-tab">
      <Show
        when={props.view}
        fallback={<div class="h-8 mx-2 my-1 rounded-md bg-surface-raised-base animate-pulse" aria-hidden />}
      >
        {(view) => (
          <Show
            when={view().ok}
            fallback={
              <div class="flex items-center gap-2 w-full px-2 py-1">
                <div class="size-1.5 rounded-full shrink-0 bg-icon-critical-base" />
                <span class="text-14-regular text-text-weak flex-1 truncate">{view().error}</span>
                <button
                  type="button"
                  class="text-12-regular text-text-base underline shrink-0"
                  data-slot="amicode-connections-retry"
                  onClick={props.onRetry}
                >
                  {props.labels.retry}
                </button>
              </div>
            }
          >
            <Show
              when={view().connections.length > 0}
              fallback={<div class="text-14-regular text-text-base text-center my-auto py-1">{props.labels.empty}</div>}
            >
              <For each={view().connections}>
                {(conn) => (
                  <ConnectionCard
                    conn={conn}
                    labels={props.labels}
                    actionError={props.actionError}
                    onSubmit={props.onSubmit}
                    onDisconnect={props.onDisconnect}
                    onRevalidate={props.onRevalidate}
                  />
                )}
              </For>
            </Show>
          </Show>
        )}
      </Show>
    </div>
  )
}

const TONE_DOT: Record<ReturnType<typeof cardModel>["tone"], string> = {
  success: "bg-icon-success-base",
  critical: "bg-icon-critical-base",
  warning: "bg-icon-warning-base",
  pending: "bg-icon-warning-base animate-pulse",
  neutral: "bg-border-weak-base",
}

function ConnectionCard(props: {
  conn: ConnectionView
  labels: ConnectionsTabLabels
  actionError?: string
  onSubmit: (payload: CredentialSubmitPayload) => Promise<ConnectionActionView>
  onDisconnect: (id: string) => void
  onRevalidate: (id: string) => void
}) {
  const model = () => cardModel(props.conn)
  const formKind = () => connectionFormKind(props.conn.id)
  const [baseUrl, setBaseUrl] = createSignal("")
  const [token, setToken] = createSignal("")
  // pasqal credentials (#169): request-scope only — the password signal feeds
  // the payload and nothing else, and clears the moment a submit connects
  const [username, setUsername] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [projectId, setProjectId] = createSignal("")

  // wire-offered prefill fills an untouched field only, never overwrites input
  createEffect(() => {
    const wire = props.conn.baseUrl
    if (wire && baseUrl() === "") setBaseUrl(wire)
  })

  const submit = async (event: Event) => {
    event.preventDefault()
    const payload =
      formKind() === "pasqal-credentials"
        ? pasqalSubmitPayload(props.conn.id, username(), password(), projectId())
        : submitPayload(props.conn.id, baseUrl(), token())
    if (!payload) return // AC3: empty submission — no request, no state change
    const result = await props.onSubmit(payload)
    // clear the masked inputs once accepted; secrets are never echoed back
    if (result.ok && result.connection?.state === "connected") {
      setToken("")
      setPassword("")
    }
  }

  return (
    <div class="flex flex-col w-full px-2 py-1" data-slot="amicode-connection-card" data-state={props.conn.state}>
      <div class="flex items-center gap-2 w-full min-w-0">
        <div class={`size-1.5 rounded-full shrink-0 ${TONE_DOT[model().tone]}`} />
        <span class="text-14-regular text-text-base truncate">{connectionTitle(props.conn.id)}</span>
        <Show when={model().showRawState}>
          <span class="text-11-regular text-text-base bg-surface-base px-1.5 py-0.5 rounded-md shrink-0">
            {props.conn.rawState}
          </span>
        </Show>
        <div class="flex-1" />
        <Show when={model().showValidatedAt}>
          <span class="text-12-regular text-text-weak shrink-0" data-slot="amicode-connection-validated-at">
            {props.conn.validatedAt}
          </span>
        </Show>
      </div>

      <div class="pl-3.5 text-12-regular text-text-weak" data-slot="amicode-connection-state-copy">
        {stateCopy(props.conn, props.labels.states)}
        <Show when={model().showIdentity}>
          <span class="text-text-base"> · {props.conn.identity}</span>
        </Show>
      </div>

      <Show when={model().showDevices}>
        <div class="pl-3.5 text-11-regular text-text-weak truncate" data-slot="amicode-connection-devices">
          {props.conn.devices?.join(" · ")}
        </div>
      </Show>

      <Show when={model().showSessionOnly}>
        <div class="pl-3.5 text-11-regular text-text-weaker truncate" data-slot="amicode-connection-session-only">
          {props.labels.sessionOnlyHint}
        </div>
      </Show>

      <Show when={model().showStale}>
        <div class="pl-3.5 text-11-regular text-text-weaker truncate">{props.labels.staleHint}</div>
      </Show>

      <Show when={props.actionError}>
        <div class="flex items-center gap-2 pl-3.5" data-slot="amicode-connection-action-error">
          <div class="size-1 rounded-full shrink-0 bg-icon-critical-base" />
          <span class="text-11-regular text-text-weak truncate">{props.actionError}</span>
        </div>
      </Show>

      <Show when={model().showForm}>
        <form class="flex flex-col gap-1.5 pl-3.5 pt-1.5" data-slot="amicode-connection-form" onSubmit={submit}>
          <Show
            when={formKind() === "pasqal-credentials"}
            fallback={
              <>
                <input
                  type="text"
                  name="base_url"
                  autocomplete="off"
                  spellcheck={false}
                  placeholder={props.labels.baseUrlPlaceholder}
                  value={baseUrl()}
                  disabled={model().formDisabled}
                  onInput={(event) => setBaseUrl(event.currentTarget.value)}
                  class="text-12-regular text-text-base bg-surface-base rounded-md px-2 py-1 border border-border-weak-base"
                />
                <input
                  type="password"
                  name="token"
                  autocomplete="off"
                  placeholder={props.labels.tokenPlaceholder}
                  value={token()}
                  disabled={model().formDisabled}
                  onInput={(event) => setToken(event.currentTarget.value)}
                  class="text-12-regular text-text-base bg-surface-base rounded-md px-2 py-1 border border-border-weak-base"
                />
              </>
            }
          >
            <input
              type="text"
              name="username"
              autocomplete="off"
              spellcheck={false}
              placeholder={props.labels.usernamePlaceholder}
              value={username()}
              disabled={model().formDisabled}
              onInput={(event) => setUsername(event.currentTarget.value)}
              class="text-12-regular text-text-base bg-surface-base rounded-md px-2 py-1 border border-border-weak-base"
            />
            <input
              type="password"
              name="password"
              autocomplete="off"
              placeholder={props.labels.passwordPlaceholder}
              value={password()}
              disabled={model().formDisabled}
              onInput={(event) => setPassword(event.currentTarget.value)}
              class="text-12-regular text-text-base bg-surface-base rounded-md px-2 py-1 border border-border-weak-base"
            />
            <input
              type="text"
              name="project_id"
              autocomplete="off"
              spellcheck={false}
              placeholder={props.labels.projectIdPlaceholder}
              value={projectId()}
              disabled={model().formDisabled}
              onInput={(event) => setProjectId(event.currentTarget.value)}
              class="text-12-regular text-text-base bg-surface-base rounded-md px-2 py-1 border border-border-weak-base"
            />
          </Show>
          <button
            type="submit"
            disabled={model().formDisabled}
            data-slot="amicode-connection-submit"
            class="text-12-regular text-text-base underline self-start disabled:opacity-50"
          >
            {props.labels.submit}
          </button>
        </form>
      </Show>

      <Show when={model().showActions}>
        <div class="flex gap-3 pl-3.5 pt-1">
          <button
            type="button"
            data-slot="amicode-connection-revalidate"
            class="text-12-regular text-text-base underline"
            onClick={() => props.onRevalidate(props.conn.id)}
          >
            {props.labels.revalidate}
          </button>
          <button
            type="button"
            data-slot="amicode-connection-disconnect"
            class="text-12-regular text-text-weak underline"
            onClick={() => props.onDisconnect(props.conn.id)}
          >
            {props.labels.disconnect}
          </button>
        </div>
      </Show>
    </div>
  )
}
