# pi-browser-laya — general Playwright browser extension for pi

> **Single dep: `playwright`.** Bundled Chromium — no user Chrome needed.  
> General, website-agnostic: any page, any length, any language — **2-4 LLM calls**.

Port of **ideas** from [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) (atomic indexed snapshot) + [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) (typed decisions in one pass). **We do not bundle, call, or depend on `laya` APIs or models** — only the decision pattern is adapted for browser automation.

## Install

```bash
pi install git:github.com/Danu28/pi-browser-laya

# verify
pi packages:list
pi tools:list  # browser_launch, browser_snapshot, browser_act, browser_extract, browser_text, browser_close
```

Or try without installing:

```bash
pi --extension ./extensions/browser-laya/index.ts
```

Manual:

```bash
npm install
npx playwright install chromium
```

## How Laya ideas are used (inspiration only)

`laya` is a multilingual, non-autoregressive System 1 decision engine: one forward pass (~33 ms) emits many **typed decisions** (`choice | score | noul`), `Router` picks the right checkpoint per request, trained with RLCD/proper scoring, with hooks for audit. We adapt the _pattern_ to browser control without shipping `laya`:

| Laya concept                                                        | How we apply it here                                                                                                                                                                                                                 | Truth                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Typed decisions** (`choice`/`score`/`noul` with schemas)          | Browser actions are **typed JSON**: `operation: choice[click, fill, ...]` + `target: choice[e1..e250]` + `text?: string`. Extension forces this via `TypeBox` so the LLM must emit `{"id":"e12"}` not free-form XPath/coords.        | Uses pi's LLM, not laya's `Agent`/`Router`.                                                     |
| **One forward pass for many questions** (all decisions in parallel) | **One LLM call = operation+target together**, plus `browser_act` **batch 1-3** actions → one re-observe. Replaces `observe→click→wait→observe` loop. Measured like laya's `33 ms` goal, but wall-clock is LLM + one `page.evaluate`. | No laya `fast` TileLang path; our fast path is `playwright` bundled Chromium + atomic snapshot. |
| **Router per request** (language/checkpoint selection)              | **Tool routing via description**: LLM picks `browser_act` for elements vs `browser_text {query                                                                                                                                       | offset                                                                                          | blockIndex}` for long-page text — same single-model choice, no extra classifier. | No `convaiinnovations/laya` checkpoint downloaded. |
| **Calibrated confidence / proper scoring**                          | We emulate via **guards + fingerprint**: `snapshot.marker` + `guards[node]` + `checkVisibility` before click; stale → re-observe without extra LLM call.                                                                             | No laya temperature calibration.                                                                |
| **Hooks** (`on_predict_start/end`)                                  | `pi.on("session_shutdown")` cleanup + prompt hook in `format.ts` (`ANTI-PATTERN: do not scroll hunt`).                                                                                                                               | No `laya/hooks` import.                                                                         |

> **Disclaimer:** This project is **not affiliated with `laya`** and does **not** import `laya`, `laya[serve]`, `laya[fast]`, or any `convaiinnovations/laya` model. All `laya` references are to the published design pattern only. See [laya repo](https://github.com/NandhaKishorM/laya) and [jev-ultrafast](https://github.com/browser-use/jev-ultrafast) for originals.

## Tools (all website-agnostic)

| Tool               | Purpose                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `browser_launch`   | Headed `chromium.launch` → `goto` → `networkidle` → 12k full-page snapshot + `e1..250` table with `y`   |
| `browser_snapshot` | Re-observe (one evaluate)                                                                               |
| `browser_act`      | Batched 1-3 actions, offscreen-aware (`scrollIntoView` auto)                                            |
| `browser_extract`  | Guard `scope.innerText` for expanded elements                                                           |
| `browser_text`     | Live `innerText` reader: `{query}`, `{offset,limit}`, `{blockIndex}`, or head — generic, no site anchor |
| `browser_close`    | `browser.close()`                                                                                       |

## Workflows (generic)

```ts
// Any element (even offscreen y=3000)
browser_launch {url, headed:true}
browser_act [{"id":"e12"}]
browser_extract {"target":"e12"}

// Any long page / bottom content (beyond 12k)
browser_launch {url, headed:true}
browser_text {query:"pricing"}        // search live innerText
browser_text {offset:-5000}           // bottom chunk (negative = from end)
browser_text {blockIndex:10}          // nth block split by blank lines
```

## Design

- One atomic `page.evaluate(snapshot.js)` (12k text + 250 indexed controls, offscreen incl. with `y`/`onscreen` hints)
- Offscreen clicks auto scroll via `nodes.get(node).scrollIntoView`
- Batch `operation+target` in one JSON (laya typed-choice pattern)
- Live `browser_text` for beyond-12k pages (generic `offset/blockIndex/query` pagination, no hardcoded site anchor)

## License

MIT
