import { ListBox, Select, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import type { ReactNode } from "react"

export interface Option<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

/** A few choices side by side, one of them on. */
export function Segmented<T extends string>(props: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  className?: string
  /** Show only the icons, with the label read to assistive technology. */
  iconOnly?: boolean
}) {
  return (
    <ToggleButtonGroup
      aria-label={props.label}
      className={props.className}
      size="sm"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([props.value])}
      onSelectionChange={(keys) => {
        const [next] = [...keys]
        if (next !== undefined) props.onChange(String(next) as T)
      }}
    >
      {props.options.map((option, index) => (
        <ToggleButton
          key={option.id}
          id={option.id}
          aria-label={props.iconOnly ? option.label : undefined}
          isIconOnly={props.iconOnly}
        >
          {index > 0 ? <ToggleButtonGroup.Separator /> : null}
          {option.icon}
          {props.iconOnly ? null : option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

/** One choice from a list that opens. The label sits inside the trigger. */
export function Picker<T extends string>(props: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  className?: string
  /** Leave the label to assistive technology. */
  bare?: boolean
}) {
  return (
    <Select
      aria-label={props.label}
      className={props.className}
      value={props.value}
      onChange={(key) => {
        if (key !== null && !Array.isArray(key)) props.onChange(String(key) as T)
      }}
    >
      <Select.Trigger className="min-h-8 gap-1.5 py-1 text-sm">
        {props.bare ? null : <span className="hidden text-muted sm:inline">{props.label}</span>}
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {props.options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

/** Hamster mark (square). Pass `variant="full"` for the wordmark lockup. */
export function Logo(props: { className?: string; variant?: "mark" | "full" }) {
  const full = props.variant === "full"
  if (full) {
    return (
      <img
        src="/logo-full.png"
        srcSet="/logo-full.png 2400w"
        sizes="min(100vw - 2rem, 28rem)"
        width={420}
        height={101}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={["h-auto w-[min(100%,28rem)]", props.className].filter(Boolean).join(" ")}
      />
    )
  }
  return (
    <img
      src="/logo-mark.png"
      srcSet="/logo-mark.png 512w"
      sizes="(max-width: 639px) 2rem, 2.75rem"
      width={512}
      height={512}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={props.className}
    />
  )
}

export function GitHubMark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.21-3.37-1.21-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0 1 12 6.96c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.2 10.2 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}
