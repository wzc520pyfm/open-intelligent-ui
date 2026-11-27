import { ExternalLink } from "lucide-react"
import { useState, type KeyboardEvent, type MouseEvent } from "react"

/** Configurable target for the promo CTA. Prefer `onOpen` in-app; `href` for an external tab. */
export const LIVE_PLAYGROUND_PROMO = {
  previewSrc: "/live-playground-preview.png",
  href: undefined as string | undefined,
}

export interface LivePlaygroundPromoProps {
  titlePrefix: string
  titleAccent: string
  titleSuffix?: string
  body: string
  action: string
  previewSrc?: string
  /** In-app open (e.g. switch to LIVE). Used when `href` is not set. */
  onOpen?: () => void
  /** External URL; opens in a new tab when set. */
  href?: string
}

/**
 * Contextual promo under a finished demo surface — product-oriented, not a banner ad.
 * Layout: Preview | Content | Action.
 */
export function LivePlaygroundPromo(props: LivePlaygroundPromoProps) {
  const previewSrc = props.previewSrc ?? LIVE_PLAYGROUND_PROMO.previewSrc
  const href = props.href ?? LIVE_PLAYGROUND_PROMO.href
  const [broken, setBroken] = useState(false)

  const open = () => {
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer")
      return
    }
    props.onOpen?.()
  }

  const onCardActivate = (event: MouseEvent | KeyboardEvent) => {
    // CTA handles its own click; ignore bubbled button presses.
    if ((event.target as HTMLElement).closest("[data-pg='live-promo-cta']")) return
    open()
  }

  return (
    <div
      data-pg="live-guide"
      className="pg-live-promo"
      role="link"
      tabIndex={0}
      aria-label={`${props.titlePrefix}${props.titleAccent}${props.titleSuffix ?? ""}. ${props.action}`}
      onClick={onCardActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onCardActivate(event)
        }
      }}
    >
      <div className="pg-live-promo-preview" aria-hidden="true">
        {broken || !previewSrc ? (
          <div className="pg-live-promo-fallback" />
        ) : (
          <img
            src={previewSrc}
            alt=""
            width={200}
            height={76}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        )}
      </div>

      <div className="pg-live-promo-content">
        <p className="pg-live-promo-title">
          <span aria-hidden="true" className="pg-live-promo-spark">
            ✦
          </span>
          <span className="min-w-0 truncate">
            {props.titlePrefix}
            <span className="pg-live-promo-accent">{props.titleAccent}</span>
            {props.titleSuffix}
          </span>
        </p>
        <p className="pg-live-promo-body">{props.body}</p>
      </div>

      <button
        type="button"
        data-pg="live-promo-cta"
        className="pg-live-promo-cta"
        onClick={(event) => {
          event.stopPropagation()
          open()
        }}
      >
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{props.action}</span>
        <span className="pg-live-promo-arrow" aria-hidden="true">
          →
        </span>
      </button>
    </div>
  )
}
