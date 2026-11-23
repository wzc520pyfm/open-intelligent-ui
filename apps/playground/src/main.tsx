// The site's stylesheet names the order of every cascade layer, so it comes first.
import "./app.css"
import "@open-intelligent-ui/react/styles.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
