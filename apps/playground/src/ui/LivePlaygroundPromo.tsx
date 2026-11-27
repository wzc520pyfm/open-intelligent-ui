import { useId, useState, type KeyboardEvent, type MouseEvent } from "react"

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

/** Pair of shiny sparkles matching the reference promo. */
function PromoSparks(props: { className?: string }) {
  const id = useId().replace(/:/g, "")
  const fill = `pg-promo-spark-${id}`
  return (
    <svg
      viewBox="0 0 22 18"
      width="18"
      height="15"
      className={props.className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7.2 1.2 8.4 5.1l3.9 1.2-3.9 1.2-1.2 3.9-1.2-3.9L2.1 6.3l3.9-1.2L7.2 1.2Z"
        fill={`url(#${fill})`}
      />
      <path
        d="M16.4 0.6 17.2 3.2l2.6.8-2.6.8-.8 2.6-.8-2.6-2.6-.8 2.6-.8.8-2.6Z"
        fill={`url(#${fill})`}
        opacity="0.92"
      />
      <path
        d="M18.8 9.2 19.3 10.9l1.7.5-1.7.5-.5 1.7-.5-1.7-1.7-.5 1.7-.5.5-1.7Z"
        fill={`url(#${fill})`}
        opacity="0.75"
      />
      <defs>
        <linearGradient id={fill} x1="2" y1="1" x2="18" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE08A" />
          <stop offset="0.55" stopColor="#F5C84A" />
          <stop offset="1" stopColor="#E8A317" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * Reference swoosh: steep rising stroke into a small open tip, spark near tip.
 */
function PromoCurveArrow(props: { className?: string }) {
  const id = useId().replace(/:/g, "")
  const stroke = `pg-promo-curve-${id}`
  return (
    <svg
      viewBox="0 0 72 64"
      width="72"
      height="64"
      className={props.className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 50C20 46 30 28 40 16C46 8 54 6 62 14"
        stroke={`url(#${stroke})`}
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <path
        d="M55 7.5 62 14 54 20"
        stroke={`url(#${stroke})`}
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M48 5 48.85 7.5 51.35 8.35 48.85 9.2 48 11.7 47.15 9.2 44.65 8.35 47.15 7.5Z"
        fill="#D2C6FF"
      />
      <defs>
        <linearGradient id={stroke} x1="8" y1="50" x2="62" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7A68D4" stopOpacity="0.65" />
          <stop offset="0.55" stopColor="#8F7CE6" />
          <stop offset="1" stopColor="#A494F4" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * Contextual promo under a finished demo surface — product-oriented, not a banner ad.
 * Layout: Preview | Content | Action (+ decorative curve).
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
          <PromoSparks className="pg-live-promo-spark" />
          <span className="min-w-0 truncate">
            {props.titlePrefix}
            <span className="pg-live-promo-accent">{props.titleAccent}</span>
            {props.titleSuffix}
          </span>
        </p>
        <p className="pg-live-promo-body">{props.body}</p>
      </div>

      <div className="pg-live-promo-action">
        <PromoCurveArrow className="pg-live-promo-curve" />
        <button
          type="button"
          data-pg="live-promo-cta"
          className="pg-live-promo-cta"
          onClick={(event) => {
            event.stopPropagation()
            open()
          }}
        >
          <span>{props.action}</span>
          <span className="pg-live-promo-arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </div>
  )
}
