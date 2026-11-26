import { docs } from "collections/server"
import { loader } from "fumadocs-core/source"
import { i18n } from "./i18n"
import { icon } from "./icons"

/** Addresses are relative to the site's base path: `/guide/start`, `/zh/guide/start`. */
export const source = loader({
  baseUrl: "/",
  i18n,
  icon,
  source: docs.toFumadocsSource(),
})
