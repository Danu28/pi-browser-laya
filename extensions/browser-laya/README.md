# pi-browser-laya — Playwright + laya/jev ideas (1 dep)

> **Single dependency: `playwright`.** Bundled Chromium — no user-installed Chrome needed.
> Goal: complete any page task in **2-4 LLM calls** (not 12-20).

## Install (one dep)

```bash
npm install playwright
npx playwright install chromium

# or from extension dir
npm --prefix extensions/browser-laya install
npx playwright install chromium
```

## Load

```bash
pi --extension ./extensions/browser-laya/index.ts
# or copy to ~/.pi/agent/extensions/browser-laya/
```

## How it uses Playwright

- `chromium.launch({ headless: !headed })` — bundled binary, headed mode shows window
- `page.goto(url, {waitUntil:'domcontentloaded'})` + `waitForLoadState('networkidle')` — wait till page load completely
- `page.evaluate(snapshot.js)` — **atomic snapshot** in ONE call: 12k page text + `e1..e250` indexed element table + guards (ported from `jev-ultrafast/snapshot.js`, generalized to include offscreen elements)
- `page.evaluate(nodeId => nodes.get(nodeId).click())` — click via snapshot's WeakMap cache with scroll + visibility guard; no XPath, no fragile selectors
- Auto re-observe after each `browser_act` batch

## Workflows (website-agnostic)

```
# Elements (any page, offscreen auto-scrolls)
Turn 1 browser_launch {url, headed:true} → snapshot (12k + element table y hints)
Turn 2 browser_act [{"id":"e12"}] → click element (offscreen OK)
Turn 3 browser_extract {"target":"e12"} → expanded scope

# Long pages / bottom content (any site, beyond 12k)
Turn 1 browser_launch {url, headed:true}
Turn 2 browser_text {query:"<phrase>"} or {offset:-5000} or {blockIndex:10} → live innerText slice

# Generic text search
browser_text {query:"pricing"} or {offset:0, limit:12000}
```

No screenshot loop, no HTML dump, wait is built into launch/act.

## Why fast

| Before (12-20 calls) | After (2-4) |
|---|---|
| dump full HTML each turn | 12k text + indexed table |
| 1 LLM call per click/scroll | 1 LLM call = batch 1-3 actions |
| viewport-only snapshot → scroll hunt | full-page snapshot (offscreen incl.) |
| separate op + target calls | operation+target one JSON (laya typed decision) |
| fetch/web_search for live content | browser_text live evaluate |

## Tools (all website-agnostic)

- `browser_launch` — headed launch + wait load + snapshot
- `browser_snapshot` — re-observe (one evaluate)
- `browser_act` — batched 1-3 actions + auto snapshot (offscreen-aware)
- `browser_extract` — scope.innerText for expanded elements
- `browser_text` — live full `document.body.innerText` with query/offset/blockIndex pagination
- `browser_close` — browser.close()

## Examples

```
launch https://example.com headed, wait load, click the pricing button
launch https://example.com headed, get bottom legal disclaimers
```
