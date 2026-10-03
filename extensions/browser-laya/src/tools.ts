/**
 * Tool definitions — website-agnostic: snapshot + act + live text for any site
 * Session-isolated: per-session Browser via WeakMap<sessionManager, Store> + fallback global
 */

import { stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Browser, type Snapshot } from "./browser.js";
import { formatSnapshot } from "./format.js";

type SessionStore = { browser: Browser | null; lastSnapshot: Snapshot | null };
const sessionStores = new WeakMap<object, SessionStore>();
let fallbackStore: SessionStore = { browser: null, lastSnapshot: null };

function getStore(ctx?: any): SessionStore {
  const mgr = ctx?.sessionManager;
  if (mgr && typeof mgr === "object") {
    let s = sessionStores.get(mgr);
    if (!s) {
      s = { browser: null, lastSnapshot: null };
      sessionStores.set(mgr, s);
    }
    return s;
  }
  return fallbackStore;
}

function getBrowser(ctx?: any): Browser {
  const store = getStore(ctx);
  if (!store.browser) throw new Error("Browser not launched. Call browser_launch first.");
  return store.browser;
}

export function closeAllBrowsers(): Promise<void[]> {
  const tasks: Promise<void>[] = [];
  if (fallbackStore.browser) tasks.push(fallbackStore.browser.close().catch(() => {}));
  fallbackStore = { browser: null, lastSnapshot: null };
  // WeakMap entries GC'd on session_shutdown — also iterate via known stores if exposed
  // We track active stores via a Set for deterministic shutdown
  for (const s of activeStores) {
    if (s.browser) tasks.push(s.browser.close().catch(() => {}));
    s.browser = null;
    s.lastSnapshot = null;
  }
  activeStores.clear();
  return Promise.all(tasks);
}
const activeStores = new Set<SessionStore>();

// ---------- browser_launch ----------
export const browserLaunchTool = defineTool({
  name: "browser_launch",
  label: "Browser Launch",
  description:
    "Launch Playwright Chromium headed, goto URL, wait networkidle. Returns 12k full-page snapshot (text incl. offscreen, incl. shadow DOM + iframe) + element table with y/onscreen/frame hints. Offscreen/shadow/iframe elements are clickable (auto scrollIntoView). For content beyond 12k use browser_text. Use ONLY these browser tools, not fetch.",
  parameters: Type.Object({
    url: Type.String({
      description: "URL to open (http/https only — file/data/javascript blocked)",
    }),
    headed: Type.Optional(Type.Boolean({ description: "Show headed window (default true)" })),
    timeout: Type.Optional(
      Type.Number({ description: "Navigation timeout ms (default 30000, max 60000)" })
    ),
    query: Type.Optional(
      Type.String({
        description:
          "Optional relevance query for 50k pages — ranks best 12k by TF-IDF + headings (next to 10). E.g. 'pricing disclaimer' keeps relevant blocks, not just head.",
      })
    ),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const store = getStore(ctx);
    activeStores.add(store);
    if (store.browser) {
      try {
        await store.browser.close();
      } catch {}
      store.browser = null;
    }
    store.browser = new Browser();
    const snap = await store.browser.launch(
      params.url,
      params.headed ?? true,
      params.timeout ?? 30000,
      params.query
    );
    store.lastSnapshot = snap;
    // keep fallback in sync for tests without ctx
    if (store === fallbackStore) fallbackStore.lastSnapshot = snap;
    return {
      content: [{ type: "text", text: formatSnapshot(snap) }],
      details: {
        url: snap.url,
        title: snap.title,
        actions: snap.actions.length,
        fingerprint: snap.fingerprint,
      },
    };
  },
});

// ---------- browser_snapshot ----------
export const browserSnapshotTool = defineTool({
  name: "browser_snapshot",
  label: "Browser Snapshot",
  description:
    "Re-observe full page atomically (one evaluate). Returns ranked 12k (50k→best 12k, heading+TF-IDF) + element table. Use compact:true for 250+ els, query:'...' for relevance ranking.",
  parameters: Type.Object({
    compact: Type.Optional(
      Type.Boolean({ description: "Compact element table (saves tokens, auto on 250+ els)" })
    ),
    query: Type.Optional(
      Type.String({
        description: "Relevance query — re-ranks 50k page to best 12k (TF-IDF + headings)",
      })
    ),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const store = getStore(ctx);
    const b = getBrowser(ctx);
    const snap = await b.observe(params?.query);
    store.lastSnapshot = snap;
    return {
      content: [{ type: "text", text: formatSnapshot(snap, { compact: params?.compact }) }],
      details: { url: snap.url, actions: snap.actions.length },
    };
  },
});

// ---------- browser_act (BATCHED + offscreen/shadow-aware, handles fill) ----------
export const browserActTool = defineTool({
  name: "browser_act",
  label: "Browser Act (batched)",
  description:
    'Execute 1-5 actions as batch then auto re-observe once. Use ONLY this for clicks AND fills. For fills: browser_act [{"id":"eXX","text":"value"}] where kind=fill (marked ← FILL). Batch 5: [{"id":"e5","text":"a@b.com"},{"id":"e7","text":"Secret123"},{"id":"e22"}] (fills+submit in 1 call). Custom ARIA combobox (React Select): click combobox [eXX] then click option [eYY] (role=option) — both are click kind. Elements include offscreen/shadow/iframe. Avoid fetch.',
  parameters: Type.Object({
    actions: Type.Array(
      Type.Object({
        id: Type.String({ description: "Element id e1..e250 or scroll_down/scroll_up/wait" }),
        text: Type.Optional(Type.String({ description: "Text for fill only" })),
      }),
      { description: "Batch 1-5 (was 3)" }
    ),
    compact: Type.Optional(
      Type.Boolean({ description: "Compact element table (auto on 250+ els)" })
    ),
    query: Type.Optional(
      Type.String({ description: "Relevance query for post-act re-observe (50k→ranked 12k)" })
    ),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const store = getStore(ctx);
    const b = getBrowser(ctx);
    if (!store.lastSnapshot) store.lastSnapshot = await b.observe(params?.query);
    const snap = store.lastSnapshot!;
    for (const a of params.actions) {
      const action = snap.actions.find((x: any) => x.id === a.id);
      const target =
        action ??
        (["scroll_down", "scroll_up", "wait"].includes(a.id)
          ? {
              id: a.id,
              kind: a.id.startsWith("scroll") ? "scroll" : "wait",
              delta: a.id === "scroll_down" ? 560 : -560,
            }
          : null);
      if (!target)
        throw new Error(
          `Unknown ${a.id}. Have: ${snap.actions
            .slice(0, 30)
            .map((x: any) => `${x.id}:${x.label.slice(0, 25)}`)
            .join(", ")}`
        );
      await b.act(target, snap, a.text, _signal);
    }
    const next = await b.observe(params?.query);
    store.lastSnapshot = next;
    // Toggle feedback — compare checkbox/radio checked before/after for diff hint
    let diffNote = "";
    try {
      const diffs: string[] = [];
      for (const aid of params.actions) {
        const before: any = snap.actions.find((x: any) => x.id === aid.id);
        if (!before || before.checked === undefined) continue;
        const after: any = next.actions.find((x: any) => x.node === before.node);
        if (after && String(before.checked) !== String(after.checked)) {
          diffs.push(`${aid.id} "${before.label}" checked: ${before.checked} → ${after.checked}`);
        }
      }
      if (diffs.length) diffNote = "\n\n[Toggle feedback]\n" + diffs.join("\n");
    } catch {}
    const text = formatSnapshot(next, { compact: params.compact }) + diffNote;
    return {
      content: [{ type: "text", text }],
      details: { executed: params.actions.map((a: any) => a.id), url: next.url },
    } as any;
  },
});

// ---------- browser_hover — for transient dropdowns / hover menus ----------
export const browserHoverTool = defineTool({
  name: "browser_hover",
  label: "Browser Hover",
  description:
    "Hover over element to reveal transient dropdown/loader (1-sec spinner, hover menus). Uses mouseover/mouseenter. For dropdown whose element disappears on inspect, hover then quickly browser_snapshot.",
  parameters: Type.Object({
    id: Type.String({ description: "Element id e1..e250 to hover" }),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const store = getStore(ctx);
    const b = getBrowser(ctx);
    const snap = store.lastSnapshot ?? (await b.observe());
    const action = snap.actions.find((x: any) => x.id === params.id);
    if (!action) throw new Error(`Unknown ${params.id}`);
    await b.hover(action, _signal);
    const next = await b.observe();
    store.lastSnapshot = next;
    return {
      content: [{ type: "text", text: formatSnapshot(next) }],
      details: { hovered: params.id },
    } as any;
  },
});

export const browserWaitTool = defineTool({
  name: "browser_wait",
  label: "Browser Wait",
  description:
    "Wait for transient content: timeout ms or waitForSelector. Use for 1-sec Spin Loader that disappears, or waiting for dropdown to appear after hover. Do not loop scroll.",
  parameters: Type.Object({
    timeout: Type.Optional(Type.Number({ description: "Ms to wait (default 1000, max 5000)" })),
    selector: Type.Optional(
      Type.String({ description: 'CSS selector to wait for visible (e.g. "[role=option]")' })
    ),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const store = getStore(ctx);
    const b = getBrowser(ctx);
    await b.waitFor(params.timeout ?? 1000, params.selector, _signal);
    const snap = await b.observe();
    store.lastSnapshot = snap;
    return {
      content: [{ type: "text", text: formatSnapshot(snap) }],
      details: { waited: params.timeout ?? 1000 },
    } as any;
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
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const b = getBrowser(ctx);
    const store = getStore(ctx);
    const snap = store.lastSnapshot ?? (await b.observe());
    if (params.target) {
      const el = snap.actions.find((x: any) => x.id === params.target);
      if (!el) throw new Error(`No ${params.target}`);
      const guard = (snap.guards as any)[el.node];
      const scopeText = guard?.[13] ?? "";
      return {
        content: [
          {
            type: "text",
            text: `EXTRACT ${params.target} (${el.label})\nrole=${el.role} kind=${el.kind} y=${el.rect?.y}\n--- scope (up to 6k) ---\n${scopeText.slice(0, 6000)}\n--- snapshot text ---\n${snap.text.slice(0, 6000)}`,
          },
        ],
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
    'Live full-page innerText reader for any website and any length. Runs page.evaluate(() => document.body.innerText) live. Modes: no params → head (12k); {query:"<phrase>"} → context around match; {offset, limit} → pagination (offset supports negative for bottom); {blockIndex:N} → Nth block split by blank lines (1-based, website-agnostic). Use for bottom disclaimers, long articles, or when snapshot is truncated. Do not use fetch/web_search for live page content.',
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Substring to search live full text" })),
    offset: Type.Optional(
      Type.Number({
        description:
          "Char offset into full innerText; negative counts from end (e.g. -5000 for bottom)",
      })
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Chars to return (default 12000 for head, 3000 for query context)",
      })
    ),
    blockIndex: Type.Optional(
      Type.Number({
        description: "1-based block index split by blank lines (generic, no site anchor)",
      })
    ),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const b = getBrowser(ctx);
    if (params.blockIndex) {
      const { blocks, count } = await b.getBlocks();
      const idx = Number(params.blockIndex) - 1;
      if (idx < 0 || idx >= count) {
        return {
          content: [
            {
              type: "text",
              text: `Block ${params.blockIndex} out of range (have ${count}). First 5 blocks:\n${blocks
                .slice(0, 5)
                .map((s, i) => `${i + 1}. ${s.slice(0, 400)}`)
                .join("\n\n")}\n\nTry query or offset for bottom content.`,
            },
          ],
          details: { count, requested: params.blockIndex },
        } as any;
      }
      const item = blocks[idx];
      return {
        content: [
          {
            type: "text",
            text: `Block ${params.blockIndex}/${count}:\n${item}\n\n--- All ${count} blocks: use query or different index ---`,
          },
        ],
        details: { index: params.blockIndex, count, text: item },
      } as any;
    }
    if (params.query) {
      const ctxText = await b.findText(params.query, params.limit ?? 3000);
      return {
        content: [{ type: "text", text: ctxText }],
        details: { query: params.query },
      } as any;
    }
    if (params.offset !== undefined || params.limit !== undefined) {
      const { text, length } = await b.getChunk(params.offset ?? 0, params.limit ?? 12000);
      return {
        content: [
          {
            type: "text",
            text:
              text +
              (text.length < length
                ? `\n\n[Chunk ${params.offset ?? 0}..${(params.offset ?? 0) + text.length} of ${length}]`
                : ""),
          },
        ],
        details: { length },
      } as any;
    }
    const full = await b.getFullText();
    const head = full.slice(0, 12000);
    const note =
      full.length > 12000
        ? `\n\n[Full page ${full.length} chars, showing head 12k. Use query, offset/limit, or blockIndex for remainder.]`
        : "";
    return {
      content: [{ type: "text", text: head + note }],
      details: { length: full.length },
    } as any;
  },
});

export const browserCloseTool = defineTool({
  name: "browser_close",
  label: "Browser Close",
  description: "Close Playwright Chromium.",
  parameters: Type.Object({}),
  async execute(_id: any, _params: any, _signal: any, _onUpdate: any, ctx: any) {
    const store = getStore(ctx);
    if (store.browser) {
      await store.browser.close();
      store.browser = null;
      store.lastSnapshot = null;
      activeStores.delete(store);
    } else if (fallbackStore.browser) {
      await fallbackStore.browser.close();
      fallbackStore.browser = null;
      fallbackStore.lastSnapshot = null;
    }
    return { content: [{ type: "text", text: "Browser closed." }], details: {} };
  },
});

export const browserDownloadTool = defineTool({
  name: "browser_download",
  label: "Browser Download",
  description:
    "Stream back a download saved via browser_launch→click (acceptDownloads). No path → streams last download; with {path} streams that file. Returns head 50k chars (text) or base64 note for binary. Saved to tmpdir()/pi-browser-laya-downloads.",
  parameters: Type.Object({
    path: Type.Optional(
      Type.String({ description: "Absolute path from DOWNLOAD banner; omit for last download" })
    ),
    maxBytes: Type.Optional(Type.Number({ description: "Max bytes to return (default 50000)" })),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const store = getStore(ctx);
    const snap: any = store.lastSnapshot ?? fallbackStore.lastSnapshot;
    const targetPath: string | undefined = params.path ?? snap?.download?.path;
    if (!targetPath)
      throw new Error(
        "No download yet. Trigger a download via browser_act click, then call browser_download. Download appears as DOWNLOAD banner in snapshot."
      );
    // Security: only allow paths inside tmpdir (prevents arbitrary read via LLM-controlled path)
    const allowedRoots = [tmpdir(), "/tmp", "/private/tmp"];
    const isAllowed = allowedRoots.some((r) => targetPath.startsWith(r));
    if (!isAllowed) throw new Error(`Blocked path "${targetPath}" — only tmpdir downloads allowed`);
    const s = await stat(targetPath).catch(() => null);
    if (!s) throw new Error(`File not found: ${targetPath}`);
    const max = Math.min(params.maxBytes ?? 50000, 200000);
    const buf = await readFile(targetPath);
    const slice = buf.slice(0, max);
    const isText = slice
      .slice(0, 1024)
      .every((b: number) => b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126) || b >= 128);
    const head = isText
      ? slice.toString("utf8")
      : slice.toString("base64").slice(0, max) + " (base64)";
    const note =
      buf.length > max
        ? `\n\n[Truncated ${buf.length - max} bytes of ${buf.length} total. Use maxBytes or read file directly.]`
        : "";
    return {
      content: [{ type: "text", text: `File: ${targetPath} (${s.size} bytes)\n${head}${note}` }],
      details: { path: targetPath, size: s.size },
    } as any;
  },
});

// ---------- browser_screenshot — NEW: vision support ----------
export const browserScreenshotTool = defineTool({
  name: "browser_screenshot",
  label: "Browser Screenshot",
  description:
    "Capture PNG screenshot of current page. Use for vision-model verification. Returns base64 PNG (truncated preview). Save via tmp file if needed. Requires browser_launch first.",
  parameters: Type.Object({
    fullPage: Type.Optional(
      Type.Boolean({ description: "Capture full scrollable page (default false = viewport)" })
    ),
  }),
  async execute(_id: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
    const b = getBrowser(ctx);
    const buf: Buffer = await b.screenshot(params.fullPage ?? false);
    const b64 = buf.toString("base64");
    const preview = b64.slice(0, 60000);
    const note =
      b64.length > 60000 ? `\n[Truncated ${b64.length - 60000} base64 chars of ${b64.length}]` : "";
    return {
      content: [
        {
          type: "text" as const,
          text: `Screenshot PNG ${buf.length} bytes (base64 ${b64.length} chars) fullPage=${!!params.fullPage}\n${preview}${note}`,
        },
        { type: "image" as const, data: b64, mimeType: "image/png" } as any,
      ],
      details: { size: buf.length, fullPage: !!params.fullPage },
    } as any;
  },
});

// ---------- browser_pdf — NEW: PDF export ----------
export const browserPdfTool = defineTool({
  name: "browser_pdf",
  label: "Browser PDF",
  description:
    "Save page as PDF (A4). Requires headed:false launch (Chromium headless PDF). Returns base64 PDF truncated + saves to tmp. Use for docs archival.",
  parameters: Type.Object({}),
  async execute(_id: any, _params: any, _signal: any, _onUpdate: any, ctx: any) {
    const b = getBrowser(ctx);
    const buf: Buffer = await b.pdf();
    const b64 = buf.toString("base64");
    const preview = b64.slice(0, 60000);
    const note =
      b64.length > 60000 ? `\n[Truncated ${b64.length - 60000} base64 chars of ${b64.length}]` : "";
    return {
      content: [
        {
          type: "text",
          text: `PDF ${buf.length} bytes (base64 ${b64.length} chars)\n${preview}${note}`,
        },
      ],
      details: { size: buf.length },
    } as any;
  },
});

export function getLastSnapshot(ctx?: any) {
  return getStore(ctx).lastSnapshot ?? fallbackStore.lastSnapshot;
}

// For tests: expose sessionStores
export function _getFallbackStore() {
  return fallbackStore;
}
export function _resetFallbackForTests() {
  fallbackStore = { browser: null, lastSnapshot: null };
  void sessionStores;
}
