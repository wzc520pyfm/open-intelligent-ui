import { tick } from "svelte"
import { createAttachmentKey } from "svelte/attachments"

type Props = Record<string | symbol, unknown>
type Listener = (event: Event) => unknown

const FIELDS = new Set(["input", "textarea", "select"])

/** What each radio button on screen was last given, for the others of its group to be put back by. */
const radios = new WeakMap<Element, () => Props>()

// One key each: Svelte runs what is under a key again when it is another function.
const RADIO = createAttachmentKey()
const NUMBER = createAttachmentKey()

function putBackValue(field: HTMLInputElement | HTMLTextAreaElement, wanted: unknown): void {
  if (typeof wanted !== "string" || field.type === "file") return
  // A number field reads "1.0" while "1" is what state holds. They are the
  // same number, and writing it back would undo what is being typed.
  const same =
    field.type === "number" && field.value !== "" && wanted !== ""
      ? Number(field.value) === Number(wanted)
      : field.value === wanted
  if (!same) field.value = wanted
}

function putBackChecked(input: HTMLInputElement, props: Props): void {
  if (typeof props.checked === "boolean" && input.checked !== props.checked) input.checked = props.checked
}

function putBack(element: Element, props: Props): void {
  if (element.localName === "select") {
    const wanted = props.value
    if (typeof wanted !== "string" && !Array.isArray(wanted)) return
    for (const option of (element as HTMLSelectElement).options) {
      const selected = Array.isArray(wanted) ? wanted.includes(option.value) : option.value === wanted
      if (option.selected !== selected) option.selected = selected
    }
    return
  }
  if (element.localName === "textarea") return putBackValue(element as HTMLTextAreaElement, props.value)
  const input = element as HTMLInputElement
  putBackChecked(input, props)
  putBackValue(input, props.value)
  if (input.type !== "radio" || !input.name) return
  // Picking one radio button unpicks the rest of its group, which were given a state too.
  const group = (input.form ?? input.getRootNode()) as ParentNode
  for (const other of group.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    if (other === input || other.name !== input.name || other.form !== input.form) continue
    const given = radios.get(other)
    if (given) putBackChecked(other, given())
  }
}

function after(handler: unknown, then: Listener): Listener {
  return (event) => {
    try {
      if (typeof handler === "function") return (handler as Listener)(event)
    } finally {
      then(event)
    }
  }
}

/**
 * A field given a `value` or `checked` shows it, whatever the reader does:
 * in React a field is put back to what it was given once its handlers have
 * run, so one whose state did not take what was typed shows the state.
 * Svelte sets a value only when it changes, so this does the putting back.
 * `read` gives the element's props as they are now, not as they were when
 * the listener was made.
 */
export function held(tag: string, read: () => Props): Props {
  const props = read()
  if (!FIELDS.has(tag) || !("value" in props || "checked" in props)) return props
  const settle: Listener = (event) => {
    const element = event.currentTarget as Element | null
    if (!element) return
    // Once Svelte has drawn what the handlers changed.
    void tick().then(() => {
      if (element.isConnected) putBack(element, read())
    })
  }
  const out: Props = { ...props, oninput: after(props.oninput, settle), onchange: after(props.onchange, settle) }
  if (tag !== "input" || typeof props.type !== "string") return out
  const type = props.type.toLowerCase()
  if (type === "radio" && "checked" in props) {
    out[RADIO] = (element: Element) => {
      radios.set(element, read)
    }
  }
  if (type === "number" && typeof props.value === "string") {
    // Svelte writes a value whenever it changes. State that follows a number
    // field changes on every key, and writing "1" over "1.0" would stop a
    // reader from typing "1.05".
    const wanted = props.value
    delete out.value
    out[NUMBER] = (element: Element) => putBackValue(element as HTMLInputElement, wanted)
  }
  return out
}
