import type { Snapshot } from "./browser.js";

export function formatSnapshot(snap: Snapshot): string {
  const len = (snap.fullTextLength ?? snap.text.length);
  const truncated = len > snap.text.length;
  const lines: string[] = [];
  lines.push(`URL: ${snap.url}`);
  lines.push(`Title: ${snap.title}`);
  lines.push(`Viewport: ${snap.w}x${snap.h}  Scroll: ${snap.scroll.y}/${snap.scroll.height}  Elements: ${snap.actions.length} (omitted ${snap.omitted_actions})  Text: ${snap.text.length}/${len}${truncated ? " TRUNCATED" : ""}`);
  lines.push("");
  lines.push(`=== PAGE TEXT (12k, ALL visible incl. offscreen) ${truncated ? `(page is ${len} chars, truncated)` : ""} ===`);
  lines.push(snap.text || "(no visible text)");
  if (truncated) lines.push(`\n[Text truncated: showing 0..${snap.text.length} of ${len}. Use browser_text with {query, offset, blockIndex} to fetch remaining content live.]`);
  lines.push("");
  lines.push("=== ELEMENT TABLE — ALL visible elements (onscreen + offscreen) ===");
  lines.push("Format: [id] role  label  (kind)  [y=px onscreen?]  — offscreen elements are clickable (auto scrollIntoView)");
  if (!snap.actions || snap.actions.length === 0) lines.push("(no interactive elements visible)");
  else for (const a of snap.actions) {
    const role = String(a.role ?? a.kind ?? "unknown");
    const label = String(a.label ?? a.id ?? "");
    const kind = String(a.kind ?? "click");
    const val = a.value ? ` · "${String(a.value).slice(0, 60)}"` : "";
    const extra = a.current_value ? ` (now: ${a.current_value})` : "";
    const y = a.rect ? ` y=${a.rect.y}` : "";
    const vis = a.onscreen === false ? " offscreen" : a.onscreen === true ? " onscreen" : "";
    lines.push(`[${a.id}] ${role.padEnd(10)} ${label.slice(0, 80)}${val}${extra} (${kind})${y}${vis}`);
  }
  lines.push("");
  lines.push("=== GENERAL WORKFLOW ===");
  lines.push('1) browser_launch gives full snapshot (12k text + element table with y hints). Offscreen elements are listed with y and can be clicked directly.');
  lines.push('2) For elements: browser_act [{"id":"eXX"}] (auto scrolls) → re-snapshot. Batch up to 3 if needed.');
  lines.push('3) For expanded content: browser_extract {"target":"eXX"}');
  lines.push('4) For any long-page/beyond-12k text: browser_text {"query":"<phrase>"} or {"offset":-5000} or {"blockIndex":10} or no-params for head.');
  lines.push('Do not loop on scroll; do not use fetch/web_search for live page content.');
  lines.push(`Fingerprint: ${snap.fingerprint}`);
  return lines.join("\n");
}
