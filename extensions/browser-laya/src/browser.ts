/**
 * Playwright-based browser client — single dependency (playwright)
 * Manages bundled Chromium via `npx playwright install`
 * Keeps jev-style atomic snapshot (one page.evaluate call) + laya batching
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

export class StalePage extends Error {}

export interface Snapshot {
  url: string; title: string; w: number; h: number;
  text: string; fullTextLength?: number; actions: any[]; marker: any; page_key: any;
  guards: Record<string, any>; omitted_actions: number;
  scroll: { y: number; height: number }; fingerprint: string;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function loadSnapshotJs(): Promise<string> {
  // try multiple resolutions for snapshot.js
  const candidates = [
    new URL("./snapshot.js", import.meta.url),
    new URL("../src/snapshot.js", import.meta.url),
  ];
  for (const u of candidates) {
    try { return await readFile(u, "utf8"); } catch {}
  }
  try { return await readFile("extensions/browser-laya/src/snapshot.js", "utf8"); } catch {}
  return "";
}

export class Browser {
  private browser: any = null;
  private context: any = null;
  private page: any = null;
  private snapshotJs = "";

  async launch(url: string, headed = true): Promise<Snapshot> {
    // lazy load playwright — single dependency user must install: npm i playwright && npx playwright install chromium
    let chromium: any;
    try {
      const mod = await import("playwright");
      chromium = mod.chromium;
    } catch {
      // fallback via require for CJS interop
      try {
        const req = createRequire(import.meta.url);
        chromium = req("playwright").chromium;
      } catch (e: any) {
        throw new Error(
          "Playwright not installed. Run: npm install playwright && npx playwright install chromium\n" + e?.message
        );
      }
    }

    this.snapshotJs = await loadSnapshotJs();
    if (!this.snapshotJs) throw new Error("snapshot.js not found");

    this.browser = await chromium.launch({
      headless: !headed,
      args: ["--window-size=1280,900", "--disable-blink-features=AutomationControlled"],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      // keep headed rendering smooth
      deviceScaleFactor: 1,
    });
    this.page = await this.context.newPage();

    // Navigate and wait till load completely
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Extra wait for dynamic content + network idle
    await this.page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await sleep(600);

    return this.observe();
  }

  async observe(): Promise<Snapshot> {
    if (!this.page) throw new Error("Browser not launched");
    const code = this.snapshotJs;
    // page.evaluate runs snapshot.js atomically in browser context
    const snap: any = await this.page.evaluate((js: string) => {
      // eslint-disable-next-line no-eval
      return eval(js);
    }, code);
    if (!snap) throw new Error("snapshot failed — page has no body");
    // Normalize — ensure every action has role/label/kind so format.ts never crashes on padEnd (#padEnd bug)
    snap.actions = (snap.actions ?? []).map((a: any) => ({
      ...a,
      role: a.role ?? a.kind ?? "unknown",
      label: a.label ?? a.id ?? "",
      kind: a.kind ?? "click",
    }));
    snap.text = snap.text ?? "";
    snap.fullTextLength = snap.fullTextLength ?? snap.text.length;
    snap.guards = snap.guards ?? {};
    snap.scroll = snap.scroll ?? { y: 0, height: 0 };
    snap.omitted_actions = snap.omitted_actions ?? 0;
    snap.fingerprint = snap.fingerprint ?? String(Date.now());
    return snap as Snapshot;
  }

  // --- LIVE text helpers — website-agnostic (no hardcoded anchors) ---
  async getFullText(): Promise<string> {
    if (!this.page) throw new Error("Browser not launched");
    return this.page.evaluate(() => (document.body as any).innerText as string);
  }

  async getBlocks(): Promise<{ full: string; blocks: string[]; count: number }> {
    if (!this.page) throw new Error("Browser not launched");
    return this.page.evaluate(() => {
      const raw = (document.body as any).innerText as string;
      const blocks = raw.split(/\n\s*\n/).map((s: string) => s.trim()).filter(Boolean);
      const list = blocks.length > 0 ? blocks : raw.split("\n").map(s=>s.trim()).filter(Boolean);
      return { full: raw, blocks: list, count: list.length };
    });
  }

  async findText(query: string, contextChars = 3000): Promise<string> {
    const full = await this.getFullText();
    const i = full.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return `Query "${query}" not found in full page (${full.length} chars). First 4000 chars:\n${full.slice(0,4000)}`;
    return full.slice(Math.max(0, i - 600), i + contextChars);
  }

  async getChunk(offset = 0, limit = 12000): Promise<{ text: string; length: number }> {
    const full = await this.getFullText();
    const start = offset < 0 ? Math.max(0, full.length + offset) : offset;
    return { text: full.slice(start, start + limit), length: full.length };
  }

  async act(action: any, _page: Snapshot, text?: string): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");

    if (action.id === "scroll_down" || action.id === "scroll_up") {
      const delta = action.delta ?? (action.id === "scroll_down" ? 560 : -560);
      await this.page.evaluate((d: number) => window.scrollBy(0, d), delta);
      await sleep(180);
      await this.page.waitForTimeout(120).catch(() => sleep(120));
      return;
    }
    if (action.id === "wait") { await sleep(500); return; }
    // File upload — handle via JS DataTransfer fallback with friendly message
    if (action.kind === "file") {
      if (!text) throw new Error("File input requires {\"id\":\""+action.id+"\",\"text\":\"/path/to/file\"} — provide local file path");
      // Try playwright setInputFiles via evaluate + fallback
      try {
        await this.page.evaluate(({ nid, p }: any) => {
          const c:any=(window as any).__layaFast; const n=c?.nodes.get(nid) as HTMLInputElement;
          if(!n) throw new Error("file node missing");
          n.scrollIntoView({block:"center"});
        }, { nid: action.node, p: text });
        // Use playwright locator via node handle would need handle; fallback to message
        throw new Error("File upload via browser_act not yet wired to host FS — file inputs exposed as kind=file. For now, handle uploads manually or use page with drag-drop. Path received: "+text);
      } catch(e:any){ throw new Error(e.message); }
    }
    // Keyboard press via text="Enter"/"Tab"/"Escape" on click targets
    if (text && ["Enter","Tab","Escape","ArrowDown","ArrowUp"].includes(text) && action.kind==="click") {
      await this.page.keyboard.press(text as any);
      await sleep(200);
      return;
    }

    const nodeId = action.node;

    if (action.kind === "fill" && text !== undefined) {
      const ok = await this.page.evaluate(({ nid, val }: any) => {
        const c: any = (window as any).__layaFast;
        const n = c?.nodes.get(nid);
        if (!n) throw new Error("node missing " + nid);
        n.scrollIntoView({ block: "center", inline: "center" });
        n.focus();
        if (n.tagName === "INPUT" || n.tagName === "TEXTAREA") {
          n.value = val;
          n.dispatchEvent(new Event("input", { bubbles: true }));
          n.dispatchEvent(new Event("change", { bubbles: true }));
        } else if ((n as any).isContentEditable) {
          n.textContent = val;
          n.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          n.textContent = val;
        }
        return true;
      }, { nid: nodeId, val: text });
      if (!ok) throw new Error("fill failed");
      await sleep(180);
      return;
    }

    if (action.kind === "select") {
      await this.page.evaluate(({ nid, val }: any) => {
        const c: any = (window as any).__layaFast;
        const n: any = c?.nodes.get(nid);
        if (!n) throw new Error("node missing");
        n.value = val;
        n.dispatchEvent(new Event("change", { bubbles: true }));
        n.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }, { nid: nodeId, val: action.value });
      await sleep(180);
      return;
    }

    // click — with scrollIntoView + occlusion-tolerant click via evaluate
    await this.page.evaluate((nid: number) => {
      const c: any = (window as any).__layaFast;
      const n = c?.nodes.get(nid);
      if (!n) throw new Error("node missing " + nid);
      n.scrollIntoView({ block: "center", inline: "center" });
      // slight delay for scroll
      return true;
    }, nodeId);
    await sleep(80);

    // Use page.evaluate click (most reliable for jev-style snapshot nodes)
    await this.page.evaluate((nid: number) => {
      const c: any = (window as any).__layaFast;
      const n = c?.nodes.get(nid);
      if (!n || !n.isConnected) throw new Error("stale node " + nid);
      // visibility guard — mirrors snapshot's visible()
      if (!n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) throw new Error("element not visible");
      n.click();
      return true;
    }, nodeId);

    // Smart wait after click — check SPA navigation (url change) + networkidle
    await sleep(140);
    try { await this.page.waitForLoadState("networkidle", { timeout: 2000 }); } catch {}
    // Detect SPA pushState url change
    try {
      const cur = this.page.url();
      if (cur !== _page.url) await sleep(300);
    } catch {}
    // Friendly stale check: if element still not visible after scroll, hint
    try {
      await this.page.waitForTimeout(50);
    } catch {}
  }

  async close() {
    try { await this.page?.close(); } catch {}
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
    this.page = null; this.context = null; this.browser = null;
  }
}
