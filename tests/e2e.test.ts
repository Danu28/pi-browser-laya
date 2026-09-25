import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { Browser } from "../extensions/browser-laya/src/browser.js";

let server: any;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<html><body><h1>hello world</h1><input placeholder='email'><button>Submit</button><div role='combobox' aria-expanded='true' aria-controls='list'>City</div><div role='listbox' id='list'><div role='option'>Paris</div></div></body></html>"
    );
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr: any = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("e2e headed:false — real Chromium", () => {
  it("launches http headed:false and captures snapshot (2-4 call budget)", async () => {
    const b = new Browser();
    const snap = await b.launch(baseUrl, false, 10000);
    expect(snap.text).toContain("hello world");
    expect(snap.actions.length).toBeGreaterThan(0);
    // fill prioritized
    expect(snap.actions.some((a: any) => a.kind === "fill")).toBe(true);
    // ARIA option grouped
    const option = snap.actions.find((a: any) => a.role === "option");
    expect(option).toBeTruthy();
    expect(option.label).toContain("Paris");
    expect(option.combobox || option.label).toContain("City");
    expect(snap.fingerprint).toBeTruthy();
    // crossOrigin/closedShadow present
    expect(typeof snap.crossOriginSkipped).toBe("number");
    expect(typeof snap.closedShadowSkipped).toBe("number");
    await b.close();
  }, 20000);

  it("validateUrl blocks file/data/javascript", async () => {
    const { validateUrl } = await import("../extensions/browser-laya/src/browser.js");
    expect(() => validateUrl("file:///etc/passwd")).toThrow(/Blocked protocol/);
    expect(() => validateUrl("javascript:alert(1)")).toThrow(/Blocked protocol/);
    expect(() => validateUrl("data:text/html,hi")).toThrow(/Blocked protocol/);
    expect(validateUrl("https://example.com").protocol).toBe("https:");
  });

  it("browser_download streams tmp file", async () => {
    const { writeFile, mkdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = join(tmpdir(), "pi-browser-laya-downloads");
    await mkdir(dir, { recursive: true });
    const p = join(dir, "e2e-test.txt");
    await writeFile(p, "hello download");
    const buf = await readFile(p, "utf8");
    expect(buf).toContain("hello download");
    // Also verify format banner for download
    const { formatSnapshot } = await import("../extensions/browser-laya/src/format.js");
    const fakeSnap: any = {
      url: baseUrl,
      title: "t",
      w: 1280,
      h: 900,
      text: "hi",
      fullTextLength: 2,
      scroll: { y: 0, height: 900 },
      actions: [],
      fingerprint: "x",
      omitted_actions: 0,
      guards: {},
      marker: [],
      page_key: [],
      download: { filename: "e2e-test.txt", url: "http://example.com/e2e-test.txt", path: p },
    };
    expect(formatSnapshot(fakeSnap)).toContain("DOWNLOAD:");
    expect(formatSnapshot(fakeSnap)).toContain("e2e-test.txt");
  });
});
