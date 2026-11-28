import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Copy } from "../src/i18n"
import type { Shot, ShotResult } from "../src/shot"
import { LiveComposer } from "../src/ui/LiveComposer"

const gate = vi.hoisted(() => {
  const pending: Array<(result: ShotResult) => void> = []
  return {
    pending,
    shotFromBlob: () =>
      new Promise<ShotResult>((resolve) => {
        pending.push(resolve)
      }),
  }
})

vi.mock("../src/shot", () => ({
  shotFromBlob: gate.shotFromBlob,
}))

const copy = {
  laneLabel: "Lane",
  laneDesign: "Design",
  laneInterface: "Interface",
  askDesign: "Describe a design",
  askInterface: "Ask for an interface",
  replyAgent: "Reply",
  message: "Message",
  screenshot: "Screenshot",
  attachShot: "Attach a screenshot",
  removeShot: "Remove screenshot",
  shotHint: "Sent with the next message",
  shotType: "Not an image",
  shotSize: "Too large",
  shotRead: "Could not read",
  share: "Share",
  exportStudio: "Export",
  importStudio: "Import",
  newChat: "New",
  studioMenu: "Actions",
  send: "Send",
  stop: "Stop",
} as Copy

const shot = (data: string): Shot => ({
  mediaType: "image/png",
  data,
  preview: `data:image/png;base64,${data}`,
})

function Harness(props: { initial?: Shot | null }) {
  const [current, setCurrent] = useState<Shot | null>(props.initial ?? null)
  return (
    <LiveComposer
      copy={copy}
      mode="live"
      width="chat"
      lane="design"
      onLane={() => {}}
      draft="A terracotta paper page"
      onDraft={() => {}}
      draftRef={{ current: null }}
      shot={current}
      onShot={setCurrent}
      streaming={false}
      onSubmit={() => setCurrent(null)}
      onStop={() => {}}
      onShare={async () => ""}
      onExport={() => {}}
      onImport={async () => ""}
      onNew={() => setCurrent(null)}
      canExport={false}
    />
  )
}

function attach() {
  const input = document.querySelector('input[accept^="image/"]') as HTMLInputElement
  const file = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], "board.png", { type: "image/png" })
  fireEvent.change(input, { target: { files: [file] } })
}

test("share, export, import and a new chat open from the actions button", async () => {
  render(<Harness />)
  expect(screen.queryByRole("button", { name: "Share" })).toBeNull()
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Actions" }))
  })
  for (const name of ["Share", "Export", "Import", "New"]) {
    expect(screen.getByRole("button", { name })).toBeTruthy()
  }
})

test("the screenshot control sits before the message, away from send", () => {
  render(<Harness />)
  const attach = screen.getByRole("button", { name: "Attach a screenshot" })
  const message = screen.getByRole("textbox", { name: "Message" })
  const send = screen.getByRole("button", { name: "Send" })
  expect(attach.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(attach.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
})

describe("a screenshot that is still converting", () => {
  beforeEach(() => {
    gate.pending.length = 0
  })

  test("does not come back after it is removed", async () => {
    render(<Harness initial={shot("old")} />)
    expect(screen.getByText("Screenshot")).toBeTruthy()
    await act(async () => {
      attach()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove screenshot" }))
    })
    await act(async () => {
      gate.pending[0]?.({ ok: true, shot: shot("new") })
    })
    expect(screen.queryByText("Screenshot")).toBeNull()
  })

  test("does not come back after New", async () => {
    render(<Harness />)
    await act(async () => {
      attach()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Actions" }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New" }))
    })
    await act(async () => {
      gate.pending[0]?.({ ok: true, shot: shot("new") })
    })
    expect(screen.queryByText("Screenshot")).toBeNull()
  })

  test("does not come back after Send", async () => {
    render(<Harness initial={shot("old")} />)
    await act(async () => {
      attach()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
    })
    await act(async () => {
      gate.pending[0]?.({ ok: true, shot: shot("new") })
    })
    expect(screen.queryByText("Screenshot")).toBeNull()
  })

  test("keeps the newer file when two conversions overlap", async () => {
    render(<Harness />)
    await act(async () => {
      attach()
      attach()
    })
    await act(async () => {
      gate.pending[0]?.({ ok: true, shot: shot("old") })
    })
    expect(screen.queryByText("Screenshot")).toBeNull()
    await act(async () => {
      gate.pending[1]?.({ ok: true, shot: shot("new") })
    })
    expect(document.querySelector("[data-pg=shot] img")?.getAttribute("src")).toBe("data:image/png;base64,new")
  })
})
