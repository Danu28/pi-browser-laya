import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("snapshot.js — website-agnostic invariants", () => {
  const js = readFileSync("extensions/browser-laya/src/snapshot.js", "utf8");

  it("allows password and file inputs (general), blocks only hidden", () => {
    expect(js).toMatch(/safe.*\["hidden"\]|safe.*\['hidden'\]/);
    // file is mapped to kind=file (not filtered) — quote-agnostic
    expect(js).toMatch(/kind:\s*["']file["']/);
    expect(js).toContain("allow file+password");
  });

  it("traverses shadow DOM + same-origin iframes, counts cross-origin skipped", () => {
    expect(js).toContain("el.shadowRoot");
    expect(js).toContain("contentDocument");
    expect(js).toContain("crossOriginSkipped");
  });

  it("caps at 400 with priority: fill/select first, onscreen before offscreen", () => {
    expect(js).toContain("actions.sort");
    expect(js).toContain("prio");
    expect(js).toContain("splice(400)");
    expect(js).toContain("omitted");
  });

  it("captures full-page text up to 12k and exposes fullTextLength", () => {
    expect(js).toMatch(/MAX_TEXT\s*=\s*12000/);
    expect(js).toContain("fullTextLength");
  });

  it("preserves 2-4 call budget: single evaluate returns text + actions + guards + marker", () => {
    expect(js).toMatch(/return\s*\{[\s\S]*location\.href/);
    expect(js).toContain("document.title");
    expect(js).toContain("guards");
    expect(js).toContain("marker");
  });

  it("exposes closedShadowSkipped alongside crossOriginSkipped", () => {
    expect(js).toContain("closedShadowSkipped");
    expect(js).toContain("crossOriginSkipped");
    expect(js).toMatch(/closedShadowSkipped\+\+/);
    const format = readFileSync("extensions/browser-laya/src/format.ts", "utf8");
    expect(format).toContain("closedShadowSkipped");
    expect(format).toContain("closed shadow");
  });

  it("emits ARIA combobox listbox [role=option] as select actions", () => {
    expect(js).toMatch(/rname === "option"/);
    expect(js).toMatch(/kind:\s*["']select["']/);
    expect(js).toContain("aria-selected");
    expect(js).toContain("combobox");
    expect(js).toMatch(/aria-controls/);
  });
});
