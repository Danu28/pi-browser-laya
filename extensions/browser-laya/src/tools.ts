/**
 * Tool definitions — website-agnostic: snapshot + act + live text for any site
 */

import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Browser, type Snapshot } from "./browser.js";
import { formatSnapshot } from "./format.js";

let browser: Browser | null = null;
let lastSnapshot: Snapshot | null = null;

function getBrowser(): Browser {
  if (!browser) throw new Error("Browser not launched. Call browser_launch first.");
  return browser;
}

// ---------- browser_launch ----------
export const browserLaunchTool = defineTool({
  name: "browser_launch",
  label: "Browser Launch",
  description:
    "Launch Playwright Chromium headed, goto URL, wait networkidle. Returns 12k full-page snapshot (text incl. offscreen, incl. shadow DOM + iframe) + element table with y/onscreen/frame hints. Offscreen/shadow/iframe elements are clickable (auto scrollIntoView). For content beyond 12k use browser_text. Use ONLY these browser tools, not fetch.",
  parameters: Type.Object({
    url: Type.String({ description: "URL to open" }),
    headed: Type.Optional(Type.Boolean({ description: "Show headed window (default true)" })),
  }),
  async execute(_id, params) {
    if (browser) { try { await browser.close(); } catch {} browser = null; }
    browser = new Browser();
    const snap = await browser.launch(params.url, params.headed ?? true);
    lastSnapshot = snap;
    return {
      content: [{ type: "text", text: formatSnapshot(snap) }],
      details: { url: snap.url, title: snap.title, actions: snap.actions.length, fingerprint: snap.fingerprint },
    };
  },
});

// ---------- browser_snapshot ----------
export const browserSnapshotTool = defineTool({
  name: "browser_snapshot",
  label: "Browser Snapshot",
  description: "Re-observe full page atomically (one evaluate). Returns updated 12k text + element table.",
  parameters: Type.Object({}),
  async execute() {
    const b = getBrowser();
    const snap = await b.observe();
    lastSnapshot = snap;
    return {
      content: [{ type: "text", text: formatSnapshot(snap) }],
      details: { url: snap.url, actions: snap.actions.length },
    };
  },
});

// ---------- browser_act (BATCHED + offscreen/shadow-aware, handles fill) ----------
export const browserActTool = defineTool({
  name: "browser_act",
  label: "Browser Act (batched)",
  description:
    "Execute 1-5 actions as batch then auto re-observe once. Use ONLY this for clicks AND fills. For fills: browser_act [{\"id\":\"eXX\",\"text\":\"value\"}] where kind=fill (marked ← FILL). Batch 5: [{\"id\":\"e5\",\"text\":\"a@b.com\"},{\"id\":\"e7\",\"text\":\"Secret123\"},{\"id\":\"e22\"}] (fills+submit in 1 call). Custom ARIA combobox (React Select): click combobox [eXX] then click option [eYY] (role=option) — both are click kind. Elements include offscreen/shadow/iframe. Avoid fetch.",
  parameters: Type.Object({
    actions: Type.Array(
      Type.Object({
        id: Type.String({ description: "Element id e1..e250 or scroll_down/scroll_up/wait" }),
        text: Type.Optional(Type.String({ description: "Text for fill only" })),
      }),
      { description: "Batch 1-5 (was 3)" }
    ),
  }),
  async execute(_id, params) {
    const b = getBrowser();
    if (!lastSnapshot) lastSnapshot = await b.observe();
    const snap = lastSnapshot;
    for (const a of params.actions) {
      const action = snap.actions.find((x: any) => x.id === a.id);
      const target = action ?? (["scroll_down", "scroll_up", "wait"].includes(a.id) ? { id: a.id, kind: a.id.startsWith("scroll") ? "scroll" : "wait", delta: a.id === "scroll_down" ? 560 : -560 } : null);
      if (!target) throw new Error(`Unknown ${a.id}. Have: ${snap.actions.slice(0, 30).map((x: any) => `${x.id}:${x.label.slice(0,25)}`).join(", ")}`);
      await b.act(target, snap, a.text);
    }
    const next = await b.observe();
    lastSnapshot = next;
    return {
      content: [{ type: "text", text: formatSnapshot(next) }],
      details: { executed: params.actions.map((a: any) => a.id), url: next.url },
    } as any;
  },
});

// ---------- browser_hover — for transient dropdowns / hover menus ----------
export const browserHoverTool = defineTool({
  name: "browser_hover",
  label: "Browser Hover",
  description: "Hover over element to reveal transient dropdown/loader (1-sec spinner, hover menus). Uses mouseover/mouseenter. For dropdown whose element disappears on inspect, hover then quickly browser_snapshot.",
  parameters: Type.Object({
    id: Type.String({ description: "Element id e1..e250 to hover" }),
  }),
  async execute(_id: any, params: any) {
    const b = getBrowser();
    const snap = lastSnapshot ?? await b.observe();
    const action = snap.actions.find((x:any)=>x.id===params.id);
    if (!action) throw new Error(`Unknown ${params.id}`);
    await b.hover(action);
    const next = await b.observe();
    lastSnapshot = next;
    return { content: [{ type: "text", text: formatSnapshot(next) }], details: { hovered: params.id } } as any;
  },
});

export const browserWaitTool = defineTool({
  name: "browser_wait",
  label: "Browser Wait",
  description: "Wait for transient content: timeout ms or waitForSelector. Use for 1-sec Spin Loader that disappears, or waiting for dropdown to appear after hover. Do not loop scroll.",
  parameters: Type.Object({
    timeout: Type.Optional(Type.Number({ description: "Ms to wait (default 1000, max 5000)" })),
    selector: Type.Optional(Type.String({ description: "CSS selector to wait for visible (e.g. \"[role=option]\")" })),
  }),
  async execute(_id: any, params: any) {
    const b = getBrowser();
    await b.waitFor(params.timeout ?? 1000, params.selector);
    const snap = await b.observe();
    lastSnapshot = snap;
    return { content: [{ type: "text", text: formatSnapshot(snap) }], details: { waited: params.timeout ?? 1000 } } as any;
  },
});

// ---------- browser_extract ----------
export const browserExtractTool = defineTool({
  name: "browser_extract",
  label: "Browser Extract",
  description:
    "After clicking an element, extract its expanded scope. Provide target id e.g. e12. Returns guard scope + snapshot slice. For generic page text search use browser_text.",
  parameters: Type.Object({
    target: Type.Optional(Type.String({ description: "Element id e.g. e12" })),
    query: Type.Optional(Type.String({ description: "Substring fallback (searches live page)" })),
  }),
  async execute(_id: any, params: any) {
    const b = getBrowser();
    const snap = lastSnapshot ?? await b.observe();
    if (params.target) {
      const el = snap.actions.find((x: any) => x.id === params.target);
      if (!el) throw new Error(`No ${params.target}`);
      const guard = (snap.guards as any)[el.node];
      const scopeText = guard?.[13] ?? "";
      return {
        content: [{ type: "text", text: `EXTRACT ${params.target} (${el.label})\nrole=${el.role} kind=${el.kind} y=${el.rect?.y}\n--- scope (up to 6k) ---\n${scopeText.slice(0, 6000)}\n--- snapshot text ---\n${snap.text.slice(0, 6000)}` }],
        details: { id: params.target, label: el.label },
      } as any;
    }
    if (params.query) {
      const live = await b.findText(params.query);
      return { content: [{ type: "text", text: live }], details: { query: params.query } } as any;
    }
    return { content: [{ type: "text", text: snap.text.slice(0, 6000) }], details: {} } as any;
  },
});

// ---------- browser_text — generic live reader for any long page ----------
export const browserTextTool = defineTool({
  name: "browser_text",
  label: "Browser Text",
  description:
    "Live full-page innerText reader for any website and any length. Runs page.evaluate(() => document.body.innerText) live. Modes: no params → head (12k); {query:\"<phrase>\"} → context around match; {offset, limit} → pagination (offset supports negative for bottom); {blockIndex:N} → Nth block split by blank lines (1-based, website-agnostic). Use for bottom disclaimers, long articles, or when snapshot is truncated. Do not use fetch/web_search for live page content.",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Substring to search live full text" })),
    offset: Type.Optional(Type.Number({ description: "Char offset into full innerText; negative counts from end (e.g. -5000 for bottom)" })),
    limit: Type.Optional(Type.Number({ description: "Chars to return (default 12000 for head, 3000 for query context)" })),
    blockIndex: Type.Optional(Type.Number({ description: "1-based block index split by blank lines (generic, no site anchor)" })),
  }),
  async execute(_id: any, params: any) {
    const b = getBrowser();
    if (params.blockIndex) {
      const { blocks, count } = await b.getBlocks();
      const idx = Number(params.blockIndex) - 1;
      if (idx < 0 || idx >= count) {
        return {
          content: [{ type: "text", text: `Block ${params.blockIndex} out of range (have ${count}). First 5 blocks:\n${blocks.slice(0,5).map((s,i)=>`${i+1}. ${s.slice(0,400)}`).join("\n\n")}\n\nTry query or offset for bottom content.` }],
          details: { count, requested: params.blockIndex },
        } as any;
      }
      const item = blocks[idx];
      return {
        content: [{ type: "text", text: `Block ${params.blockIndex}/${count}:\n${item}\n\n--- All ${count} blocks: use query or different index ---` }],
        details: { index: params.blockIndex, count, text: item },
      } as any;
    }
    if (params.query) {
      const ctx = await b.findText(params.query, params.limit ?? 3000);
      return { content: [{ type: "text", text: ctx }], details: { query: params.query } } as any;
    }
    if (params.offset !== undefined || params.limit !== undefined) {
      const { text, length } = await b.getChunk(params.offset ?? 0, params.limit ?? 12000);
      const note = length > text.length ? ` (full page ${length} chars)` : "";
      return { content: [{ type: "text", text: text + (text.length < length ? `\n\n[Chunk ${params.offset ?? 0}..${(params.offset ?? 0)+text.length} of ${length}]` : "") }], details: { length } } as any;
    }
    const full = await b.getFullText();
    const head = full.slice(0, 12000);
    const note = full.length > 12000 ? `\n\n[Full page ${full.length} chars, showing head 12k. Use query, offset/limit, or blockIndex for remainder.]` : "";
    return { content: [{ type: "text", text: head + note }], details: { length: full.length } } as any;
  },
});

export const browserCloseTool = defineTool({
  name: "browser_close",
  label: "Browser Close",
  description: "Close Playwright Chromium.",
  parameters: Type.Object({}),
  async execute() {
    if (browser) { await browser.close(); browser = null; lastSnapshot = null; }
    return { content: [{ type: "text", text: "Browser closed." }], details: {} };
  },
});

export function getLastSnapshot() { return lastSnapshot; }
