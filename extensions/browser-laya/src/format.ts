import type { Snapshot } from "./browser.js";

export const FORMAT_VERSION = "1.2.0";

export function formatSnapshot(snap: Snapshot, opts?: { compact?: boolean }): string {
  const compact = opts?.compact ?? snap.actions.length > 250;
  const len = snap.fullTextLength ?? snap.text.length;
  const truncated = len > snap.text.length;
  const lines: string[] = [];
  lines.push(`URL: ${snap.url}`);
  lines.push(`Title: ${snap.title}`);
  lines.push(
    `Viewport: ${snap.w}x${snap.h}  Scroll: ${snap.scroll.y}/${snap.scroll.height}  Elements: ${snap.actions.length} (omitted ${snap.omitted_actions})  Text: ${snap.text.length}/${len}${truncated ? " TRUNCATED" : ""}`
  );
  if ((snap as any).crossOriginSkipped) {
    const srcs = (snap as any).crossOriginSrcs as string[] | undefined;
    const srcHint = srcs?.length ? ` [${srcs.join(", ")}]` : "";
    lines.push(
      `Note: ${(snap as any).crossOriginSkipped} cross-origin iframe(s) skipped (CORS, opaque) — not pierceable, expected.${srcHint} — use browser_text for visible fallback.`
    );
  }
  if ((snap as any).closedShadowSkipped) {
    const tags = (snap as any).closedShadowTags as string[] | undefined;
    const tagHint = tags?.length ? ` tags: ${tags.join(", ")}` : "";
    lines.push(
      `Note: ${(snap as any).closedShadowSkipped} potential closed shadow root(s) skipped (mode:closed, opaque by spec) — not pierceable, expected.${tagHint} — try browser_text or accessibility fallback.`
    );
  }
  if ((snap as any).dedupedSkipped)
    lines.push(
      `Note: ${(snap as any).dedupedSkipped} duplicate menu item(s) collapsed (kept first 3 per label) — semantic dedup saved cap.`
    );
  if ((snap as any).dialog) {
    const d = (snap as any).dialog;
    lines.push(
      `DIALOG: ${d.type} — "${d.message}"${d.defaultValue ? ` (default: ${d.defaultValue})` : ""} — auto-accepted, next snapshot will clear`
    );
  }
  if ((snap as any).download) {
    const dl = (snap as any).download;
    lines.push(
      `DOWNLOAD: "${dl.filename}" from ${dl.url} → ${dl.path} — saved, use file path to verify`
    );
  }
  if ((snap as any).ariaFallback) {
    lines.push(
      `ARIA Fallback ( pierce failed, accessibility tree 3k): ${(snap as any).ariaFallback.slice(0, 3000)}`
    );
  }
  if ((snap as any).ranked) {
    const q = (snap as any).relevanceQuery;
    lines.push(
      `Ranked 12k: ${q ? `query="${q.slice(0, 80)}" TF-IDF+headings` : "heading/position ranked (50k→12k)"} — use browser_snapshot {query:"..."} to re-rank or browser_text for remainder`
    );
  }
  lines.push("");
  lines.push(
    `=== PAGE TEXT (12k ranked, ALL visible incl. offscreen) ${truncated ? `(page ${len} chars → ranked 12k)` : ""} ${
      (snap as any).ranked ? "[ranked]" : ""
    } ===`
  );
  lines.push(snap.text || "(no visible text)");
  if (truncated)
    lines.push(
      `\n[Text truncated: ${len} → ${snap.text.length} ranked 12k${(snap as any).relevanceQuery ? ` for "${(snap as any).relevanceQuery.slice(0, 40)}"` : ""}. Use browser_snapshot {query:"..."} to re-rank or browser_text {query}|{offset:-5000}|{blockIndex} — or browser_text {offset:0,limit:${len}} for joined view]`
    );
  lines.push("");
  lines.push(
    "=== ELEMENT TABLE — ALL visible elements (onscreen + offscreen + shadow/iframe, open only) ==="
  );
  lines.push(
    compact
      ? "Format: [id] role:label (kind) [y onscreen/frame] — compact (250+ els, labels 50ch) — offscreen/shadow clickable"
      : "Format: [id] role  label  (kind)  [y=px onscreen?/frame? disabled? checked? validation?] — offscreen/shadow/iframe are clickable — checkbox/radio show checked=true/false, toggle reflected on re-snapshot"
  );
  lines.push(
    'FILL vs CLICK: kind=fill → browser_act {"id":"eXX","text":"value"}  kind=click/select/file → browser_act {"id":"eXX"}'
  );
  lines.push(
    "Note: closed shadow DOM (mode:closed) cannot be pierced — counted as closedShadowSkipped if custom element present, 0 elements is expected."
  );
  if (!snap.actions || snap.actions.length === 0) lines.push("(no interactive elements visible)");
  else
    for (const a of snap.actions) {
      const role = String(a.role ?? a.kind ?? "unknown");
      const label = String(a.label ?? a.id ?? "");
      const kind = String(a.kind ?? "click");
      const val = a.value ? ` · "${String(a.value).slice(0, compact ? 40 : 60)}"` : "";
      const extra = a.current_value
        ? ` (now: ${String(a.current_value).slice(0, compact ? 30 : 60)})`
        : "";
      const y = a.rect ? ` y=${a.rect.y}` : "";
      const vis = a.onscreen === false ? " offscreen" : a.onscreen === true ? " onscreen" : "";
      const frame = a.frame ? ` ${a.frame}` : "";
      const fillHint = kind === "fill" ? " ← FILL" : "";
      const disabled = a.disabled ? " disabled" : "";
      const checked = a.checked !== undefined ? ` checked=${a.checked}` : "";
      const selected =
        (a as any).selected !== undefined && role !== "option"
          ? ` selected=${(a as any).selected}`
          : a.selected !== undefined && role === "option"
            ? ` selected=${a.selected}`
            : "";
      const expanded = (a as any).expanded !== undefined ? ` expanded=${(a as any).expanded}` : "";
      const combobox = (a as any).combobox
        ? ` combobox="${String((a as any).combobox).slice(0, compact ? 24 : 40)}"`
        : "";
      const vmsg = a.validationMessage
        ? ` validation:"${String(a.validationMessage).slice(0, compact ? 40 : 60)}"`
        : "";
      const labelSlice = compact ? 50 : 60;
      const roleStr = compact ? role : role.padEnd(10);
      lines.push(
        `[${a.id}] ${roleStr} ${label.slice(0, labelSlice)}${val}${extra} (${kind})${y}${vis}${frame}${fillHint}${disabled}${checked}${selected}${expanded}${combobox}${vmsg}`
      );
    }
  lines.push("");
  lines.push("=== GENERAL WORKFLOW (any site, any form, shadow/iframe) ===");
  lines.push(
    "1) browser_launch {url, query?} → ranked 12k (50k→best 12k, heading+TF-IDF if query) + element table with y/frame + fill/disabled/validation. Offscreen/shadow/iframe (open) listed and clickable."
  );
  lines.push(
    '2) Form fill: browser_act [{"id":"eXX","text":"value"}] for kind=fill; batch up to 5 fills in ONE call e.g. [{"id":"e3","text":"a@b.com"},{"id":"e5","text":"pass"},{"id":"e22"}] (fills+submit).'
  );
  lines.push(
    '   Click/select: browser_act [{"id":"eXX"}] (auto scrolls) → re-snapshot. Custom combobox: click combobox [aria-expanded] then click option [role=option → combobox="City"] (grouped, select). File: browser_act [{"id":"eXX","text":"/path/file"}].'
  );
  lines.push(
    '   Hover/transient: browser_hover {"id":"eXX"} then browser_wait {"timeout":800} for dropdown/1-sec loader.'
  );
  lines.push(
    '3) For expanded content: browser_extract {"target":"eXX"} + validationMessage if invalid.'
  );
  lines.push(
    '4) For long-page/beyond-12k: browser_snapshot {query:"pricing"} re-ranks 50k→12k OR browser_text {"query":"<phrase>"} | {"offset":-5000} | {"blockIndex":10} | {"offset":0,"limit":25000} joined view'
  );
  lines.push(
    'Example: browser_act [{"id":"e5","text":"a@b.com"},{"id":"e7","text":"Secret123"},{"id":"e22"}] → submit. Dialogs auto-accepted and shown as DIALOG banner.'
  );
  lines.push("Do not use fetch/web_search for live page content; do not loop scroll.");
  lines.push(
    `Fingerprint: ${snap.fingerprint}  Format: v${FORMAT_VERSION} ${compact ? "(compact)" : ""}`
  );
  return lines.join("\n");
}
