import { keepSiteStylesOutOfSurfaces } from "../playground/build/outside-surfaces.ts"

export default {
  plugins: ["@tailwindcss/postcss", keepSiteStylesOutOfSurfaces],
}
