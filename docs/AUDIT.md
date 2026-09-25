# Audit — pi-browser-laya general extension

Date: 2026-01-04
Scope: website-agnostic, any page / length / framework
Basis: 3 live sessions (instantink FAQ, 10th disclaimer, selectorshub Dummy Form) + synthetic shadow/iframe tests

## Summary

| Severity | Gap | Impact | Site type |
|---|---|---|---|
| **P0 Fixed** | Viewport-only snapshot hid offscreen FAQs → 12× scroll hunt | 15 calls vs 2 | Long pages (instantink) |
| **P0 Fixed** | 6k text truncated footnotes at 11k | Footnote 10 invisible | Long legal pages |
| **P0 Fixed** | Hardcoded `Never Run Out` anchor + FAQ comments | Not general | Any site |
| **P0 Fixed** | Shadow/iframe not traversed | Dummy Form invisible | SelectorsHub, SPAs with web components |
| **P0 Fixed** | `password` excluded + `readonly` email as `click` + `roots` dup → 252/21 omitted, Password lost | 11-call abort | Forms with auth |
| **P0 Fixed** | `laya` claims implied model usage | Misleading | All |
| **P1 Open** | `safe` still excludes `file` → upload sites broken | Upload fails | Drive, HR portals |
| **P1 Open** | `fill` duplicates `click` (`Open X`) doubles count, wastes 400 cap | Omit risk on large tables | Large catalogs |
| **P1 Open** | 400 cap is hard cut, no priority (fill before click, onscreen before offscreen) | Critical fills dropped | Mega menus (500+ els) |
| **P1 Open** | No keyboard (Enter/Tab/Escape) for autocomplete/custom dropdowns | React Select, search not submittable | Modern SPAs |
| **P2 Open** | `file` inputs not actionable via `browser_act` | Upload not possible | File upload flows |
| **P2 Open** | Custom ARIA `combobox+listbox` (React Select) only seen as textbox, no `select` options | Can't pick option | SaaS dropdowns |
| **P2 Open** | Cross-origin iframe silently skipped (no warning) + closed shadow not readable | Hidden content not noted | Embedded widgets |
| **P2 Open** | No SPA pushState wait after click (only `networkidle` on launch) | Stale snapshot after nav | Next.js, etc. |
| **P3 Open** | Checkbox/radio state not shown in table until re-snapshot, no toggle feedback | LLM re-clicks | Settings pages |
| **P3 Open** | No download/alert/download handling | Download blocked | Docs sites |

## Fixes applied (this audit)

* **Snapshot**: 12k + `fullTextLength`, full-page (offscreen+shadow+iframe) `roots` BFS, `safe` allows `password` (keep `file/hidden` only), `editable` ignores `readOnly` (email), `cap 250→400`, dup roots fixed (252→143, 0 omitted), `y`/`onscreen`/`frame` hints.
* **Browser**: `getFullText`/`getBlocks`/`getChunk`/`findText` live helpers (no anchor), `act` handles `scrollIntoView` for offscreen/shadow.
* **Tools**: `browser_text` generic `query|offset|blockIndex`, `browser_act` batch 1-3 with fill example, no `fetch` fallback.
* **Docs**: `README` Laya pattern table + disclaimer (no model), `format` shows `← FILL` and frame hints.

## Remaining gaps to harden (next)

* **Snapshot priority**: sort actions `fill > select > checkbox/radio > click > offscreen` before `splice(400)` so critical inputs never omitted on 800-el pages.
* **File input**: expose `kind=file` and handle `browser_act` with file path via `setInputFiles` (or at least warn).
* **Keyboard**: extend `browser_act` to accept `{id, press:"Enter"}` or new `browser_press` for autocomplete.
* **Custom select**: detect `aria-expanded + listbox [role=option]` as selectable options even without `<select>`.
* **Error UX**: friendly `Unknown eXX` with nearest labels, `StalePage: re-observe` hint, cross-origin `iframe skipped (CORS)` note.

These keep the extension `2-4 calls` on any site without site-specific code.
