import { Button, InputGroup } from "@heroui/react"
import { ArrowUp, ImagePlus, Square, X } from "lucide-react"
import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react"
import type { Copy } from "../i18n"
import { shotFromBlob, type Shot } from "../shot"
import type { Lane } from "../studio"
import { Segmented } from "./controls"

/** The Live composer: which lane the message is for, a screenshot, and the ways out of this browser. */
export function LiveComposer(props: {
  copy: Copy
  mode: "demos" | "live"
  width: "phone" | "chat" | "wide"
  lane: Lane
  onLane: (lane: Lane) => void
  draft: string
  onDraft: (value: string) => void
  draftRef: RefObject<HTMLTextAreaElement | null>
  shot: Shot | null
  onShot: (shot: Shot | null) => void
  streaming: boolean
  onSubmit: () => void
  onStop: () => void
  onShare: () => Promise<string>
  onExport: () => void
  onImport: (file: File) => Promise<string>
  onNew: () => void
  canExport: boolean
}) {
  const { copy } = props
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [shotError, setShotError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const shotAttempt = useRef(0)
  const live = props.mode === "live"
  const canSend = Boolean(props.draft.trim() || (live && props.shot))

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(null), 6000)
    return () => window.clearTimeout(timer)
  }, [note])

  const attach = async (blob: Blob) => {
    const attempt = ++shotAttempt.current
    const result = await shotFromBlob(blob)
    if (attempt !== shotAttempt.current) return
    if (!result.ok) {
      setShotError(result.reason === "type" ? copy.shotType : result.reason === "size" ? copy.shotSize : copy.shotRead)
      return
    }
    setShotError(null)
    props.onShot(result.shot)
  }

  // A conversion still running must not put the picture back after the reader
  // has removed it, started a new chat, or sent the message.
  const cancelShot = () => {
    shotAttempt.current += 1
  }

  const send = () => {
    if (!canSend) return
    cancelShot()
    props.onSubmit()
  }

  const onDrop = (event: DragEvent) => {
    if (!live) return
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"))
    if (!file) return
    event.preventDefault()
    void attach(file)
  }

  return (
    <form
      className="shrink-0 px-3 pb-3 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
      onDragOver={(event) => {
        if (!live) return
        if (![...event.dataTransfer.items].some((item) => item.type.startsWith("image/"))) return
        event.preventDefault()
      }}
      onDrop={onDrop}
    >
      <div className="pg-column" data-width={props.width}>
        {live ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={copy.laneLabel}
              value={props.lane}
              onChange={props.onLane}
              options={[
                { id: "design", label: copy.laneDesign },
                { id: "interface", label: copy.laneInterface },
              ]}
            />
            {props.shot ? (
              <span
                data-pg="shot"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-separator bg-background py-1 pr-1 pl-1"
              >
                <img src={props.shot.preview} alt="" className="size-6 rounded-full object-cover" />
                <span className="text-xs text-muted">{copy.screenshot}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="size-6 min-w-6"
                  aria-label={copy.removeShot}
                  onPress={() => {
                    cancelShot()
                    props.onShot(null)
                  }}
                >
                  <X className="size-3" aria-hidden="true" />
                </Button>
              </span>
            ) : null}
          </div>
        ) : null}
        <InputGroup className="pg-composer w-full items-end! rounded-3xl border border-separator py-2 pr-2 pl-4 shadow-sm">
          <InputGroup.TextArea
            ref={props.draftRef}
            rows={1}
            className="max-h-[calc(2rem*4)] min-h-8 flex-1 resize-none border-0 bg-transparent p-0 leading-8 shadow-none focus-visible:ring-0"
            value={props.draft}
            onChange={(event) => props.onDraft(event.target.value)}
            onPaste={(event) => {
              if (!live) return
              const item = [...event.clipboardData.items].find((entry) => entry.type.startsWith("image/"))
              const file = item?.getAsFile()
              if (!file) return
              event.preventDefault()
              void attach(file)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send()
              }
            }}
            placeholder={live ? (props.lane === "design" ? copy.askDesign : copy.askInterface) : copy.replyAgent}
            aria-label={copy.message}
          />
          <InputGroup.Suffix className="items-end! self-end gap-1 p-0!">
            {live ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ""
                    if (file) void attach(file)
                  }}
                />
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  className="size-8 min-w-8 rounded-full"
                  aria-label={copy.attachShot}
                  isDisabled={props.streaming}
                  onPress={() => fileRef.current?.click()}
                >
                  <ImagePlus className="size-3.5" aria-hidden="true" />
                </Button>
              </>
            ) : null}
            {props.streaming && live ? (
              <Button
                isIconOnly
                size="sm"
                variant="secondary"
                className="size-8 min-w-8 rounded-full"
                aria-label={copy.stop}
                onPress={props.onStop}
              >
                <Square className="size-3" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                isIconOnly
                size="sm"
                type="submit"
                className="size-8 min-w-8 rounded-full"
                aria-label={copy.send}
                isDisabled={!canSend}
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </InputGroup.Suffix>
        </InputGroup>
        {live ? (
          <div className="flex flex-col gap-1.5" data-pg="studio">
            {props.shot ? <p className="text-xs text-muted">{copy.shotHint}</p> : null}
            {shotError ? <p className="text-xs text-muted">{shotError}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                data-pg="share"
                onPress={() => {
                  void props.onShare().then(setNote)
                }}
              >
                {copy.share}
              </Button>
              <Button size="sm" variant="ghost" data-pg="export" isDisabled={!props.canExport} onPress={props.onExport}>
                {copy.exportStudio}
              </Button>
              <input
                ref={importRef}
                type="file"
                accept=".json,.md,.markdown,text/markdown,application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  void props.onImport(file).then(setNote)
                }}
              />
              <Button size="sm" variant="ghost" data-pg="import" onPress={() => importRef.current?.click()}>
                {copy.importStudio}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-pg="new-chat"
                onPress={() => {
                  cancelShot()
                  props.onNew()
                }}
              >
                {copy.newChat}
              </Button>
            </div>
            {note ? (
              note.startsWith("http") ? (
                <input
                  readOnly
                  value={note}
                  aria-label={copy.share}
                  className="w-full rounded-xl border border-separator bg-background px-3 py-1.5 text-xs"
                  onFocus={(event) => event.target.select()}
                />
              ) : (
                <p className="text-xs text-muted" data-pg="studio-note">
                  {note}
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  )
}
