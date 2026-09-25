# InstantInk 4th FAQ — 3 Turn Trace (Target)

**Goal:** `launch https://instantink.hpconnected.com/us/en/l/v2 headed, wait till load, get 4th FAQ details`

## Turn 1 — browser_launch

Input: `{url:"https://instantink.hpconnected.com/us/en/l/v2", headed:true}`
Output snapshot (compressed):

```
URL: https://instantink.hpconnected.com/us/en/l/v2
Title: HP Instant Ink
=== VISIBLE TEXT ===
HP Instant Ink ... FAQ
1. What is HP Instant Ink?
2. How does it work?
3. What plans are available?
4. What if I cancel or change my plan?   <-- 4th FAQ, collapsed
...
=== ELEMENT TABLE ===
[e38] button  What is HP Instant Ink? (click)
[e39] button  How does it work? (click)
[e40] button  What plans are available? (click)
[e42] button  What if I cancel or change my plan? (click)  <-- target
...
```

## Turn 2 — browser_act (single batch)

LLM plan JSON (laya typed decision — op+target one call):

```json
{ "actions": [{ "id": "e42" }] }
```

Tool executes: `click e42` with freshness/visibility/occlusion guard → wait 120ms → auto re-observe.
Output snapshot now shows `e42` expanded, guards[42].scope contains answer.

## Turn 3 — browser_extract

Input: `{"target":"e42"}`
Output:

```
EXTRACT e42 (What if I cancel...)
--- scope ---
What if I cancel or change my plan?
You can cancel anytime from your account. If you cancel, ... [full answer]
```

## Done — 3 LLM calls total

No 16-step loop. No extra snapshots. Batch + atomic observe is the compression.
