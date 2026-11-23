import { $PROXY, createSignal, getObserver } from "solid-js"

const WRITABLE = { ownedWrite: true }

const isPlain = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Whether two prop values are the same to a component. Markup's literals are
 * built again on every pass, so lists and records are compared by content.
 */
export function same(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true
  if (depth > 5) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => same(item, b[index], depth + 1))
  }
  if (isPlain(a) && isPlain(b)) {
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key], depth + 1))
  }
  return false
}

const isHandler = (name: string) => /^on[A-Z]/.test(name)

export interface Bag {
  /** What the component is given as its props. */
  props: Record<string, unknown>
  /** Changes what the props hold. Only readers of what changed hear of it. */
  update(next: Record<string, unknown>): void
}

/**
 * The props of a mounted component. A Solid component runs once and reads
 * its props later, from effects, so the object it was given has to stay the
 * same while the values behind it change. Each prop is a signal of its own,
 * made when first read, and so is the set of names.
 *
 * `special` props are computed when read, like `children`.
 */
export function createBag(
  initial: Record<string, unknown>,
  special: Record<string, () => unknown> = {}
): Bag {
  let current = initial
  const cells = new Map<string, [() => number, (next: (count: number) => number) => void]>()
  const [names, setNames] = createSignal(0, WRITABLE)
  const callers = new Map<string, (...args: unknown[]) => unknown>()

  // Outside an effect or a memo nothing would hear of a change, and Solid
  // warns about a signal read there, so only a tracked read subscribes.
  const track = (name: string) => {
    if (!getObserver()) return
    let cell = cells.get(name)
    if (!cell) {
      const [read, write] = createSignal(0, WRITABLE)
      cell = [read, write as (next: (count: number) => number) => void]
      cells.set(name, cell)
    }
    cell[0]()
  }

  // A handler is a new function on every pass. The component keeps one that
  // calls the latest, so it never sees a handler change.
  const caller = (name: string) => {
    let call = callers.get(name)
    if (!call) {
      call = (...args: unknown[]) => {
        const handler = current[name]
        return typeof handler === "function" ? handler(...args) : undefined
      }
      callers.set(name, call)
    }
    return call
  }

  const read = (name: string): unknown => {
    if (Object.hasOwn(special, name)) return (special[name] as () => unknown)()
    track(name)
    if (!Object.hasOwn(current, name)) return undefined
    const value = current[name]
    return typeof value === "function" && isHandler(name) ? caller(name) : value
  }

  const has = (name: string): boolean => {
    if (Object.hasOwn(special, name)) return true
    if (getObserver()) names()
    return Object.hasOwn(current, name)
  }

  const props: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_, name) =>
        name === $PROXY ? props : typeof name === "string" ? read(name) : undefined,
      has: (_, name) => name === $PROXY || (typeof name === "string" && has(name)),
      ownKeys: () => {
        if (getObserver()) names()
        return [...new Set([...Object.keys(current), ...Object.keys(special)])]
      },
      getOwnPropertyDescriptor: (_, name) =>
        typeof name === "string" && has(name)
          ? { enumerable: true, configurable: true, get: () => read(name) }
          : undefined,
      set: () => true,
      deleteProperty: () => true,
    }
  )

  return {
    props,
    update(next) {
      const before = current
      current = next
      const beforeNames = Object.keys(before)
      const reshaped =
        beforeNames.length !== Object.keys(next).length ||
        beforeNames.some((name) => !Object.hasOwn(next, name))
      for (const [name, cell] of cells) {
        const was = before[name]
        const now = next[name]
        const unchanged =
          isHandler(name) && typeof was === "function" && typeof now === "function"
            ? true
            : same(was, now)
        if (!unchanged) cell[1]((count) => count + 1)
      }
      if (reshaped) setNames((count) => count + 1)
    },
  }
}
