/**
 * pi-browser-laya — zero-dependency browser-use extension
 * Idea only from jev-ultrafast (atomic snapshot + indexed actions) + laya (typed decisions in one pass)
 * Goal: 3-4 LLM calls vs 16-20
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  browserLaunchTool,
  browserSnapshotTool,
  browserActTool,
  browserExtractTool,
  browserCloseTool,
} from "./src/tools.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool(browserLaunchTool);
  pi.registerTool(browserSnapshotTool);
  pi.registerTool(browserActTool);
  pi.registerTool(browserExtractTool);
  pi.registerTool(browserCloseTool);

  // Optional: helpful command to show workflow
  pi.registerCommand("laya-help", {
    description: "Show laya browser workflow (3-4 turn pattern)",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        [
          "3-Turn FAQ pattern:",
          "1) browser_launch {url} -> snapshot",
          "2) browser_act {actions:[{id:'e42'}]} -> expanded snapshot",
          "3) browser_extract {target:'e42'} -> answer",
          "No loops. One snapshot = one plan JSON.",
        ].join("\n"),
        "info"
      );
    },
  });

  pi.on("session_shutdown", async () => {
    try { await (browserCloseTool as any).execute?.("shutdown", {}, null as any, null as any, null as any); } catch {}
  });
}
