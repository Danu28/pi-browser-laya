/**
 * Tool definitions — laya-inspired batched actions
 * One LLM call -> many typed decisions; one browser call -> atomic snapshot
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
    "Launch Chrome (headed) and navigate to URL. Waits for load, then returns ATOMIC snapshot: visible text (6k) + indexed element table e1..e250. Use this single snapshot for planning — DO NOT call snapshot again before acting. Headed mode shows browser window.",
  parameters: Type.Object({
    url: Type.String({ description: "URL to open, e.g. https://instantink.hpconnected.com/us/en/l/v2" }),
    headed: Type.Optional(Type.Boolean({ description: "Show headed window (default true)" })),
  }),
  async execute(_id, params) {
    if (browser) { try { await browser.close(); } catch {} browser = null; }
    browser = new Browser();
    const snap = await browser.launch(params.url, params.headed ?? true);
    lastSnapshot = snap;
    const formatted = formatSnapshot(snap);
    return {
      content: [{ type: "text", text: formatted }],
      details: { url: snap.url, title: snap.title, actions: snap.actions.length, fingerprint: snap.fingerprint },
    };
  },
});

// ---------- browser_snapshot ----------
export const browserSnapshotTool = defineTool({
  name: "browser_snapshot",
  label: "Browser Snapshot",
  description: "Re-observe page atomically (one CDP call). Returns updated visible text + element table. Call only after browser_act.",
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

// ---------- browser_act (BATCHED) ----------
export const browserActTool = defineTool({
  name: "browser_act",
  label: "Browser Act (batched)",
  description:
    "Execute 1-3 actions as a BATCH in one browser call, then auto re-observe once. This is how you achieve 3-4 turn task completion.\n" +
    "Laya pattern: operation+target in ONE JSON. Example: [{\"id\":\"e42\"}] clicks 4th FAQ. For scroll: [{\"id\":\"scroll_down\"}]. For fill: [{\"id\":\"e5\",\"text\":\"hello\"}].\n" +
    "Batch example: [{\"id\":\"e42\"},{\"id\":\"e43\"}]. Returns single updated snapshot after all actions.",
  parameters: Type.Object({
    actions: Type.Array(
      Type.Object({
        id: Type.String({ description: "Element id e1..e250 or scroll_down/scroll_up/wait" }),
        text: Type.Optional(Type.String({ description: "Text for fill actions only" })),
      }),
      { description: "Ordered batch 1-3 actions to execute atomically" }
    ),
  }),
  async execute(_id, params) {
    const b = getBrowser();
    if (!lastSnapshot) lastSnapshot = await b.observe();
    const snap = lastSnapshot;
    for (const a of params.actions) {
      const action = snap.actions.find((x: any) => x.id === a.id);
      // allow scroll/wait without lookup
      const target = action ?? (["scroll_down", "scroll_up", "wait"].includes(a.id) ? { id: a.id, kind: a.id.startsWith("scroll") ? "scroll" : "wait", delta: a.id === "scroll_down" ? 560 : -560 } : null);
      if (!target) throw new Error(`Unknown element ${a.id}. Available: ${snap.actions.slice(0, 20).map((x: any) => x.id).join(", ")}`);
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

// ---------- browser_extract ----------
export const browserExtractTool = defineTool({
  name: "browser_extract",
  label: "Browser Extract",
  description:
    "Extract text from last snapshot without new LLM call for loops. Give element id (e.g. e42) or query substring. Returns scope.innerText + visible text. Use after FAQ is expanded to get answer.",
  parameters: Type.Object({
    target: Type.Optional(Type.String({ description: "Element id e.g. e42 (4th FAQ). If omitted, searches visible text." })),
    query: Type.Optional(Type.String({ description: "Substring to find in visible text, e.g. 'FAQ' or question text" })),
  }),
  async execute(_id: any, params: any) {
    const b = getBrowser();
    const snap = lastSnapshot ?? await b.observe();
    if (params.target) {
      const el = snap.actions.find((x: any) => x.id === params.target);
      if (!el) throw new Error(`No ${params.target}`);
      // guards scope contains expanded text
      const guard = (snap.guards as any)[el.node];
      const scopeText = guard?.[13] ?? "";
      return {
        content: [{ type: "text", text: `EXTRACT ${params.target} (${el.label})\nrole=${el.role} kind=${el.kind}\n--- scope (up to 6k) ---\n${scopeText.slice(0, 6000)}\n--- visible page text ---\n${snap.text.slice(0, 6000)}` }],
        details: { id: params.target, label: el.label },
      } as any;
    }
    if (params.query) {
      const idx = snap.text.indexOf(params.query);
      const ctx = idx >= 0 ? snap.text.slice(Math.max(0, idx - 500), idx + 2000) : `Query "${params.query}" not found. Full text:\n${snap.text.slice(0, 4000)}`;
      return { content: [{ type: "text", text: ctx }], details: { query: params.query } } as any;
    }
    return { content: [{ type: "text", text: snap.text.slice(0, 6000) }], details: {} } as any;
  },
});

export const browserCloseTool = defineTool({
  name: "browser_close",
  label: "Browser Close",
  description: "Close Chrome and release CDP session.",
  parameters: Type.Object({}),
  async execute() {
    if (browser) { await browser.close(); browser = null; lastSnapshot = null; }
    return { content: [{ type: "text", text: "Browser closed." }], details: {} };
  },
});

// for agent helper
export function getLastSnapshot() { return lastSnapshot; }
