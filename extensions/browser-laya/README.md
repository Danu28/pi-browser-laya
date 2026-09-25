# pi-browser-laya — general Playwright browser extension for pi

> **Single dep: `playwright`.** Bundled Chromium — no user Chrome needed.  
> General, website-agnostic: any page, any length, any language — **2-4 LLM calls**.

Port of **ideas** from [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) + [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya). **We do not bundle or call `laya` APIs/models.**

## Install

```bash
pi install git:github.com/Danu28/pi-browser-laya
# or
pi --extension ./extensions/browser-laya/index.ts
```

Manual: `npm install && npx playwright install chromium`

## How Laya ideas are used (inspiration only)

`laya` = one forward pass (~33 ms) for many typed decisions (`choice|score|noul`), Router per request, RLCD/proper scoring, hooks. Adapted as:

| Laya                        | Here                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| Typed decisions             | `operation:choice + target:choice[e1..250]` via TypeBox, one JSON |
| One pass for many questions | One LLM call = operation+target + batch 1-3 acts → one re-observe |
| Router                      | Tool routing: `browser_act` vs `browser_text {query               | offset | blockIndex}` |
| Calibrated temps            | Guards + fingerprint + `checkVisibility` before click             |
| Hooks                       | `session_shutdown` + prompt anti-pattern hook                     |

> **Disclaimer:** Not affiliated with `laya`; no `laya` pip package, no `convaiinnovations/laya` checkpoint, no TileLang fast path. See [laya repo](https://github.com/NandhaKishorM/laya) for original.

## Tools (website-agnostic)

- `browser_launch` — headed launch + 12k snapshot + `e1..250` with `y`
- `browser_snapshot` — re-observe
- `browser_act` — batched 1-3, offscreen-aware
- `browser_extract` — scope innerText
- `browser_text` — live innerText `query|offset|blockIndex`
- `browser_close` — close

## Workflows

```ts
browser_launch {url, headed:true}
browser_act [{"id":"e12"}]
browser_extract {"target":"e12"}

browser_launch {url}
browser_text {query:"pricing"} | {offset:-5000} | {blockIndex:10}
```

MIT
