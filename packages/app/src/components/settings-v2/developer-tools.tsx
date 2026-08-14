import { Component, Show } from "solid-js"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import {
  createDeveloperToolsController,
  type DeveloperToolsController,
} from "./developer-tools-controller"

const DeveloperToolsContent: Component<{ controller: DeveloperToolsController }> = (props) => {
  const language = useLanguage()
  const opencodeError = () => {
    const s = props.controller.status()
    if (!s || s.opencodeValid) return undefined
    return s.opencodeError ?? language.t("settings.general.row.opencodePath.error.notFound")
  }
  const amicodeError = () => {
    const s = props.controller.status()
    if (!s || s.amicodeValid) return undefined
    if (s.buildError) return s.buildError
    return s.amicodeError ?? language.t("settings.general.row.amicodePath.error.notFound")
  }
  const building = () => props.controller.status()?.building ?? false
  const reloadNeeded = () => props.controller.status()?.reloadNeeded ?? false

  return (
    <SettingsListV2>
      <SettingsRowV2
        title={language.t("settings.general.row.developerMode.title")}
        description={language.t("settings.general.row.developerMode.description")}
      >
        <div data-action="settings-developer-mode">
          <Switch
            checked={props.controller.enabled()}
            onChange={(checked) => props.controller.setEnabled(checked)}
          />
        </div>
      </SettingsRowV2>

      <SettingsRowV2
        title={language.t("settings.general.row.opencodePath.title")}
        description={
          <>
            {language.t("settings.general.row.opencodePath.description")}
            <Show when={opencodeError()}>
              <span class="settings-v2-field-error">{opencodeError()}</span>
            </Show>
          </>
        }
      >
        <div class="w-full sm:w-[280px]">
          <TextInputV2
            data-action="settings-opencode-path"
            type="text"
            appearance="base"
            value={props.controller.opencodePath()}
            onInput={(event) => props.controller.setOpencodePath(event.currentTarget.value)}
            onBlur={() => props.controller.commitOpencodePath()}
            placeholder={language.t("settings.general.row.opencodePath.placeholder")}
            disabled={!props.controller.enabled()}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            aria-label={language.t("settings.general.row.opencodePath.title")}
          />
        </div>
      </SettingsRowV2>

      <SettingsRowV2
        title={language.t("settings.general.row.amicodePath.title")}
        description={
          <>
            {language.t("settings.general.row.amicodePath.description")}
            <Show when={building()}>
              <span class="settings-v2-field-info">
                {language.t("settings.general.row.amicodePath.building")}
              </span>
            </Show>
            <Show when={amicodeError()}>
              <span class="settings-v2-field-error">{amicodeError()}</span>
            </Show>
            <Show when={reloadNeeded()}>
              <span class="settings-v2-field-warning">
                {language.t("settings.general.row.amicodePath.reloadNeeded")}
              </span>
            </Show>
          </>
        }
      >
        <div class="w-full sm:w-[280px]">
          <TextInputV2
            data-action="settings-amicode-path"
            type="text"
            appearance="base"
            value={props.controller.amicodePath()}
            onInput={(event) => props.controller.setAmicodePath(event.currentTarget.value)}
            onBlur={() => props.controller.commitAmicodePath()}
            placeholder={language.t("settings.general.row.amicodePath.placeholder")}
            disabled={!props.controller.enabled()}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            aria-label={language.t("settings.general.row.amicodePath.title")}
          />
        </div>
      </SettingsRowV2>
    </SettingsListV2>
  )
}

export const DeveloperToolsSection: Component = () => {
  const language = useLanguage()
  const controller = createDeveloperToolsController()

  return (
    <div id="settings-developer-tools" class="settings-v2-section">
      <h3 class="settings-v2-section-title">
        {language.t("settings.general.section.developerTools")}
      </h3>
      <DeveloperToolsContent controller={controller} />
    </div>
  )
}
