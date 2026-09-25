# pi-browser-laya — general Playwright browser extension for pi

> **Single dep: `playwright`.** Bundled Chromium — no user Chrome needed.  
> General, website-agnostic: any page, any length, any language — **2-4 LLM calls**.

Port of ideas from [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) (atomic indexed snapshot) + [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) (typed decisions in one pass), rebuilt **zero hard-coded sites** for `pi`.

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

## Tools (all website-agnostic)

| Tool | Purpose |
|------|---------|
| `browser_launch` | Headed `chromium.launch` → `goto` → `networkidle` → 12k full-page snapshot + `e1..250` table with `y` |
| `browser_snapshot` | Re-observe (one evaluate) |
| `browser_act` | Batched 1-3 actions, offscreen-aware (`scrollIntoView` auto) |
| `browser_extract` | Guard `scope.innerText` for expanded elements |
| `browser_text` | Live `innerText` reader: `{query}`, `{offset,limit}`, `{blockIndex}`, or head |
| `browser_close` | `browser.close()` |

## Workflows

```ts
// Any element (offscreen OK)
browser_launch {url, headed:true}
browser_act [{"id":"e12"}]
browser_extract {"target":"e12"}

// Any long page / bottom content
browser_launch {url, headed:true}
browser_text {query:"pricing"}        // search
browser_text {offset:-5000}           // bottom chunk
browser_text {blockIndex:10}          // generic block
```

## Design

- One atomic `page.evaluate(snapshot.js)` (12k text + 250 indexed controls, offscreen incl.)
- Offscreen clicks auto scroll — no scroll hunt
- Batch `operation+target` in one JSON (laya typed choice)
- Live `browser_text` for beyond-12k pages (generic `offset/blockIndex/query` pagination)

## License

MIT
