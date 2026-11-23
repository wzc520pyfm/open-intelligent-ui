import { type Child, type Component, component, fragment } from "../../dom/node"
import { UI_SDK_ELEMENTS, type UiSdkElement } from "../../registry/ui-sdk.generated"
import {
  drawElement,
  rootOf,
  Scoped,
  type ScopedProps,
  type Special,
  type UiSdkComponent,
} from "../adapter"

/** Marks the items markup wrote, apart from the ones the list element would add itself. */
const OURS = "data-iui-file"

type Item = Element & { file?: File }

const keys = new WeakMap<File, number>()
let count = 0
const keyOf = (file: File): number => {
  let key = keys.get(file)
  if (key === undefined) {
    key = ++count
    keys.set(file, key)
  }
  return key
}

const filesOf = (list: Element): File[] => {
  const value = (rootOf(list) as unknown as { value?: unknown } | null)?.value
  return Array.isArray(value) ? value.filter((file): file is File => file instanceof File) : []
}

/**
 * React draws the list's children once per chosen file. The element does
 * that from a `<template>`, which cannot hold what markup computes for each
 * file, so the files are read from the root and the items written out.
 */
const FileList: Component<{ props: Record<string, unknown> }> = (instance) => {
  let list: Element | null = null
  let root: Element | null = null
  let files: File[] = []

  const read = () => {
    if (!list) return
    const next = filesOf(list)
    if (next.length === files.length && next.every((file, index) => file === files[index])) return
    files = next
    instance.invalidate()
  }

  const assign = () => {
    if (!list) return
    let changed = false
    const items = list.querySelectorAll<Item>(`:scope > ui-file-input-item[${OURS}]`)
    items.forEach((item, index) => {
      const file = files[index]
      if (file && item.file !== file) {
        item.file = file
        changed = true
      }
    })
    // The element adds an item of its own for a file it finds none for yet.
    for (const item of list.querySelectorAll(`:scope > ui-file-input-item:not([${OURS}])`)) {
      item.remove()
    }
    if (changed) instance.invalidate()
  }

  instance.onUpdated(assign)
  instance.onUnmounted(() => root?.removeEventListener("valuechange", read))

  return () => {
    const drawn = drawElement(
      UI_SDK_ELEMENTS.FileInputList as UiSdkElement,
      instance.props.props,
      undefined,
      files.map((file) => fragment(instance.children, keyOf(file)))
    )
    drawn.hooks = {
      mounted: (element) => {
        list = element
        root = rootOf(element)
        root?.addEventListener("valuechange", read)
        read()
      },
    }
    return drawn
  }
}

const ours = (props: Record<string, unknown>) => ({ ...props, [OURS]: "" })

export const SPECIALS: Record<string, Special> = {
  FileInputList: {
    draw: (props, key, children: Child[]) => component(FileList, { props }, key, children),
  },
  FileInputItem: {
    draw: (props, key, children) =>
      drawElement(UI_SDK_ELEMENTS.FileInputItem as UiSdkElement, ours(props), key, children),
    scoped(this: UiSdkComponent, props, key, lets, render) {
      return component(
        Scoped as Component<ScopedProps>,
        {
          type: this,
          props: ours(props),
          lets,
          render,
          read: (element) => {
            const { file } = element as Item
            if (!file) return null
            return [{ file, name: file.name, size: file.size, type: file.type }]
          },
        },
        key
      )
    },
  },
}
