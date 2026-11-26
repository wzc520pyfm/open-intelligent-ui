import { defineI18n } from "fumadocs-core/i18n"

export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: ["en", "zh"],
  // content/docs/<language>/…; English has no prefix in its addresses.
  parser: "dir",
  hideLocale: "default-locale",
})

export type Lang = (typeof i18n.languages)[number]
