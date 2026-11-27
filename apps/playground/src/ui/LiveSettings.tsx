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

/** Compact vendor mark for the LIVE model button. */
function ProviderMark(props: { id: ProviderId; className?: string }) {
  const className = props.className ?? "size-3.5 shrink-0"
  if (props.id === "openai") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
        <path d="M22.28 10.63a5.5 5.5 0 0 0-.48-5.15 5.58 5.58 0 0 0-6.02-2.4 5.57 5.57 0 0 0-4.15-1.9 5.58 5.58 0 0 0-5.33 3.87A5.5 5.5 0 0 0 1.72 9.5a5.5 5.5 0 0 0 .73 7.12 5.5 5.5 0 0 0 .48 5.15 5.58 5.58 0 0 0 6.02 2.4 5.57 5.57 0 0 0 4.15 1.9 5.58 5.58 0 0 0 5.33-3.87 5.5 5.5 0 0 0 4.57-4.45 5.5 5.5 0 0 0-.72-7.12ZM13.5 21.2a4.12 4.12 0 0 1-2.64-.95l.13-.07 4.38-2.53a.72.72 0 0 0 .36-.62v-6.18l1.85 1.07c.04.02.06.05.06.1v5.12a4.15 4.15 0 0 1-4.14 4.06Zm-8.9-3.8a4.1 4.1 0 0 1-.5-2.77l.13.08 4.38 2.53a.72.72 0 0 0 .72 0l5.35-3.09v2.14a.12.12 0 0 1-.05.1l-4.43 2.56a4.15 4.15 0 0 1-5.6-1.55Zm-1.16-9.64a4.12 4.12 0 0 1 2.15-1.81v5.23a.72.72 0 0 0 .36.62l5.34 3.08-1.85 1.07a.12.12 0 0 1-.11 0L5.05 13.4a4.15 4.15 0 0 1-1.77-5.64Zm15.8 3.69-5.35-3.09 1.85-1.07a.12.12 0 0 1 .11 0l4.43 2.56a4.15 4.15 0 0 1-6.28 4.7v-5.23a.72.72 0 0 0-.36-.62l-5.34-3.08 1.85-1.07a.12.12 0 0 1 .11 0l4.43 2.56a4.15 4.15 0 0 1 4.55 6.34Zm2.15-2.79-.13-.08-4.38-2.53a.72.72 0 0 0-.72 0L8.81 9.59V7.45a.12.12 0 0 1 .05-.1l4.43-2.56a4.15 4.15 0 0 1 6.1 4.3ZM8.64 14.4l-1.85-1.07a.12.12 0 0 1-.06-.1V8.11a4.15 4.15 0 0 1 6.8-3.19l-.13.07-4.38 2.53a.72.72 0 0 0-.36.62v6.18Z" />
      </svg>
    )
  }
  if (props.id === "anthropic") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
        <path d="M13.76 4h-3.52L4 20h3.02l1.32-3.52h7.32L16.98 20H20L13.76 4Zm-3.9 9.84 2.64-7.04 2.64 7.04h-5.28Z" />
      </svg>
    )
  }
  if (props.id === "deepseek") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
        <path d="M12 2.2c-4.8 0-8.7 3.4-8.7 7.6 0 2.6 1.5 4.9 3.8 6.3-.2.7-.7 2.1-1.6 3.4 1.8-.2 3.5-1 4.7-1.9.6.1 1.2.2 1.8.2 4.8 0 8.7-3.4 8.7-7.6S16.8 2.2 12 2.2Zm-2.3 5.6c.7 0 1.2.6 1.2 1.3s-.5 1.3-1.2 1.3-1.2-.6-1.2-1.3.5-1.3 1.2-1.3Zm4.6 0c.7 0 1.2.6 1.2 1.3s-.5 1.3-1.2 1.3-1.2-.6-1.2-1.3.5-1.3 1.2-1.3Zm-6.8 4.1c.9 1.5 2.5 2.5 4.5 2.5s3.6-1 4.5-2.5c-1.1.5-2.7.8-4.5.8s-3.4-.3-4.5-.8Z" />
      </svg>
    )
  }
  return <Settings2 className={className} aria-hidden="true" />
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
  const vendor = providerLabel(copy, live.provider)
  // Button shows logo + model; aria keeps the vendor name for assistive tech.
  const label = connected ? `${vendor} · ${live.model}` : copy.connectModel
  const visible = connected ? live.model : copy.connectModel

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
      <Button
        size="sm"
        variant={connected ? "secondary" : "primary"}
        className="max-w-[15rem] min-w-0 sm:max-w-[18rem]"
        data-pg="model"
        aria-label={label}
      >
        {connected ? (
          <ProviderMark id={live.provider} />
        ) : (
          <Settings2 className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate">{visible}</span>
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
