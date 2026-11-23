// @lucide/vue ships types for its index only. Icons are loaded one file at a
// time, so the shape of those files is declared here.
declare module "@lucide/vue/dist/esm/icons/*.mjs" {
  export const __iconData: {
    name: string
    size?: number
    aliases?: string[]
    node: [string, Record<string, string | number>][]
  }
}
