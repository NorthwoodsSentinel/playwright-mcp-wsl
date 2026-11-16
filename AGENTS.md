# AGENTS.md — playwright-mcp-wsl

Rules for any agent (or person) changing this repo. The shape and most of the wording come from Cliff Hall's
`modelcontextprotocol/inspector` AGENTS.md (branch v2/main, commit d330df9617e44ec893bc1a53618662239342d433), as the
maintainer ruled on it. Where his way and ours differ, **the source's way stands until there is a reason to
depart**; every departure below says why.

`CLAUDE.md` contains only `@./AGENTS.md`. Keep one copy of these rules: two copies are strictly worse than one,
because the stale copy is indistinguishable from the live one.

## What this is

A drop-in wrapper for [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) that, on WSL, points
Playwright at a config adding three Chromium flags (`--disable-gpu`, `--disable-software-rasterizer`,
`--disable-dev-shm-usage`), merging them into the user's own config when `PLAYWRIGHT_MCP_CONFIG` is already set.
Off WSL it changes nothing. `README.md` is the user-facing description; read it before changing anything. It is a
published npm package written in **plain JavaScript (CommonJS)**, and stays JavaScript. There is no build step and
nothing here deploys or publishes.

## Rules for the runtime code

- **No behavior change without an issue that says so.** A refactor, a lint fix, a type fix or a review suggestion
  is never a reason to change what the code does. Comment, formatting and JSDoc-only edits are allowed when the
  emitted JavaScript stays the same; check by comparing `bun build --no-bundle --minify-syntax --minify-whitespace`
  output for each of `cli.js`, `detect.js` and `index.js` before and after.
- **The config must be in place before `@playwright/mcp` or Playwright loads.** On WSL, both `cli.js` and `index.js`
  set `PLAYWRIGHT_MCP_CONFIG` before their first Playwright `require`; the tests assert the value seen at load time.
- **A user's config is read, never rewritten.** The merge writes a separate file in the OS temp directory and
  removes it on exit.
- **The published file set is `files` in `package.json`.** Gate tooling, tests and `types/` are not published.

## Known gaps (recorded here so the gate does not hide them)

- `cli.js` loads two undocumented upstream internals by deep path: `playwright-core/lib/utilsBundle` and
  `playwright/lib/mcp/program`. The dependency range is `@playwright/mcp >=0.0.60`. Against `@playwright/mcp` 0.0.85
  (the version in `bun.lock` on 2026-11-16) the Playwright it installs no longer exports `lib/mcp/program`, so the
  CLI's `require` of it fails at runtime. Fixing that changes behavior, so it is a follow-up, not a gate change.
- `types/playwright-internals.d.ts` declares the shape `cli.js` uses from those two paths, for the typecheck only.
  Without it `tsc` reports the missing module (TS2307). The file says so; delete its second block when `cli.js` stops
  importing that path.
- The tests replace both internals with stubs, so they prove what `cli.js` hands to Playwright, not that the
  installed Playwright still accepts it.

## Project structure

- `cli.js` — the `playwright-mcp-wsl` bin: detect WSL, set or merge the config, then hand off to Playwright's MCP
  command.
- `index.js` — the programmatic API: set the config on WSL, then re-export `createConnection` from `@playwright/mcp`.
- `index.d.ts` — published types for `index.js`.
- `detect.js` — `isWSL`, `wslVersion`, `hasDxgBridge`.
- `wsl-config.json` — the bundled Playwright config with the three flags.
- `types/` — typecheck-only declarations (see Known gaps).
- `test/` — Vitest suites (`*.test.mjs`) and `test/helpers/load.mjs`.
- `scripts/verify-gate-scope.mjs` — gate tooling.

## Development setup

- `bun install`. Bun runs this repo's own scripts (`bun run <script>`). If you run one of Cliff Hall's own tools or
  procedures, use his runner (`npx`) as he documents it. End users run the package with `npx` as the README says.
- Tests run on Vitest with `@vitest/coverage-v8` on Node, Cliff's choice, because it can measure branches and
  enforce a per-file bar. Run them with `bun run test`; plain `bun test` is Bun's own runner and is not the gate.
- **Tests never launch a browser, spawn a process or call a network service.** `test/helpers/load.mjs` loads the
  wrapper's files through Node's real `require` in a fresh module registry, answers the Playwright module ids with
  stubs, and fakes the host (`os.platform`, `/proc/version`, `/dev/dxg`) with spies that pass every other file read
  through. `cli.js` and `index.js` are tested unchanged.

## Issue-driven work style

GitHub issues are the board for this public repo.

- **Before starting work, find the issue.** Every change has one. Search before filing: **never create a
  duplicate**.
- **When work begins**, create the branch **in a new git worktree**, never by switching branches in a checkout
  another session may share.
- **When work is complete**, run `bun run format` then `bun run local:gate`, **sign off every commit**
  (`git commit -s`), and open a PR with **the issue reference as the body's first line**.
- **After opening a PR, run a review loop with an off-lineage reviewer**, unprompted. Stop on the **first** clean
  round. **Weigh each finding against the issue the PR closes and decline scope expansion.** Two failed rounds in
  a row: stop, leave the PR open, list the findings in it. (Departure: Cliff uses Copilot; the maintainer chose a
  different off-lineage reviewer.)
- **If new tasks are discovered during development, file issues** rather than widening the PR.
- **Pace bulk GitHub writes: 1 s between requests, never in parallel.**
- **A security issue stays private until its fix is ready**; accepting or publishing an advisory is
  outward-facing and stays human-gated, never automated.
- **This repo is public. Merging and publishing to npm are the maintainer's acts**, and nothing personal goes into
  a commit, PR or test (home paths, emails, names, tokens). Tests use synthetic data only.

### Responding to code reviews

- Judge each suggestion against the issue the PR closes. Fix defects in what the PR added; decline, with a reason,
  what expands it; file an issue for anything worth doing on its own.
- Reply in each review comment's own thread, then post a summary in addition.

## Always test new or modified code

- **Every published `.js` file (`cli.js`, `detect.js`, `index.js`) must clear ≥ 90 on all four dimensions (lines,
  statements, functions, branches), per file**, enforced by `vitest.config.mjs` and therefore by `bun run test`,
  `bun run local:gate` and CI. This is the source's bar (Cliff's inspector). **Never lower the threshold to pass.**
- Measured on 2026-11-16: all three files 100 / 100 / 100 / 100. No coverage exclusions.
- Coverage exclusions, if one is ever needed, are exact paths, one per entry, each with a reason and a follow-up
  issue; never a glob that could hide a new file.
- **Paths and globs are anchored to the repo root** (`./cli.js`, `./test/**/*.test.mjs`). An unanchored pattern can
  match a folder name further up the path and silently empty the measured set.
- **A gate must show how much it checked.** `scripts/verify-gate-scope.mjs` runs after the tests and fails if a
  tracked `.js`, `.mjs` or `.ts` file is in no typecheck project, a published `.js` file is missing from the coverage
  summary, or coverage measured zero files. Fix that by fixing the include lists, never by excusing the file.
- Test files are `test/**/*.test.mjs`; a file named otherwise is silently not run.
- A rule about what the code does is asserted at runtime in a test, not read out of the source.
- A test that races is fixed with an awaited condition, never with a longer timeout.

## Mandatory pre-push gate

- **ALWAYS run `bun run format` before committing.**
- **`bun run local:gate` is the mandatory pre-push command.** It runs every check CI runs: `format:check`, `lint`,
  `typecheck` and `test` (Vitest with the coverage bar, then the gate-scope check). A green run here means every
  check CI applies has already passed on your machine.
- CI: `.github/workflows/ci.yml` runs the same four stages as separate steps, on Node 22 and Bun 1.4.4, installing
  with `--frozen-lockfile --ignore-scripts`. It never deploys or publishes.
- There is deliberately no `ci` script (the name collides with the package-manager built-in).
- Departures, each for a stated reason: no gate lease (the gate takes seconds and binds nothing); no DCO check job
  (a required-check ruleset is a repository setting, the maintainer's to change).

## Waiting on long-running work

**When you are waiting for something to finish, arm a notifier and stop. Never spend turns polling.** For state
the harness cannot observe (a CI run, a remote review), poll inside one backgrounded loop that exits when the
condition holds, at 30 s or more.

## Build output is never a gate target

**No gate (lint, format or typecheck) may read generated output.** Out of scope: `node_modules/`, `coverage/`,
`bun.lock` and `.scratch/`. Each scope states it: `globalIgnores` in `eslint.config.mjs`, `.prettierignore`, and the
tsconfig `include` lists. **When something starts writing to a new location, add it to the ignore lists in the same
change.** Never widen an ignore to silence a finding in first-party code. Markdown is outside the format scope:
prettier rewrites prose.

The repository's git history is about 3.3 MB although the tree is a few kilobytes: the first commit included a
`node_modules/` install (about 580 files) and the second removed it and added `.gitignore`. The files stay in history;
rewriting public history is the maintainer's call, so it is left as is. No vendored or generated file is in the
current tree.

## Lint has no warning tier

**`lint` runs with `--max-warnings 0`, so a warning fails the gate exactly as an error does.** Rules: ESLint
recommended, with CommonJS and Node globals for `*.js` and ES modules for `*.mjs`. The `.d.ts` files are not linted
(plain ESLint cannot parse them); `tsc` checks them.

- **Do not silence a finding to satisfy the gate.** A warning is a defect to fix. If a rule genuinely must be
  waived on one line, use its inline disable comment **with a one-line justification**. Dropping a rule or
  widening an ignore to make `lint` pass is not a fix. There are no waivers today.

## Typecheck

- The JavaScript is typechecked by `tsc` with `allowJs`, `checkJs` and `strict`. Types are expressed in JSDoc;
  never add a runtime construct only to please the checker.
- Two projects: `tsconfig.json` (everything except `index.js`) and `tsconfig.index.json` (`index.js`). TypeScript
  silently drops `index.js` from any project that also includes `index.d.ts`, because they share a base name.
- In new code, treat parsed JSON as untrusted and narrow it before use. No floating promises: `await` them, or
  `void` them on purpose. The one `void` today is `cli.js` handing `parseAsync` to Playwright, which owns the
  process from there.
- An empty `catch` carries a comment saying why swallowing is correct there.
- Every JavaScript, TypeScript declaration and workflow file starts with a header comment saying what it is for.
