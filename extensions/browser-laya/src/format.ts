import type { Snapshot } from "./browser.js";

export function formatSnapshot(snap: Snapshot): string {
  const lines: string[] = [];
  lines.push(`URL: ${snap.url}`);
  lines.push(`Title: ${snap.title}`);
  lines.push(`Viewport: ${snap.w}x${snap.h}  Scroll: ${snap.scroll.y}/${snap.scroll.height}  Elements: ${snap.actions.length} (omitted ${snap.omitted_actions})`);
  lines.push("");
  lines.push("=== VISIBLE TEXT (6k max, viewport only) ===");
  lines.push(snap.text || "(no visible text)");
  lines.push("");
  lines.push("=== ELEMENT TABLE — indexed action space (pick id) ===");
  lines.push("Format: [id] role  label — value/usecase  (kind)");
  if (!snap.actions || snap.actions.length === 0) lines.push("(no interactive elements visible — try scroll_down)");
  else for (const a of snap.actions) {
    const role = String(a.role ?? a.kind ?? "unknown");
    const label = String(a.label ?? a.id ?? "");
    const kind = String(a.kind ?? "click");
    const val = a.value ? ` · "${String(a.value).slice(0, 60)}"` : "";
    const extra = a.current_value ? ` (now: ${a.current_value})` : "";
    lines.push(`[${a.id}] ${role.padEnd(10)} ${label.slice(0, 80)}${val}${extra} (${kind})`);
  }
  lines.push("");
  lines.push("=== INSTRUCTIONS (laya pattern: one JSON for op+target) ===");
  lines.push('To act, call browser_act with [{"id":"eNN"}] — batch up to 3. Example FAQ expand: [{"id":"e42"}]');
  lines.push('To extract after expand: browser_extract {"target":"e42"}');
  lines.push('To scroll: [{"id":"scroll_down"}]  To finish: browser_extract + answer in DONE');
  lines.push(`Fingerprint: ${snap.fingerprint}`);
  return lines.join("\n");
}
