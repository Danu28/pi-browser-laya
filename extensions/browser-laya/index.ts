/**
 * pi-browser-laya — general browser-use extension for pi
 * Single dep: playwright bundled chromium. Atomic snapshot + offscreen-aware act + live text.
 * 1.3.0: session-isolated browsers + screenshot/pdf tools.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  browserLaunchTool,
  browserSnapshotTool,
  browserActTool,
  browserHoverTool,
  browserWaitTool,
  browserExtractTool,
  browserTextTool,
  browserCloseTool,
  browserDownloadTool,
  browserScreenshotTool,
  browserPdfTool,
  closeAllBrowsers,
} from "./src/tools.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool(browserLaunchTool);
  pi.registerTool(browserSnapshotTool);
  pi.registerTool(browserActTool);
  pi.registerTool(browserHoverTool);
  pi.registerTool(browserWaitTool);
  pi.registerTool(browserExtractTool);
  pi.registerTool(browserTextTool);
  pi.registerTool(browserCloseTool);
  pi.registerTool(browserDownloadTool);
  pi.registerTool(browserScreenshotTool);
  pi.registerTool(browserPdfTool);

  pi.registerCommand("laya-help", {
    description: "Show general browser workflow",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        [
          "General workflow:",
          "1) browser_launch {url} → snapshot (12k + element table)",
          "2) browser_act [eXX] for elements (offscreen auto-scrolls) or browser_text for long page content",
          "3) browser_extract {target} for expanded scope, or browser_text {query|offset|blockIndex} for generic text",
          "4) browser_screenshot {fullPage} for vision verify, browser_pdf for archival",
        ].join("\n"),
        "info"
      );
    },
  });

  pi.on("session_shutdown", async () => {
    try {
      await closeAllBrowsers();
    } catch {}
  });
}
