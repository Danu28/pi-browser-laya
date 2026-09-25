import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { formatSnapshot } from "../extensions/browser-laya/src/format.js";
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
  };
}

describe("formatSnapshot", () => {
  it("renders URL, title and element table", () => {
    const out = formatSnapshot(makeSnap());
    expect(out).toContain("URL: https://example.com");
    expect(out).toContain("Title: Example");
    expect(out).toContain("[e1]");
    expect(out).toContain("[e2]");
    expect(out).toContain("← FILL");
  });

  it("marks truncated text and hints browser_text", () => {
    const snap = makeSnap({ text: "a".repeat(12000), fullTextLength: 25000 });
    const out = formatSnapshot(snap);
    expect(out).toContain("TRUNCATED");
    expect(out).toContain("browser_text");
  });

  it("surfaces dialog and cross-origin notes", () => {
    const snap = makeSnap({
      dialog: { type: "alert", message: "hello" },
      crossOriginSkipped: 2,
    });
    const out = formatSnapshot(snap);
    expect(out).toContain("DIALOG: alert");
    expect(out).toContain("2 cross-origin iframe(s) skipped");
  });

  it("snapshot.js contains universal traversal markers", () => {
    const js = readFileSync("extensions/browser-laya/src/snapshot.js", "utf8");
    expect(js).toContain("shadowRoot");
    expect(js).toContain("IFRAME");
    expect(js).toContain("checkVisibility");
    expect(js).toContain("priorit");
    expect(js).toContain("splice(400)");
  });

  it("shows checkbox/radio checked state and download banner", () => {
    const snapChecked = makeSnap({
      actions: [
        {
          id: "e1",
          role: "checkbox",
          label: "Agree",
          kind: "click",
          checked: "true",
          rect: { x: 10, y: 10, w: 20, h: 20 },
          onscreen: true,
        } as any,
      ],
    });
    expect(formatSnapshot(snapChecked)).toContain("checked=true");
    const snapDl = makeSnap({
      download: {
        filename: "file.pdf",
        url: "https://example.com/file.pdf",
        path: "/tmp/file.pdf",
      },
    });
    expect(formatSnapshot(snapDl)).toContain("DOWNLOAD:");
  });
});
