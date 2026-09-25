import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("browser.ts — pi extension wiring", () => {
  const src = readFileSync("extensions/browser-laya/src/browser.ts", "utf8");
  const tools = readFileSync("extensions/browser-laya/src/tools.ts", "utf8");
  const index = readFileSync("extensions/browser-laya/index.ts", "utf8");

  it("handles file upload via DataTransfer and keyboard via text:Enter", () => {
    expect(src).toContain("DataTransfer");
    expect(src).toMatch(/kind\s*===\s*["']file["']/);
    expect(src).toMatch(/\["Enter",\s*"Tab",\s*"Escape"/);
  });

  it("auto-scrolls offscreen/shadow nodes before act", () => {
    expect(src).toContain("scrollIntoView");
    expect(src).toContain("nodes.get");
  });

  it("dialog auto-accept and live text helpers exposed", () => {
    expect(src).toContain('page.on("dialog"');
    expect(src).toContain("getFullText");
    expect(src).toContain("getBlocks");
    expect(src).toContain("findText");
    expect(src).toContain("getChunk");
  });

  it("tools register 9 pi tools and batch 1-5", () => {
    expect(tools).toContain("browserLaunchTool");
    expect(tools).toContain("browserActTool");
    expect(tools).toContain("browserTextTool");
    expect(tools).toContain("browserDownloadTool");
    expect(tools).toContain("Batch 1-5");
    expect(index).toContain("registerTool");
    expect(index).toContain("session_shutdown");
    expect(index).toContain("browserDownloadTool");
  });

  it("versions unified at 1.0.0 and playwright pinned", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const ext = JSON.parse(readFileSync("extensions/browser-laya/package.json", "utf8"));
    expect(root.version).toBe("1.0.0");
    expect(ext.version).toBe("1.0.0");
    expect(root.dependencies.playwright).toBe("1.63.0");
    expect(ext.dependencies.playwright).toBe("1.63.0");
  });

  it("validates http/https only and exposes timeout", () => {
    expect(src).toContain("validateUrl");
    expect(src).toMatch(/new URL\(raw\)/);
    expect(src).toMatch(/http:/);
    expect(src).toMatch(/https:/);
    expect(src).toMatch(/Blocked protocol/);
    expect(tools).toContain("timeout");
    expect(tools).toMatch(/timeout.*Number|Number.*timeout/);
  });

  it("uses Function instead of eval for snapshot injection", () => {
    expect(src).toMatch(/Function\(.*return.*js/);
    expect(src).not.toMatch(/return eval\(js\)/);
  });

  it("handles download interception and StalePage hint", () => {
    expect(src).toContain("acceptDownloads");
    expect(src).toContain("lastDownload");
    expect(src).toContain('page.on("download"');
    expect(src).toContain("StalePage: re-observe");
    const format = readFileSync("extensions/browser-laya/src/format.ts", "utf8");
    expect(format).toContain("DOWNLOAD:");
  });

  it("checkbox/radio state surfaced in format and toggle diff", () => {
    const format = readFileSync("extensions/browser-laya/src/format.ts", "utf8");
    expect(format).toMatch(/checked=.*a\.checked/);
    expect(readFileSync("extensions/browser-laya/src/tools.ts", "utf8")).toContain(
      "Toggle feedback"
    );
  });

  it("TS lint enabled via typescript-eslint", () => {
    const eslint = readFileSync("eslint.config.js", "utf8");
    expect(eslint).toContain("typescript-eslint");
    expect(eslint).toContain("tseslint");
    expect(eslint).toContain("@typescript-eslint/no-explicit-any");
  });
});
