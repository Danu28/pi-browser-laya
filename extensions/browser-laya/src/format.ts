import type { Snapshot } from "./browser.js";

export function formatSnapshot(snap: Snapshot): string {
  const len = (snap.fullTextLength ?? snap.text.length);
  const truncated = len > snap.text.length;
  const lines: string[] = [];
  lines.push(`URL: ${snap.url}`);
  lines.push(`Title: ${snap.title}`);
  lines.push(`Viewport: ${snap.w}x${snap.h}  Scroll: ${snap.scroll.y}/${snap.scroll.height}  Elements: ${snap.actions.length} (omitted ${snap.omitted_actions})  Text: ${snap.text.length}/${len}${truncated ? " TRUNCATED" : ""}`);
  if ((snap as any).crossOriginSkipped) lines.push(`Note: ${ (snap as any).crossOriginSkipped} cross-origin iframe(s) skipped (CORS, opaque) — not pierceable, expected.`);
  if ((snap as any).dialog) {
    const d=(snap as any).dialog;
    lines.push(`DIALOG: ${d.type} — "${d.message}"${d.defaultValue?` (default: ${d.defaultValue})`:""} — auto-accepted, next snapshot will clear`);
  }
  lines.push("");
  lines.push(`=== PAGE TEXT (12k, ALL visible incl. offscreen) ${truncated ? `(page is ${len} chars, truncated)` : ""} ===`);
  lines.push(snap.text || "(no visible text)");
  if (truncated) lines.push(`\n[Text truncated: showing 0..${snap.text.length} of ${len}. Use browser_text with {query, offset, blockIndex} to fetch remaining content live.]`);
  lines.push("");
  lines.push("=== ELEMENT TABLE — ALL visible elements (onscreen + offscreen + shadow/iframe, open only) ===");
  lines.push("Format: [id] role  label  (kind)  [y=px onscreen?/frame? disabled? validation?] — offscreen/shadow/iframe are clickable");
  lines.push("FILL vs CLICK: kind=fill → browser_act {\"id\":\"eXX\",\"text\":\"value\"}  kind=click/select/file → browser_act {\"id\":\"eXX\"}");
  lines.push("Note: closed shadow DOM (mode:closed) cannot be pierced — 0 elements is expected for those variants.");
  if (!snap.actions || snap.actions.length === 0) lines.push("(no interactive elements visible)");
  else for (const a of snap.actions) {
    const role = String(a.role ?? a.kind ?? "unknown");
    const label = String(a.label ?? a.id ?? "");
    const kind = String(a.kind ?? "click");
    const val = a.value ? ` · "${String(a.value).slice(0, 60)}"` : "";
    const extra = a.current_value ? ` (now: ${a.current_value})` : "";
    const y = a.rect ? ` y=${a.rect.y}` : "";
    const vis = a.onscreen === false ? " offscreen" : a.onscreen === true ? " onscreen" : "";
    const frame = a.frame ? ` ${a.frame}` : "";
    const fillHint = kind === "fill" ? " ← FILL" : "";
    const disabled = a.disabled ? " disabled" : "";
    const vmsg = a.validationMessage ? ` validation:"${String(a.validationMessage).slice(0,60)}"` : "";
    lines.push(`[${a.id}] ${role.padEnd(10)} ${label.slice(0, 80)}${val}${extra} (${kind})${y}${vis}${frame}${fillHint}${disabled}${vmsg}`);
  }
  lines.push("");
  lines.push("=== GENERAL WORKFLOW (any site, any form, shadow/iframe) ===");
  lines.push('1) browser_launch → full snapshot (12k text + element table with y/frame + fill/disabled/validation). Offscreen/shadow/iframe (open) listed and clickable.');
  lines.push('2) Form fill: browser_act [{"id":"eXX","text":"value"}] for kind=fill; batch multiple fills in ONE call e.g. [{"id":"e3","text":"test@example.com"},{"id":"e5","text":"pass"}]');
  lines.push('   Click/select: browser_act [{"id":"eXX"}] (auto scrolls) → re-snapshot. Batch up to 3. File: browser_act [{"id":"eXX","text":"/path/file"}] (kind=file via DataTransfer).');
  lines.push('   Hover/transient: browser_hover {"id":"eXX"} then browser_wait {"timeout":800} for dropdown/1-sec loader.');
  lines.push('3) For expanded content: browser_extract {"target":"eXX"} + validationMessage per element if HTML5 invalid.');
  lines.push('4) For long-page/beyond-12k text: browser_text {"query":"<phrase>"} (case-insensitive) or {"offset":-5000} or {"blockIndex":10}');
  lines.push('Example: browser_act [{"id":"e5","text":"a@b.com"},{"id":"e7","text":"Secret123"},{"id":"e22"}] → submit. Dialogs auto-accepted and shown as DIALOG banner.');
  lines.push('Do not use fetch/web_search for live page content; do not loop scroll.');
  lines.push(`Fingerprint: ${snap.fingerprint}`);
  return lines.join("\n");
}
