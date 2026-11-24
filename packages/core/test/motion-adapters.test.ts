import { describe, expect, test } from "vitest"
import {
  createMotionAdapter,
  cssKeyframes,
  cubicBezier,
  gsapAdapter,
  keyframeCount,
  type MotionTiming,
  motionAdapter,
  waapiAdapter,
} from "../src/motion"
import { defineLibrary } from "../src"
import { buildSystemPrompt } from "../src/prompt"

const timing = (over: Partial<MotionTiming> = {}): MotionTiming => ({
  kind: "enter",
  name: "rise",
  duration: 260,
  delay: 40,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  bezier: [0.16, 1, 0.3, 1],
  repeat: false,
  alternate: false,
  ...over,
})

const RISE = { opacity: [0, 1], y: [10, 0] }
// The adapters only hand the element on; none of them reads it.
const element = {} as HTMLElement

describe("keyframes", () => {
  test("are spelled as the properties CSS animates, leaving `transform` alone", () => {
    expect(cssKeyframes({ opacity: [0, 1], y: [10, 0], scale: [0.86, 1], rotate: [-8, 0], blur: [4, 0] })).toEqual({
      opacity: [0, 1],
      translate: ["0px 10px", "0px 0px"],
      scale: ["0.86 0.86", "1 1"],
      rotate: ["-8deg", "0deg"],
      filter: ["blur(4px)", "blur(0px)"],
    })
  })

  test("a shorter list holds its last value while a longer one plays on", () => {
    expect(keyframeCount({ opacity: [0, 1], scale: [1, 1.2, 1] })).toBe(3)
    expect(cssKeyframes({ opacity: [0, 1], scale: [1, 1.2, 1] })).toEqual({
      opacity: [0, 1, 1],
      scale: ["1 1", "1.2 1.2", "1 1"],
    })
    expect(cssKeyframes({ x: [-100, 0], scaleX: [0.5, 1], scaleY: [2, 1] })).toEqual({
      translate: ["-100px 0px", "0px 0px"],
      scale: ["0.5 2", "1 1"],
    })
  })

  test("a cubic bezier is the curve CSS draws", () => {
    const linear = cubicBezier(0, 0, 1, 1)
    for (const at of [0, 0.25, 0.5, 0.9, 1]) expect(linear(at)).toBeCloseTo(at, 4)
    // `ease`, at the values a browser reports.
    const ease = cubicBezier(0.25, 0.1, 0.25, 1)
    expect(ease(0.25)).toBeCloseTo(0.4085, 3)
    expect(ease(0.5)).toBeCloseTo(0.8024, 3)
    const out = cubicBezier(0.16, 1, 0.3, 1)
    expect(out(-1)).toBe(0)
    expect(out(2)).toBe(1)
    expect(out(0.3)).toBeGreaterThan(0.8)
    // A curve with a flat start must still be solved.
    expect(cubicBezier(1, 0, 0, 1)(0.5)).toBeCloseTo(0.5, 3)
  })
})

describe("createMotionAdapter", () => {
  test("takes an engine of the product's own, and refuses what can't animate", () => {
    const adapter = createMotionAdapter({ name: "", animate: () => undefined })
    expect(adapter.name).toBe("Custom")
    expect(() => createMotionAdapter({ name: "Broken" } as never)).toThrow(TypeError)
  })
})

describe("waapiAdapter", () => {
  function animated(reject = false) {
    const calls: { frames: unknown; options: KeyframeAnimationOptions }[] = []
    let cancelled = 0
    const target = {
      animate(frames: unknown, options: KeyframeAnimationOptions) {
        if (reject && options.easing) throw new TypeError("bad easing")
        calls.push({ frames, options })
        return { finished: Promise.resolve(), cancel: () => cancelled++ }
      },
    } as unknown as HTMLElement
    return { target, calls, cancelled: () => cancelled }
  }

  test("plays the design's timing, and shows the first frame through the delay", () => {
    const { target, calls, cancelled } = animated()
    const playback = waapiAdapter().animate(target, RISE, timing())
    expect(calls).toEqual([
      {
        frames: { opacity: [0, 1], translate: ["0px 10px", "0px 0px"] },
        options: {
          duration: 260,
          delay: 40,
          iterations: 1,
          direction: "normal",
          fill: "backwards",
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
      },
    ])
    playback?.cancel()
    expect(cancelled()).toBe(1)
  })

  test("what leaves stays gone, and a loop repeats", () => {
    const { target, calls } = animated()
    const adapter = waapiAdapter()
    adapter.animate(target, { opacity: [1, 0] }, timing({ kind: "exit", name: "leave" }))
    adapter.animate(target, { opacity: [1, 0.5] }, timing({ kind: "loop", repeat: true, alternate: true }))
    expect(calls[0]?.options.fill).toBe("both")
    expect(calls[1]?.options).toMatchObject({ iterations: Number.POSITIVE_INFINITY, direction: "alternate" })
  })

  test("plays without the easing when the browser can't read it, and not at all without the API", () => {
    const { target, calls } = animated(true)
    expect(waapiAdapter().animate(target, RISE, timing({ easing: "spring(1)" }))).toBeDefined()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.options.easing).toBeUndefined()
    expect(waapiAdapter().animate(element, RISE, timing())).toBeUndefined()
  })

  test("says the browser keeps its clock and that it writes no inline style", () => {
    expect(waapiAdapter()).toMatchObject({ name: "Web Animations", writesStyle: false, startsOnPaint: true })
  })
})

describe("motionAdapter", () => {
  function fake() {
    const calls: { keyframes: Record<string, unknown>; transition: Record<string, unknown> }[] = []
    let stopped = 0
    const animate = (_element: unknown, keyframes: Record<string, unknown>, transition: Record<string, unknown>) => {
      calls.push({ keyframes, transition })
      return { finished: Promise.resolve(), cancel: () => stopped++ }
    }
    return { animate, calls, stopped: () => stopped }
  }

  test("an entrance keeps the design's duration and curve, in seconds", () => {
    const { animate, calls, stopped } = fake()
    const playback = motionAdapter(animate).animate(element, { ...RISE, blur: [4, 0] }, timing())
    expect(calls[0]).toEqual({
      keyframes: { opacity: [0, 1], y: [10, 0], filter: ["blur(4px)", "blur(0px)"] },
      transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1], delay: 0.04 },
    })
    playback?.cancel()
    expect(stopped()).toBe(1)
  })

  test("emphasis and morph are springs, while what fades keeps the design's curve", () => {
    const { animate, calls } = fake()
    const adapter = motionAdapter(animate)
    adapter.animate(element, { opacity: [0, 1], scale: [0.8, 1] }, timing({ kind: "emphasis", name: "pop", duration: 500, delay: 0 }))
    const tween = { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
    expect(calls[0]?.transition).toEqual({
      ...tween,
      type: "spring",
      bounce: 0.4,
      visualDuration: 0.3,
      opacity: tween,
      filter: tween,
      delay: 0,
    })
    adapter.animate(element, { x: [10, 0] }, timing({ kind: "layout", name: "morph" }))
    expect(calls[1]?.transition).toMatchObject({ type: "spring", bounce: 0.18 })
  })

  test("a product chooses the transition for a kind, or turns the spring off", () => {
    const { animate, calls } = fake()
    const adapter = motionAdapter(animate, {
      transitions: { enter: { type: "spring", stiffness: 300, damping: 24 }, emphasis: false },
    })
    adapter.animate(element, RISE, timing())
    expect(calls[0]?.transition).toMatchObject({ type: "spring", stiffness: 300, damping: 24 })
    expect(calls[0]?.transition.visualDuration).toBeUndefined()
    adapter.animate(element, RISE, timing({ kind: "emphasis" }))
    expect(calls[1]?.transition.type).toBeUndefined()
    // A preset's own settings win over the kind's.
    adapter.animate(element, RISE, timing({ transition: { type: "tween", ease: "circOut" } }))
    expect(calls[2]?.transition).toMatchObject({ type: "tween", ease: "circOut" })
  })

  test("a loop repeats, and controls that are only thenable still end", async () => {
    const calls: Record<string, unknown>[] = []
    const adapter = motionAdapter((_element, _keyframes, transition) => {
      calls.push(transition)
      return { then: (resolve: () => void) => resolve(), stop: () => {} }
    })
    const playback = adapter.animate(element, { opacity: [1, 0.5] }, timing({ kind: "loop", repeat: true, alternate: true }))
    expect(calls[0]).toMatchObject({ repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" })
    await expect(playback?.finished).resolves.toBeUndefined()
  })
})

describe("gsapAdapter", () => {
  function fake() {
    const log: { call: string; args: unknown[] }[] = []
    let killed = 0
    const tween = { kill: () => killed++ }
    const gsap = {
      fromTo: (...args: unknown[]) => (log.push({ call: "fromTo", args }), tween),
      to: (...args: unknown[]) => (log.push({ call: "to", args }), tween),
      set: (...args: unknown[]) => void log.push({ call: "set", args }),
    }
    return { gsap, log, killed: () => killed }
  }
  // biome-ignore lint/suspicious/noExplicitAny: read loosely to keep the assertions short
  const vars = (entry: { args: unknown[] } | undefined, index: number) => entry?.args[index] as any

  test("goes from the first frame to the last on the design's curve", async () => {
    const { gsap, log, killed } = fake()
    const playback = gsapAdapter(gsap).animate(element, { ...RISE, rotate: [-8, 0], blur: [4, 0] }, timing())
    expect(log).toHaveLength(1)
    expect(log[0]?.call).toBe("fromTo")
    expect(vars(log[0], 1)).toEqual({ opacity: 0, y: 10, rotation: -8, filter: "blur(4px)" })
    const to = vars(log[0], 2)
    expect(to).toMatchObject({
      opacity: 1,
      y: 0,
      rotation: 0,
      filter: "blur(0px)",
      duration: 0.26,
      delay: 0.04,
      repeat: 0,
      yoyo: false,
      immediateRender: true,
    })
    // The design's cubic bezier, as a function GSAP can call.
    expect(to.ease(0)).toBe(0)
    expect(to.ease(1)).toBe(1)
    expect(to.ease(0.3)).toBeCloseTo(cubicBezier(0.16, 1, 0.3, 1)(0.3), 6)
    let ended = false
    void playback?.finished.then(() => {
      ended = true
    })
    to.onComplete()
    await Promise.resolve()
    expect(ended).toBe(true)
    playback?.cancel()
    expect(killed()).toBe(1)
  })

  test("more than two steps play as GSAP keyframes from the first", () => {
    const { gsap, log } = fake()
    gsapAdapter(gsap).animate(element, { scale: [1, 1.2, 1] }, timing({ kind: "loop", repeat: true, alternate: true }))
    expect(log.map((entry) => entry.call)).toEqual(["set", "to"])
    expect(vars(log[0], 1)).toEqual({ scale: 1 })
    expect(vars(log[1], 1)).toMatchObject({ repeat: -1, yoyo: true })
    expect(vars(log[1], 1).keyframes.scale).toEqual([1, 1.2, 1])
  })

  test("a product names GSAP's own eases by kind", () => {
    const { gsap, log } = fake()
    const adapter = gsapAdapter(gsap, { eases: { emphasis: "back.out(1.7)" } })
    adapter.animate(element, RISE, timing({ kind: "emphasis" }))
    expect(vars(log[0], 2).ease).toBe("back.out(1.7)")
    adapter.animate(element, RISE, timing({ easing: "linear", bezier: null }))
    expect(vars(log[1], 2).ease).toBe("none")
    adapter.animate(element, RISE, timing({ transition: "elastic.out(1, 0.4)" }))
    expect(vars(log[2], 2).ease).toBe("elastic.out(1, 0.4)")
  })
})

describe("what an adapter adds reaches the prompt", () => {
  test("its presets are listed with the built-in ones", () => {
    const adapter = waapiAdapter({
      presets: { swing: { description: "Swings in from the left.", keyframes: { rotate: [-8, 0], opacity: [0, 1] } } },
    })
    const prompt = buildSystemPrompt({ library: defineLibrary({ motion: adapter }) })
    expect(prompt).toContain("`swing`: Swings in from the left.")
  })

  test("a guide of the product's own replaces the motion section", () => {
    const library = defineLibrary({ motion: gsapAdapter({} as never, { guide: "## Motion\n\nMove nothing but the hero." }) })
    const prompt = buildSystemPrompt({ library })
    expect(prompt).toContain("Move nothing but the hero.")
  })
})
