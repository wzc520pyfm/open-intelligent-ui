/**
 * The designs that come with Open Intelligent UI, each a DESIGN.md document
 * to hand to a renderer's `design` and to `buildSystemPrompt`. Paper is what
 * a surface uses when it is given none.
 *
 * ```ts
 * import { noir } from "@open-intelligent-ui/core/designs"
 *
 * <IntelligentUI source={reply} design={noir} />
 * buildSystemPrompt({ design: noir })
 * ```
 */
export { DEFAULT_DESIGN as paper } from "../design/default.generated"
export { heritage, noir, signal } from "./designs.generated"
