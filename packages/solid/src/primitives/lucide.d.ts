// lucide ships types for its index only. Icons are loaded one file at a
// time, so the shape of those files is declared here.
declare module "lucide/dist/esm/icons/*.mjs" {
  const node: [string, Record<string, string | number>][]
  export default node
}
