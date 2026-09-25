# Audit — pi-browser-laya general extension

Date: 2026-09-25 (updated — Now 1-4 + Next 5-8 + Residual + 9.5 hardening completed)
Scope: website-agnostic, any page / length / framework
Basis: 3 live sessions (instantink FAQ, 10th disclaimer, selectorshub Dummy Form) + synthetic shadow/iframe tests + tooling audit

## Summary

| Severity     | Gap                                                                                             | Impact                               | Site type                              |
| ------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------- |
| **P0 Fixed** | Viewport-only snapshot hid offscreen FAQs → 12× scroll hunt                                     | 15 calls vs 2                        | Long pages (instantink)                |
| **P0 Fixed** | 6k text truncated footnotes at 11k                                                              | Footnote 10 invisible                | Long legal pages                       |
| **P0 Fixed** | Hardcoded `Never Run Out` anchor + FAQ comments                                                 | Not general                          | Any site                               |
| **P0 Fixed** | Shadow/iframe not traversed                                                                     | Dummy Form invisible                 | SelectorsHub, SPAs with web components |
| **P0 Fixed** | `password` excluded + `readonly` email as `click` + `roots` dup → 252/21 omitted, Password lost | 11-call abort                        | Forms with auth                        |
| **P0 Fixed** | `laya` claims implied model usage                                                               | Misleading                           | All                                    |
| **P1 Fixed** | `safe` still excludes `file` → upload sites broken                                              | Upload fails                         | Drive, HR portals                      |
| **P1 Fixed** | `fill` duplicates `click` (`Open X`) doubles count, wastes 400 cap                              | Omit risk on large tables            | Large catalogs                         |
| **P1 Fixed** | 400 cap is hard cut, no priority (fill before click, onscreen before offscreen)                 | Critical fills dropped               | Mega menus (500+ els)                  |
| **P1 Fixed** | No keyboard (Enter/Tab/Escape) for autocomplete/custom dropdowns                                | React Select, search not submittable | Modern SPAs                            |
| **P2 Fixed** | `file` inputs not actionable via `browser_act`                                                  | Upload not possible                  | File upload flows                      |
| **P2 Fixed** | Custom ARIA `combobox+listbox` (React Select) only seen as textbox, no `select` options         | Can't pick option                    | SaaS dropdowns                         |
| **P2 Fixed** | Cross-origin iframe silently skipped (no warning) + closed shadow not readable                  | Hidden content not noted             | Embedded widgets                       |
| **P2 Fixed** | No SPA pushState wait after click (only `networkidle` on launch)                                | Stale snapshot after nav             | Next.js, etc.                          |
| **P3 Fixed** | Checkbox/radio state not shown in table until re-snapshot, no toggle feedback                   | LLM re-clicks                        | Settings pages                         |
| **P3 Fixed** | No download/alert/download handling                                                             | Download blocked                     | Docs sites                             |

## Fixes applied (this audit)

- **Snapshot**: 12k + `fullTextLength`, full-page (offscreen+shadow+iframe) `roots` BFS, `safe` allows `password` (keep `file/hidden` only), `editable` ignores `readOnly` (email), `cap 250→400`, dup roots fixed (252→143, 0 omitted), `y`/`onscreen`/`frame` hints.
- **Browser**: `getFullText`/`getBlocks`/`getChunk`/`findText` live helpers (no anchor), `act` handles `scrollIntoView` for offscreen/shadow.
- **Tools**: `browser_text` generic `query|offset|blockIndex`, `browser_act` batch 1-3 with fill example, no `fetch` fallback.
- **Docs**: `README` Laya pattern table + disclaimer (no model), `format` shows `← FILL` and frame hints.

## Fixes applied (2026-09-25 Now hardening)

- **Versions**: root + `extensions/browser-laya/package.json` unified at `1.0.0` (`private:true` workspace ref), `playwright` pinned `1.63.0` exact, root `package-lock.json` committed.
- **Tooling**: `tsconfig.json` (`NodeNext`/`strict`/`noEmit` + `types/pi-shim.d.ts`), `eslint.config.js` (browser globals, ignores TS), `.prettierrc` + `.prettierignore`, `vitest.config.ts`, scripts `typecheck/lint/format/test`.
- **Tests**: 14 smoke tests across 3 files (`format.test.ts` 4, `snapshot.test.ts` 5, `browser.test.ts` 5) — invariants: password/file allowed, shadow/iframe BFS, 400 cap priority, live helpers, batch 1-5, dialog.
- **Snapshot hardening**: priority sort `fill(0) > select(1) > click(onscreen) > offscreen` before `splice(400)`, `kind=file` dedup (no `fill`+`click` dupe), `crossOriginSkipped` counter + `closed shadow` note in `format.ts`.
- **Browser hardening**: `DataTransfer` dummy file for `kind=file`, keyboard `Enter/Tab/Escape/ArrowDown/ArrowUp` via `text` on click, `dialog` auto-accept banner, `networkidle` + SPA `pushState` url-change wait after click.
- **Hygiene**: `.gitignore` cleaned (`nul` removed, `dist/coverage/playwright/.cache` added), `CI` workflow `.github/workflows/ci.yml` (install chromium --with-deps + typecheck + lint + format:check + test + audit).

## Fixes applied (2026-09-25 Next hardening 5-8)

- **URL validation (P1 §5)**: `validateUrl()` in `browser.ts` — `new URL(url)`, allow `http:`/`https:` only, reject `file:`/`data:`/`javascript:`/`blob:` with clear error; `browser_launch` now exposes `timeout` param (default 30000, max 60000) plumbed to `page.goto`.
- **Eval hardening (P1 §6)**: `browser.ts:observe()` now uses `Function(js)()` inside `page.evaluate` instead of direct `eval(js)` — same atomic IIFE semantics, CSP/lint clean (`no-eval` satisfied).
- **Closed shadow counter (P2 §7)**: `snapshot.js` now tracks `closedShadowSkipped` alongside `crossOriginSkipped`, returned in `Snapshot` (`closedShadowSkipped?: number`), banner in `format.ts` (`potential closed shadow root(s) skipped`) and updated generic note. Baseline 0, hook left for future heuristic.
- **CI headed:false (P1 §8)**: `.github/workflows/ci.yml` hardened — `npx playwright install --with-deps chromium`, `typecheck` + `lint --max-warnings 0` + `format:check` + `npm test` (vitest node, `CI=true`, headed:false) + `npm audit --audit-level=moderate`.

## Fixes applied (2026-09-25 Residual hardening — to 9.2)

- **Custom ARIA combobox (P2)**: `snapshot.js` `addAction` now detects `rname === "option"` → `kind:"select"` with `aria-selected`, label `[listbox]`/`[option]`; `selector` already includes `[role="option"]`, so React Select/MUI listbox options are emitted as selectable `select` actions, not hidden textbox.
- **Checkbox/radio toggle feedback (P3)**: `format.ts` now renders `checked=true/false` + `selected`/`expanded` in ELEMENT TABLE; `tools.ts:browserActTool` diffs `before.checked → after.checked` and appends `[Toggle feedback]` banner after `formatSnapshot(next)`.
- **Download handling (P3)**: `browser.ts` `context: {acceptDownloads:true}` + `page.on("download")` saves to `tmpdir()/pi-browser-laya-downloads` via `mkdir`+`download.saveAs`, `Snapshot.download` + banner `DOWNLOAD: "file" from url → path` in `format.ts`, consumed once like `dialog`.
- **Closed shadow heuristic (Note)**: `snapshot.js` heuristic activated — `if (tag.includes("-") && attachShadow && !shadowRoot) closedShadowSkipped++` (custom element with hyphen but no open root → likely `mode:closed`), counted and surfaced.
- **StalePage hint (Note)**: `browser.ts` `hover`/`act` errors now include `— StalePage: re-observe via browser_snapshot` for `node missing`/`stale node`.
- **TS lint (Note)**: `eslint.config.js` now uses `typescript-eslint` (`tseslint.config` + `...tseslint.configs.recommended`), `files:**/*.ts` with `@typescript-eslint/no-explicit-any off`, `no-empty off`, `package.json` devDep `typescript-eslint`, `npx eslint .` now lints `**/*.ts` + `**/*.js` clean.

## Fixes applied (2026-09-25 9.5 hardening — to 9.5)

- **Download stream-back (P3)**: `extensions/browser-laya/src/tools.ts` new `browserDownloadTool` (`browser_download {path?, maxBytes?}`) — streams last `Snapshot.download.path` or given path via `readFile`+`stat`, returns head 50k (utf8 or base64 for binary) + `[Truncated]` note; registered in `extensions/browser-laya/index.ts` (now 9 tools). E2E verifies `writeFile`→`readFile` + `formatSnapshot` `DOWNLOAD:` banner.
- **Option→combobox grouping (P2)**: `snapshot.js` `rname==="option"` now resolves `combobox` via `aria-controls`/`aria-owns` on `listbox.id` or ` [aria-expanded="true"]` fallback + `previousElementSibling` combobox, stores `combobox` field and appends ` → ${combobox}` to label + `[listbox]/[option]` suffix; `format.ts` now renders `combobox="City"` alongside `checked/selected/expanded`.
- **Headed E2E + vitest migration (P1 9.5)**: `tests/e2e.test.ts` headed:false real Chromium via local `http.createServer` (random port, `data:text/html` served as `http://127.0.0.1:...`), asserts `hello world` + `fill` + `option → City` grouping + `crossOrigin/closedShadow` counters + `validateUrl` + `browser_download` tmp streaming; `package.json` migrated `vitest 2.1.8 → 5.0.2` + `vite 8.3.1` (`--legacy-peer-deps`), `npm audit` **0 vulnerabilities** (was 5), `vitest.config` unchanged, `npx vitest run` 25 tests (4 files) in ~1.9s.
- **Eval→Function fix**: `browser.ts:observe()` corrected to `Function("return " + js)()` (was `Function(js)()` returning undefined → `snapshot failed — page has no body`), `no-new-func` directive removed, `prettier --write` clean.

## Remaining gaps (post-9.5, very low — to 9.8)

- **Vite 8 major**: `vitest@5` pulls `vite@8` via `--legacy-peer-deps`; clean install without `--legacy-peer-deps` would need `npm overrides` or `pnpm` — works in CI with `npm ci --legacy-peer-deps`.
- **Headed E2E requires Chromium**: CI needs `npx playwright install --with-deps chromium` (already in workflow); local dev needs `postinstall` chromium.

These keep the extension `2-4 calls` on any site without site-specific code. All P0/P1/P2/P3 now fixed; 9.5 bar cleared.
