import { Button, Input, Label, Popover, Switch, TextField } from "@heroui/react"
import { Settings2 } from "lucide-react"
import type { Copy } from "../i18n"
import { type LiveSettings, type ProviderId, PROVIDERS, providerById } from "../live"
import { Picker } from "./controls"

export function providerLabel(copy: Copy, id: ProviderId): string {
  if (id === "openai") return copy.providerOpenAI
  if (id === "anthropic") return copy.providerAnthropic
  if (id === "deepseek") return copy.providerDeepSeek
  return copy.providerCustom
}

/** Which model answers in a live session, and with what key. */
export function LiveSettingsButton(props: {
  copy: Copy
  live: LiveSettings
  onLive: (live: LiveSettings) => void
  useTools: boolean
  onUseTools: (on: boolean) => void
}) {
  const { copy, live } = props
  const custom = live.provider === "custom"
  const connected = Boolean(live.model && live.apiKey)

  const choose = (id: ProviderId) => {
    const preset = providerById(id)
    props.onLive({
      provider: preset.id,
      // Custom keeps whatever URL the reader already typed.
      baseUrl: preset.id === "custom" ? live.baseUrl : preset.baseUrl,
      model: preset.model || live.model,
      apiKey: live.apiKey,
    })
  }

  return (
    <Popover>
      <Button size="sm" variant={connected ? "secondary" : "primary"} data-pg="model">
        <Settings2 className="size-3.5" aria-hidden="true" />
        {connected ? `${providerLabel(copy, live.provider)} · ${live.model}` : copy.connectModel}
      </Button>
      <Popover.Content className="w-80" placement="bottom end">
        <Popover.Dialog className="flex flex-col gap-3">
          <Popover.Heading className="text-sm font-semibold">{copy.modelSettings}</Popover.Heading>
          <Picker
            label={copy.provider}
            className="w-full"
            value={live.provider}
            onChange={choose}
            options={PROVIDERS.map((item) => ({ id: item.id, label: providerLabel(copy, item.id) }))}
          />
          <TextField
            value={live.baseUrl}
            onChange={(baseUrl) => props.onLive({ ...live, baseUrl })}
            isReadOnly={!custom}
          >
            <Label>{copy.endpoint}</Label>
            <Input
              placeholder={custom ? "https://your-gateway.example/v1" : providerById(live.provider).baseUrl}
              spellCheck={false}
            />
          </TextField>
          <TextField value={live.model} onChange={(model) => props.onLive({ ...live, model })}>
            <Label>{copy.model}</Label>
            <Input placeholder={providerById(live.provider).model || "model name"} spellCheck={false} />
          </TextField>
          <TextField
            type="password"
            value={live.apiKey}
            onChange={(apiKey) => props.onLive({ ...live, apiKey })}
          >
            <Label>{copy.key}</Label>
            <Input placeholder={copy.keyPlaceholder} autoComplete="off" />
          </TextField>
          <Switch isSelected={props.useTools} onChange={props.onUseTools}>
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              {copy.ticketTools}
            </Switch.Content>
          </Switch>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
