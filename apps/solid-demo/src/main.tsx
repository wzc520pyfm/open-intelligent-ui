import "@open-intelligent-ui/solid/styles.css"
import "./app.css"
import { render } from "@solidjs/web"
import { App } from "./App"

render(() => <App />, document.getElementById("app") as HTMLElement)
