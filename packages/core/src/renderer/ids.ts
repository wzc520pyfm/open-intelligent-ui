const REGISTRY = Symbol.for("open-intelligent-ui.ids")

function live(): Set<string> {
  const scope = globalThis as { [REGISTRY]?: Set<string> }
  if (!scope[REGISTRY]) scope[REGISTRY] = new Set()
  return scope[REGISTRY]
}

export interface ClaimedId {
  id: string
  /** Gives the id back once nothing on the page carries it. */
  release(): void
}

/**
 * An id no other surface on the page has. A framework's own ids are unique
 * within one app or root; a page may hold several (islands, one root per
 * message, two copies of a framework), and a surface scopes its styles by
 * its id. The wanted id comes back unchanged unless it is taken. The set is
 * shared by every copy of this module on the page.
 */
export function claimId(wanted: string): ClaimedId {
  const taken = live()
  let id = wanted
  for (let count = 2; taken.has(id); count++) id = `${wanted}n${count}`
  taken.add(id)
  let released = false
  return {
    id,
    release() {
      if (released) return
      released = true
      taken.delete(id)
    },
  }
}
