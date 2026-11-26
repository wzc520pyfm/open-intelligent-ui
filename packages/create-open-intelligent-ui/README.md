# create-open-intelligent-ui

Scaffold a small Vite + React app that is already wired to
[Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui):
system prompt, streaming surface, `checkMarkup` / `repairMessage`, and
`onAction` for `send`.

```bash
npm create open-intelligent-ui@latest my-app
cd my-app
npm install
npm run dev
```

Options:

```text
npm create open-intelligent-ui@latest [dir] [--template react-vite] [--name <package-name>]
```

Open http://localhost:5173. **Demo reply** works with no API key. For Live,
set `VITE_OPENAI_API_KEY` (and optionally `VITE_OPENAI_BASE_URL`,
`VITE_OPENAI_MODEL`) in `.env`.

For coding agents: copy
[`skills/integrate/SKILL.md`](../../skills/integrate/SKILL.md) from the
repository, and read [`llms.txt`](../../llms.txt).
