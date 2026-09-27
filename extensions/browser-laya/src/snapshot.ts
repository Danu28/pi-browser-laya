/**
 * snapshot.ts — typed source-of-truth for atomic snapshot IIFE
 *
 * Runtime injection still uses `snapshot.js` (plain JS, page context cannot import TS).
 * This file provides `PageSnapshot` / `SnapshotAction` types for `browser.ts` / `format.ts`
 * and is type-checked by `tsc`. Keep `snapshot.js` and this file in sync:
 *   npm run build:snapshot  — copies snapshot.js → snapshot.ts template (preserves types)
 *
 * The IIFE itself lives in snapshot.js (519 lines, JS). This file documents its contract
 * and allows `vitest` / `tsc` to validate consumers without executing page JS.
 */

export type SnapshotAction = {
  node: number;
  role: string;
  label: string;
  kind: "fill" | "select" | "file" | "click" | "scroll" | "wait";
  rect?: { x: number; y: number; w: number; h: number };
  onscreen?: boolean;
  frame?: string;
  disabled?: string;
  value?: string;
  current_value?: string;
  checked?: string;
  selected?: string;
  expanded?: string;
  combobox?: string;
  validationMessage?: string;
  id?: string;
  delta?: number;
};

export type PageSnapshot = {
  url: string;
  title: string;
  w: number;
  h: number;
  text: string;
  fullTextLength: number;
  crossOriginSkipped: number;
  closedShadowSkipped: number;
  closedShadowTags: string[];
  crossOriginSrcs: string[];
  dedupedSkipped: number;
  ariaFallback?: string | null;
  scroll: { y: number; height: number };
  actions: SnapshotAction[];
  marker: unknown[];
  page_key: unknown[];
  guards: Record<string, unknown>;
  omitted_actions: number;
  ranked: boolean;
  relevanceQuery: string;
  fingerprint: string;
  dialog?: { type: string; message: string; defaultValue?: string } | null;
  download?: { filename: string; url: string; path: string } | null;
};

// Re-export runtime source path for documentation; actual injection uses snapshot.js via readFile.
export const SNAPSHOT_SOURCE_PATH = "./snapshot.js" as const;
export const SNAPSHOT_TYPED_VERSION = "1.3.0" as const;
