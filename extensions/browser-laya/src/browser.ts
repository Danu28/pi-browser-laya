/**
 * Playwright-based browser client — single dependency (playwright)
 * Manages bundled Chromium via `npx playwright install`
 * Keeps jev-style atomic snapshot (one page.evaluate call) + laya batching
 */

import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

export class StalePage extends Error {}

export interface Snapshot {
  url: string;
  title: string;
  w: number;
  h: number;
  text: string;
  fullTextLength?: number;
  ranked?: boolean;
  relevanceQuery?: string;
  crossOriginSkipped?: number;
  closedShadowSkipped?: number;
  closedShadowTags?: string[];
  crossOriginSrcs?: string[];
  dedupedSkipped?: number;
  ariaFallback?: string | null;
  actions: any[];
  marker: any;
  page_key: any;
  guards: Record<string, any>;
  omitted_actions: number;
  scroll: { y: number; height: number };
  fingerprint: string;
  dialog?: { type: string; message: string; defaultValue?: string } | null;
  download?: { filename: string; url: string; path: string } | null;
}

/** Validate URL — only http/https allowed, reject file/data/javascript etc. */
export function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid URL "${raw}" — must be absolute http(s) URL`);
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error(
      `Blocked protocol "${u.protocol}" — only http: and https: are allowed (got "${raw}")`
    );
  }
  return u;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadSnapshotJs(): Promise<string> {
  // try multiple resolutions for snapshot.js
  const candidates = [
    new URL("./snapshot.js", import.meta.url),
    new URL("../src/snapshot.js", import.meta.url),
  ];
  for (const u of candidates) {
    try {
      return await readFile(u, "utf8");
    } catch {}
  }
  try {
    return await readFile("extensions/browser-laya/src/snapshot.js", "utf8");
  } catch {}
  return "";
}

export class Browser {
  private browser: any = null;
  private context: any = null;
  private page: any = null;
  private snapshotJs = "";
  private lastDialog: { type: string; message: string; defaultValue?: string } | null = null;
  private lastDownload: { filename: string; url: string; path: string } | null = null;

  async launch(url: string, headed = true, timeoutMs = 30000, query?: string): Promise<Snapshot> {
    // URL validation — reject file/data/javascript/blob etc.
    validateUrl(url);
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
          "Playwright not installed. Run: npm install playwright && npx playwright install chromium\n" +
            e?.message
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
      acceptDownloads: true,
    });
    this.page = await this.context.newPage();
    // Download interception — save to tmp/downloads and expose to snapshot banner
    this.page.on("download", async (download: any) => {
      try {
        const filename = download.suggestedFilename() || "download";
        const url = download.url();
        const dir = join(tmpdir(), "pi-browser-laya-downloads");
        await mkdir(dir, { recursive: true });
        const path = join(dir, filename);
        await download.saveAs(path);
        this.lastDownload = { filename, url, path };
      } catch {
        try {
          this.lastDownload = {
            filename: download.suggestedFilename() || "download",
            url: download.url(),
            path: "",
          };
        } catch {}
      }
    });
    // Native dialog handler — auto-accept and expose to LLM (fixes P0 #1 dialog destroyed)
    this.page.on("dialog", async (dialog: any) => {
      this.lastDialog = {
        type: dialog.type(),
        message: dialog.message(),
        defaultValue: dialog.defaultValue(),
      };
      try {
        await dialog.accept(dialog.defaultValue() || undefined);
      } catch {
        try {
          await dialog.dismiss();
        } catch {}
      }
    });

    // Navigate and wait till load completely (timeout param surfaces to LLM)
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Extra wait for dynamic content + network idle
    await this.page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await sleep(600);

    return this.observe(query);
  }

  async observe(query?: string): Promise<Snapshot> {
    if (!this.page) throw new Error("Browser not launched");
    const code = this.snapshotJs;
    // page.evaluate runs snapshot.js atomically — query-aware (next to 10: relevance ranking)
    const snap: any = await this.page.evaluate(
      ({ js, q }: { js: string; q: string | undefined }) => {
        // clean js: remove leading eslint comments and trailing semicolon for Function wrapping
        const clean = js
          .replace(/^\/\*[\s\S]*?\*\//, "")
          .trim()
          .replace(/;\s*$/, "");
        try {
          const fn = (Function("query", "return (" + clean + ")") as any)(q);
          if (typeof fn === "function") return fn(q);
          if (fn && typeof fn === "object") return fn;
        } catch {
          // debug: expose error via fallback
        }
        // fallback: old self-invoked IIFE
        try {
          return (Function("return " + js) as any)();
        } catch {
          return null;
        }
      },
      { js: code, q: query }
    );
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
    snap.crossOriginSkipped = snap.crossOriginSkipped ?? 0;
    snap.closedShadowSkipped = snap.closedShadowSkipped ?? 0;
    snap.closedShadowTags = snap.closedShadowTags ?? [];
    snap.crossOriginSrcs = snap.crossOriginSrcs ?? [];
    snap.dedupedSkipped = snap.dedupedSkipped ?? 0;
    snap.guards = snap.guards ?? {};
    snap.scroll = snap.scroll ?? { y: 0, height: 0 };
    snap.omitted_actions = snap.omitted_actions ?? 0;
    snap.fingerprint = snap.fingerprint ?? String(Date.now());
    snap.dialog = this.lastDialog;
    if (this.lastDialog) this.lastDialog = null; // consume once
    snap.download = this.lastDownload;
    if (this.lastDownload) this.lastDownload = null; // consume once (banner)
    // gap4: accessibility fallback when closed shadow / cross-origin blocks pierce (best-effort, 3k truncated)
    if (
      (snap.closedShadowSkipped > 0 || snap.crossOriginSkipped > 0) &&
      this.page?.accessibility?.snapshot
    ) {
      try {
        const ax: any = await this.page.accessibility.snapshot({ interestingOnly: true });
        const flat = JSON.stringify(ax).slice(0, 3000);
        snap.ariaFallback = flat.length > 100 ? flat : null;
      } catch {
        snap.ariaFallback = null;
      }
    } else snap.ariaFallback = null;
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
      const blocks = raw
        .split(/\n\s*\n/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      const list =
        blocks.length > 0
          ? blocks
          : raw
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
      return { full: raw, blocks: list, count: list.length };
    });
  }

  async findText(query: string, contextChars = 3000): Promise<string> {
    const full = await this.getFullText();
    const i = full.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0)
      return `Query "${query}" not found in full page (${full.length} chars). First 4000 chars:\n${full.slice(0, 4000)}`;
    return full.slice(Math.max(0, i - 600), i + contextChars);
  }

  async getChunk(offset = 0, limit = 12000): Promise<{ text: string; length: number }> {
    const full = await this.getFullText();
    const start = offset < 0 ? Math.max(0, full.length + offset) : offset;
    return { text: full.slice(start, start + limit), length: full.length };
  }

  async hover(action: any): Promise<void> {
    if (!this.page) throw new Error("Browser not launched");
    await this.page.evaluate((nid: number) => {
      const c: any = (window as any).__layaFast;
      const n = c?.nodes.get(nid);
      if (!n || !n.isConnected)
        throw new Error(
          "hover node missing " + nid + " — StalePage: re-observe via browser_snapshot"
        );
      n.scrollIntoView({ block: "center" });
      n.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
      n.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      n.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    }, action.node);
    await sleep(400);
  }

  async waitFor(timeoutMs = 1000, selector?: string): Promise<void> {
    if (selector) {
      try {
        await this.page.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
      } catch {}
      return;
    }
    await sleep(timeoutMs);
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
    if (action.id === "wait") {
      await sleep(500);
      return;
    }
    // File upload — wire via DataTransfer dummy file (general, any site)
    if (action.kind === "file") {
      if (!text)
        throw new Error(
          'File input requires {"id":"' +
            action.id +
            '","text":"/path/to/file"} — provide local file path'
        );
      const fileName = String(text).split(/[\\/]/).pop() || String(text);
      await this.page.evaluate(
        ({ nid, name }: any) => {
          const c: any = (window as any).__layaFast;
          const n = c?.nodes.get(nid) as HTMLInputElement;
          if (!n) throw new Error("file node missing " + nid);
          n.scrollIntoView({ block: "center" });
          try {
            const dt = new DataTransfer();
            const file = new File(["dummy content for " + name], name, {
              type: "application/octet-stream",
            });
            dt.items.add(file);
            (n as any).files = dt.files;
            n.dispatchEvent(new Event("change", { bubbles: true }));
            n.dispatchEvent(new Event("input", { bubbles: true }));
          } catch (e: any) {
            throw new Error("file inject failed: " + e.message);
          }
        },
        { nid: action.node, name: fileName }
      );
      await sleep(300);
      return;
    }
    // Keyboard press via text="Enter"/"Tab"/"Escape" on click targets
    if (
      text &&
      ["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"].includes(text) &&
      action.kind === "click"
    ) {
      await this.page.keyboard.press(text as any);
      await sleep(200);
      return;
    }

    const nodeId = action.node;

    if (action.kind === "fill" && text !== undefined) {
      const ok = await this.page.evaluate(
        ({ nid, val }: any) => {
          const c: any = (window as any).__layaFast;
          const n = c?.nodes.get(nid);
          if (!n)
            throw new Error(
              "node missing " + nid + " — StalePage: re-observe via browser_snapshot"
            );
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
        },
        { nid: nodeId, val: text }
      );
      if (!ok) throw new Error("fill failed");
      await sleep(180);
      return;
    }

    if (action.kind === "select") {
      await this.page.evaluate(
        ({ nid, val }: any) => {
          const c: any = (window as any).__layaFast;
          const n: any = c?.nodes.get(nid);
          if (!n) throw new Error("node missing — StalePage: re-observe via browser_snapshot");
          n.value = val;
          n.dispatchEvent(new Event("change", { bubbles: true }));
          n.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        },
        { nid: nodeId, val: action.value }
      );
      await sleep(180);
      return;
    }

    // click — with scrollIntoView + occlusion-tolerant click via evaluate
    await this.page.evaluate((nid: number) => {
      const c: any = (window as any).__layaFast;
      const n = c?.nodes.get(nid);
      if (!n)
        throw new Error("node missing " + nid + " — StalePage: re-observe via browser_snapshot");
      n.scrollIntoView({ block: "center", inline: "center" });
      // slight delay for scroll
      return true;
    }, nodeId);
    await sleep(80);

    // Use page.evaluate click (most reliable for jev-style snapshot nodes)
    await this.page.evaluate((nid: number) => {
      const c: any = (window as any).__layaFast;
      const n = c?.nodes.get(nid);
      if (!n || !n.isConnected)
        throw new Error("stale node " + nid + " — StalePage: re-observe via browser_snapshot");
      // visibility guard — mirrors snapshot's visible()
      if (!n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
        throw new Error("element not visible");
      n.click();
      return true;
    }, nodeId);

    // Smart wait after click — check SPA navigation (url change) + networkidle
    await sleep(140);
    try {
      await this.page.waitForLoadState("networkidle", { timeout: 2000 });
    } catch {}
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
    try {
      await this.page?.close();
    } catch {}
    try {
      await this.context?.close();
    } catch {}
    try {
      await this.browser?.close();
    } catch {}
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
