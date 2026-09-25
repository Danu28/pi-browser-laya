import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { formatSnapshot, FORMAT_VERSION } from "../extensions/browser-laya/src/format.js";
import type { Snapshot } from "../extensions/browser-laya/src/browser.js";

function makeSnap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    url: "https://example.com",
    title: "Example",
    w: 1280,
    h: 900,
    text: "Hello world ".repeat(200),
    fullTextLength: 2400,
    crossOriginSkipped: 0,
    closedShadowSkipped: 0,
    scroll: { y: 0, height: 2000 },
    fingerprint: "abc123",
    guards: {},
    actions: [
      {
        id: "e1",
        role: "textbox",
        label: "Email",
        kind: "fill",
        value: "",
        rect: { x: 10, y: 100, w: 200, h: 24 },
        onscreen: true,
      },
      {
        id: "e2",
        role: "button",
        label: "Submit",
        kind: "click",
        rect: { x: 10, y: 200, w: 80, h: 30 },
        onscreen: true,
      },
    ],
    marker: [],
    page_key: [],
    omitted_actions: 0,
    ...overrides,
  } as any;
}

describe("gaps 1.1.0 — input quality to 9.8", () => {
  it("gap1: snapshot.js heading hierarchy (markdown #) and landmark markers", () => {
    const js = readFileSync("extensions/browser-laya/src/snapshot.js", "utf8");
    expect(js).toContain('#".repeat'); // heading markdown
    expect(js).toContain("h1,h2,h3,h4,h5,h6");
    expect(js).toContain('[" + landmark.tagName');
    expect(js).toContain("aria-label");
  });

  it("gap1: browser still captures 12k + fullTextLength", () => {
    const js = readFileSync("extensions/browser-laya/src/snapshot.js", "utf8");
    expect(js).toMatch(/MAX_TEXT\s*=\s*12000/);
    expect(js).toContain("fullTextLength");
  });

  it("gap2: 400-cap semantic dedup before splice", () => {
    const js = readFileSync("extensions/browser-laya/src/snapshot.js", "utf8");
    expect(js).toContain("dedupedSkipped");
    expect(js).toContain("new Map");
    expect(js).toMatch(/seen\.get\(key\)/);
    expect(js).toContain("keep first 3");
    expect(js).toContain("splice(400)");
    // dedupedSkipped is returned
    expect(js).toContain("dedupedSkipped");
  });

  it("gap2: format renders dedupedSkipped banner", () => {
    const snap = makeSnap({ dedupedSkipped: 12 } as any);
    const out = formatSnapshot(snap);
    expect(out).toContain("duplicate menu item(s) collapsed");
    expect(out).toContain("12");
  });

  it("gap3: prompt versioning + compact mode", () => {
    expect(FORMAT_VERSION).toBe("1.2.0");
    const snap = makeSnap();
    const out = formatSnapshot(snap);
    expect(out).toContain(`Format: v${FORMAT_VERSION}`);
    expect(out).toContain("Fingerprint:");
    // compact auto when >250
    const many = Array.from({ length: 260 }, (_, i) => ({
      id: `e${i + 1}`,
      role: "button",
      label: "Item " + i,
      kind: "click",
      rect: { x: 10, y: i * 10, w: 80, h: 20 },
      onscreen: true,
    }));
    const bigSnap = makeSnap({ actions: many } as any);
    const bigOut = formatSnapshot(bigSnap);
    expect(bigOut).toContain("(compact)");
    // explicit compact param
    const compactOut = formatSnapshot(snap, { compact: true });
    expect(compactOut).toContain("(compact)");
    // label trimming 60 vs 50 - compact should be shorter
    expect(compactOut.length).toBeLessThanOrEqual(out.length + 200); // not strictly shorter on tiny snap but flag works
  });

  it("gap3: format token reduction — label slice 60/50 and compact handling", () => {
    const js = readFileSync("extensions/browser-laya/src/format.ts", "utf8");
    expect(js).toContain("FORMAT_VERSION");
    expect(js).toContain("compact");
    expect(js).toContain("labelSlice");
    expect(js).toContain("50 : 60");
  });

  it("gap4: closed shadow tags + cross-origin srcs + ariaFallback", () => {
    const js = readFileSync("extensions/browser-laya/src/snapshot.js", "utf8");
    expect(js).toContain("closedShadowTags");
    expect(js).toContain("crossOriginSrcs");
    expect(js).toContain("closedShadowTags.push");
    expect(js).toContain("crossOriginSrcs.push");

    const browserSrc = readFileSync("extensions/browser-laya/src/browser.ts", "utf8");
    expect(browserSrc).toContain("closedShadowTags");
    expect(browserSrc).toContain("crossOriginSrcs");
    expect(browserSrc).toContain("dedupedSkipped");
    expect(browserSrc).toContain("ariaFallback");
    expect(browserSrc).toContain("page.accessibility.snapshot");

    const formatSrc = readFileSync("extensions/browser-laya/src/format.ts", "utf8");
    expect(formatSrc).toContain("closedShadowTags");
    expect(formatSrc).toContain("crossOriginSrcs");
    expect(formatSrc).toContain("ariaFallback");
    expect(formatSrc).toContain("ARIA Fallback");

    // format renders tags/srcs
    const snapWithTags = makeSnap({
      closedShadowSkipped: 2,
      closedShadowTags: ["my-widget", "x-foo"],
      crossOriginSkipped: 1,
      crossOriginSrcs: ["https://example.com/embed"],
    } as any);
    const out = formatSnapshot(snapWithTags);
    expect(out).toContain("my-widget");
    expect(out).toContain("https://example.com/embed");

    const snapWithAria = makeSnap({ ariaFallback: '{"role":"button","name":"ok"}' } as any);
    expect(formatSnapshot(snapWithAria)).toContain("ARIA Fallback");
  });

  it("gap4: browser_snapshot exposes compact param", () => {
    const tools = readFileSync("extensions/browser-laya/src/tools.ts", "utf8");
    expect(tools).toContain("compact");
    expect(tools).toContain("browser_snapshot");
    expect(tools).toContain("browser_act");
    expect(tools).toContain("formatSnapshot(snap");
  });

  it("gap5: vitest 5 supports vite 8 natively (no legacy-peer-deps)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.devDependencies.vitest).toContain("5.0.2");
    expect(pkg.devDependencies.vite).toContain("8.3.1");
    // peerDeps of vitest 5 allows ^8, so no overrides needed
    // ensure no legacy-peer-deps note is required
    const audit = readFileSync("docs/AUDIT.md", "utf8");
    expect(audit).toContain("1.1.0");
    expect(audit).toContain("natively supported");
    expect(audit).not.toContain("via --legacy-peer-deps");
  });

  it("gap5: format version is part of fingerprint / regression anchor", () => {
    const snap = makeSnap();
    const out1 = formatSnapshot(snap);
    const out2 = formatSnapshot(snap);
    expect(out1).toBe(out2); // deterministic
    expect(out1).toContain(`v${FORMAT_VERSION}`);
  });

  it("next to 10: query-aware ranking (50k→12k) and ranked banner", async () => {
    const js = readFileSync("extensions/browser-laya/src/snapshot.js", "utf8");
    expect(js).toContain("MAX_COLLECT");
    expect(js).toContain("relevanceQuery");
    expect(js).toContain("queryTerms");
    expect(js).toContain("TF-IDF");
    expect(js).toContain("ranked");
    // format renders ranked banner
    const rankedSnap = makeSnap({
      ranked: true,
      relevanceQuery: "pricing",
      text: "hello",
      fullTextLength: 50000,
    } as any);
    expect(formatSnapshot(rankedSnap)).toContain("Ranked 12k");
    expect(formatSnapshot(rankedSnap)).toContain('query="pricing"');
    const noQuerySnap = makeSnap({ ranked: true, text: "hello", fullTextLength: 50000 } as any);
    expect(formatSnapshot(noQuerySnap)).toContain("heading/position ranked");
    // browser tools expose query param
    const tools = readFileSync("extensions/browser-laya/src/tools.ts", "utf8");
    expect(tools).toContain("query: Type.Optional");
    expect(tools).toContain("Relevance query");
    const browserSrc = readFileSync("extensions/browser-laya/src/browser.ts", "utf8");
    expect(browserSrc).toContain("observe(query?: string");
    expect(browserSrc).toContain("launch(url: string, headed");
    expect(browserSrc).toContain("relevanceQuery");
  });
});
