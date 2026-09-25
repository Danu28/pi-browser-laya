# pi-browser-laya — Playwright + laya/jev ideas (1 dep)

> **Single dependency: `playwright`.** Bundled Chromium — no user-installed Chrome needed.  
> Goal: `launch → wait load → 4th FAQ` in **3-4 LLM calls** (not 16-20).

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
- `page.evaluate(snapshot.js)` — **atomic snapshot** in ONE call: 6k visible text + `e1..e250` indexed element table + guards (ported from `jev-ultrafast/snapshot.js`)
- `page.evaluate(nodeId => nodes.get(nodeId).click())` — click via snapshot's WeakMap cache with scroll + visibility guard; no XPath, no fragile selectors
- Auto re-observe after each `browser_act` batch — `~101` CDP calls vs `1092`

No system Chrome hunt, no `remote-debugging-port` juggling.

## 3-Turn Workflow (laya pattern: operation+target in one JSON)

```
Turn 1 — browser_launch {url:"https://instantink.hpconnected.com/us/en/l/v2", headed:true}
         → page.goto + networkidle (Playwright) + atomic snapshot (one evaluate)

Turn 2 — LLM outputs batch plan → browser_act {actions:[{id:"e42"}]}
         → page.evaluate click 4th FAQ (with guard) + auto re-observe

Turn 3 — browser_extract {target:"e42"}
         → guards[e42].scope.innerText (6k) → answer. Done.
```

No screenshot in loop, no HTML dump, wait is built into `launch` + `act`.

## Why fast

| Before (16-20 calls) | After (3-4) |
|---|---|
| dump full HTML each turn | 6k visible text only |
| 1 LLM call per click | 1 LLM call = batch 1-3 actions |
| separate op + target calls | operation+target one JSON (laya `choice` typed decision) |
| user Chrome + CDP port guess | Playwright bundled Chromium |
| screenshots in context | text-only loop |

## Tools

- `browser_launch` — Playwright headed launch + wait load + snapshot
- `browser_snapshot` — re-observe (one evaluate)
- `browser_act` — **batched** 1-3 actions + auto snapshot
- `browser_extract` — scope.innerText / search visible text
- `browser_close` — browser.close()

## Test 4th FAQ

In pi, just say:
```
launch https://instantink.hpconnected.com/us/en/l/v2 headed, wait load, get 4th FAQ
```

Expected trace:
1) `browser_launch`
2) `browser_act [{"id":"eXX"}]`
3) `browser_extract {"target":"eXX"}`
```
