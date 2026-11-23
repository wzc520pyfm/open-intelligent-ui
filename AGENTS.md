# Working in this repository

Open Intelligent UI renders interfaces that a model writes as IUI markup.
Read `README.md` for what it is and `docs/architecture.md` for how the parts
fit before changing code.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install. Node 22 or later. |
| `pnpm dev` | Playground at http://localhost:5173. |
| `pnpm test` | All tests (Vitest). `npx vitest run <path>` for one file. |
| `pnpm typecheck` | TypeScript, every package. |
| `pnpm build` | Production build of the playground. |
| `pnpm generate` | Rebuild the UI SDK registry, catalog and CSS from the installed `@ui-sdk` packages. |
| `pnpm generate:skills` | Rebuild `skills/**/references/` from the prompt guides. |
| `pnpm design:lint` | Check `design/*.DESIGN.md` with the DESIGN.md CLI. |
| `pnpm build:packages` | Build `packages/*` to `dist/` (ESM, type declarations, `styles.css`). |
| `pnpm check:packages` | Pack both packages as `pnpm publish` would and check the tarballs. |

There is no linter or formatter configured. Match the surrounding code: no
semicolons, double quotes, two spaces.

## Where things are

- `packages/core`: parser (`src/markup`), expression interpreter (`src/expr`),
  state store (`src/runtime`), DESIGN.md and CSS safety (`src/design`),
  system prompt (`src/prompt`). No framework, no DOM, no Node APIs.
- `packages/react`: `<IntelligentUI>`, rendering (`src/render`), primitives,
  presets, styles.
- `apps/playground`: the demo app. Demos are `.iui` files in `src/demos`.
- `skills/`: skills for coding agents. `docs/`: research, spec, architecture.

## Releasing

`@open-intelligent-ui/core` and `@open-intelligent-ui/react` are released
together, at one version.

1. `pnpm version:set 0.2.0`, commit, merge to `main`.
2. Either push the tag `v0.2.0`, which runs `.github/workflows/release.yml`
   (it needs the repository secret `NPM_TOKEN`), or run `pnpm release` on
   `main` after `npm login`.

Both paths take the npm dist-tag from the version: `0.2.0` is published as
`latest`, `0.2.0-beta.1` as `beta`, `0.2.0-rc.1` as `rc`. A prerelease
never becomes what `npm install` picks by default.

In the workspace the packages export `src/`, so the playground and the
tests never need a build. `publishConfig.exports` replaces those with
`dist/` when a package is packed. A new entry point needs both, plus an
`entry` in the package's `tsdown.config.ts`. Anything the built code
imports must be in `dependencies` or `peerDependencies`; the build fails
otherwise.

## Rules that keep the project honest

- **The prompt can't promise what the renderer doesn't do.** If you change
  the language, a primitive, a preset or a motion attribute, change the
  guide in `packages/core/src/prompt/guide.ts` in the same commit, then run
  `pnpm generate:skills`. Tests render every example in the guides, the docs
  and the skills, and fail when a generated reference is stale.
- **Don't edit generated files.** Anything named `*.generated.*` and
  everything under `skills/**/references/` except `integration.md` comes
  from a script.
- **Markup is untrusted.** A model wrote it, possibly under prompt
  injection. New tags, attributes, CSS features and actions need a reason
  they can't run script, load a remote resource, or draw outside the
  surface. See "安全模型" in `docs/architecture.md`.
- **Never throw on bad markup.** The parser keeps what it can and records a
  diagnostic; the renderer reports through `onWarning` and keeps the rest of
  the surface working.
- **Streaming is the normal case.** Anything declared in markup can arrive
  after the surface is already on screen, in pieces. Test a feature by
  rendering prefixes of the source with `streaming`, not only the whole.
- **Style through tokens.** Renderer CSS uses `--iui-*` variables and lives
  in the `iui` cascade layer under `.iui-root`. Element selectors there must
  skip UI SDK parts (`:not([data-slot])`).
- **Look at it.** jsdom tests don't cover layout, paint or motion. After a
  visual change, open the playground in a browser at phone, chat and wide
  widths, in light and dark, with each design. For motion, capture frames
  with `skills/motion/scripts/capture.mjs`.

## Writing a demo or an example

Follow `skills/intelligent-ui/SKILL.md`. A fenced block marked `iui` in
`README.md`, `docs/` or `skills/` must be a complete interface: the tests
render it and fail on any warning.
