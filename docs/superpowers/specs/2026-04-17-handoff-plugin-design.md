# Handoff — Claude-to-browser page-context notes

**Status:** design approved, not yet implemented
**Date:** 2026-04-17
**Depends on:** Web Annotator extension (this repo), `ann` CLI (`cli/`)

## Problem

When Claude Code opens a browser page for the user, the user loses the thread between the terminal and the browser. They arrive on a page and sometimes forget *why* Claude sent them there. We want Claude to leave a short task-context note on the page — a persistent sticky note, horizontally centered near the top of the viewport, reminding the user what they're supposed to do.

The solution must be:
- **Agent-agnostic** — a plugin for Claude Code today, but the underlying mechanism (localhost HTTP → extension) is usable by any tool.
- **Zero-ceremony** — no persistent browser tabs, no native-messaging install, no new Chrome permissions.
- **Graceful when off** — if the bridge daemon isn't running, the extension behaves normally; no user-visible errors.

## High-level architecture

Three components across two repos:

1. **`handoff` Claude Code plugin** (new, separate git repo — plugins distribute independently of the extension) — a PreToolUse hook on URL-opening Bash/WebFetch calls, plus a companion skill teaching Claude a `TASK:` preamble convention.
2. **`ann serve` localhost queue** (this repo, `cli/src/server.ts`) — extended with a pending-notes queue: `POST /pending-notes`, `GET /pending-notes?url=…`, `DELETE /pending-notes/:id`. In-memory, TTL-bounded.
3. **Extension pull-on-page-load** (this repo, `annotator-v2/`) — on every page load, the content script asks the SW to drain any pending notes for the current URL. SW fetches localhost, creates each returned note via existing `swStorage.put`, broadcasts invalidation so the content script renders.

No persistent tab. No native-messaging host. No new Chrome permissions. The extension's `host_permissions: <all_urls>` already covers the SW's localhost fetch.

## Data flow

```
Claude writes: "I'll open the PR for you to review."
Claude emits: Bash { command: "open https://github.com/foo/bar/pull/42" }
  │
  ▼ PreToolUse hook fires (matcher: Bash|WebFetch, if: Bash(open *)|Bash(xdg-open *)|Bash(start *))
hook reads $transcript_path, greps for tool_use_id, walks backward in that
  assistant turn's content array to find the preceding text block
hook extracts note text:
  grep the preceding text for /^TASK:\s*(.+)$/m — if found, use it; if not, skip (no note).
  No heuristics, no LLM fallback. The skill teaches Claude the convention; when Claude
  follows it, the note is exactly what Claude wrote. When Claude doesn't, nothing happens
  and the user can trivially see why (no TASK: line in the transcript).
  │
  ▼ hook POST http://localhost:7717/pending-notes
     { url, text, sessionId, parentMessageId }
     (dedupe sibling URL opens via /tmp/handoff-hook-<sessionId>-<parentMessageId>)
  │
  ▼ (hook returns 0; Bash proceeds; browser opens URL)

Content script loads on target URL
  │
  ▼ content script sends { kind: "pending.check", url: location.href }
SW handler: proxies fetch("http://localhost:7717/pending-notes?url=<canonicalized>")
            returns { ok: true, notes: PendingNote[] }  — does NOT write annotations
  │
  ▼ content script, now holding the pending notes and its own viewport:
     for each note:
       build Annotation {
         data: { text, x: clientWidth/2 - 125, y: scrollY + 140, width: 250, height: 120 },
         color: "#c7d2fe",
         tags: ["claude-task"],
         ...getPageContext(y)
       }
       call addAnnotation(annotation)        // existing path → SW → Dexie → broadcast
       fetch DELETE /pending-notes/:id       // prevent re-drain on reload
  │
  ▼ SW broadcasts invalidation → all renderers re-fetch → note renders
```

**Positioning resolution** happens in the content script at drain time, not in the hook. The hook doesn't know viewport dimensions; the content script does.

## Component details

### 1. `handoff` plugin

Files:
```
handoff/
  plugin.json                          — plugin manifest
  hooks/hooks.json                     — registers PreToolUse hook
  scripts/url-hook.ts                  — hook entrypoint
  scripts/transcript.ts                — reverse-scan JSONL by tool_use_id
  scripts/extract-text.ts              — TASK: regex → preceding text heuristic
  scripts/post-to-bridge.ts            — POST to localhost:7717, spawn ann serve if down
  skills/handoff/SKILL.md              — teaches Claude the TASK: preamble convention
  README.md                            — install: extension dependency + `ann serve` daemon
```

**Hook config** (`hooks/hooks.json`):
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|WebFetch",
      "if": "Bash(open *)|Bash(xdg-open *)|Bash(start *)|WebFetch(*)",
      "command": "node ${PLUGIN_DIR}/scripts/url-hook.js"
    }]
  }
}
```

**Companion skill** (`skills/handoff/SKILL.md`) — frontmatter with a `description` that triggers whenever Claude is about to send the user to a URL for an action. Body teaches:
> Before opening a URL for the user, write a line in the format `TASK: <one-sentence description of what they should do on this page>` in your assistant text. The Handoff plugin's hook reads this line and places it as a sticky note on the page so the user is oriented on arrival.

**Re-entry guard**: hook sets `HANDOFF_HOOK_ACTIVE=1` before any `claude -p` call (not in v0, but future-proof) and early-exits if it sees that var on entry.

### 2. `ann serve` queue extension

In `cli/src/server.ts`, add:

```ts
type PendingNote = {
  id: string;        // server-assigned
  url: string;       // canonicalized
  text: string;
  color?: string;
  tags?: string[];
  createdAt: number;
};

const pendingNotes = new Map<string, PendingNote>();  // LRU, capped at 1000 entries

// POST /pending-notes → { id }
// GET  /pending-notes?url=... → { notes: PendingNote[] }  // filters by URL match
// DELETE /pending-notes/:id → 204
```

**No time-based expiry.** Entries live until drained (DELETE after the content script creates the annotation) or until LRU-evicted when the queue exceeds 1000 entries. Zombie entries from redirects or URLs the user never visits age out naturally as new activity arrives. No user-facing timeout: if Claude queues a note at 9am and the user opens the tab at 5pm, the note still shows.

URL matching: canonicalize by lowercasing scheme/host, stripping trailing slash from pathname, and ignoring fragment. Keep query string verbatim (fragments and tracking params are common; we don't want to over-normalize and return wrong notes).

### 3. Extension pull-on-page-load

**New message** in `annotator-v2/src/store/messageProtocol.ts`:
```ts
| { kind: "pending.check"; url: string }
```

**SW handler** in `annotator-v2/src/background.ts` — purely a proxy; the SW never writes annotations on the plugin's behalf, so viewport-dependent logic stays in the content script:
```ts
if ('kind' in req && req.kind === 'pending.check') {
  handlePendingCheck(req.url).then(sendResponse).catch(err => sendResponse({ ok: false, error: String(err) }));
  return true;
}

async function handlePendingCheck(url: string): Promise<{ ok: true; notes: PendingNote[] }> {
  try {
    const r = await fetch(`http://localhost:7717/pending-notes?url=${encodeURIComponent(url)}`);
    if (!r.ok) return { ok: true, notes: [] };
    return { ok: true, notes: (await r.json()).notes };
  } catch {
    return { ok: true, notes: [] };  // bridge down — graceful no-op
  }
}
```

**Content-script wakeup** — in `annotator-v2/src/content.tsx` (or the equivalent page-load bootstrap), after the overlay mounts: send one `pending.check` message. For each returned note, the content script builds the `Annotation` with viewport-resolved `x`/`y`, calls the existing `addAnnotation` path (which round-trips through the SW / `swStorage.put` / invalidation broadcast), then `fetch DELETE /pending-notes/:id` so it won't re-drain on reload.

This keeps the SW dumb (just a localhost proxy), keeps positioning logic close to the viewport that owns the measurement, and reuses the existing annotation-write plumbing exactly.

## Edge cases

| Case | Behavior |
|------|----------|
| `ann serve` not running | `fetch` fails silently; zero notes created. Plugin's hook logs a one-liner. |
| URL is `file://`, `chrome://`, `about:` | Extension content script doesn't run there. No note. Fine. |
| Redirect: hook queues A, user lands on B | No match; entry stays until LRU-evicted. Acceptable — zombie entries cost nothing and age out under load. |
| Trailing slash / fragment mismatch | Canonicalizer handles. |
| Multi-URL in same assistant turn | Dedupe file `/tmp/handoff-<session>-<parentMsgId>` ensures all siblings reuse the one extracted `TASK:` text. |
| User refreshes page | Note already in Dexie; queue entry deleted on first drain; no duplicate. |
| User runs `open URL` themselves in a Bash tool call (not Claude-intent) | Hook fires, but the preceding assistant text won't contain a `TASK:` line, so no note is queued. Naturally handled by the TASK-only rule. |
| Subagent opens URL | `isSidechain:true` in transcript. Hook still works via `tool_use_id` linkage; reads the subagent's JSONL. |
| `pending.check` race with extension boot | Content script retries once on SW-not-ready error. |
| `ann serve` already bound by another process on :7717 | Hook logs conflict, skips POST. Plugin install docs note the port. |

## Non-goals

- Any LLM or heuristic fallback for note text. `TASK:` preamble or nothing. Keeps the feature deterministic and auditable — when a note is missing, the user sees immediately that Claude didn't write a TASK line.
- Bidirectional Claude-watches-note updates — use the extension's regular `annotator:list` polling; real-time `subscribe` is deferred at the extension level.
- Cross-device sync for pending notes — queue is machine-local.
- Desktop-notification fallback when the extension is uninstalled — the plugin silently no-ops.
- Auto-installing `ann serve` as a launchd/systemd daemon — plugin spawns detached on first hook fire; persistence across reboots is a README instruction.
- Time-based queue expiry — LRU-only.

## Success criteria

- Claude opens a URL → note appears on that page, centered near the top of the viewport, within one paint frame of page load.
- Text of the note is either Claude's explicit `TASK: …` line (when skill loaded) or the preceding assistant sentence (heuristic).
- No user-visible error if `ann serve` isn't running; extension works normally.
- No persistent browser tab required.
- No new Chrome permissions beyond what's already in the manifest.
- Works identically when invoked via `curl -X POST http://localhost:7717/pending-notes -d '…'` — proves composability.
- Strict TS clean, no `any`.
- Feed and search show Claude-task notes tagged `["claude-task"]` so the user can filter them out or review in bulk.

## Roadmap positioning

This feature advances three items on the project's priority stack:

- **#8 CLI companion (`ann`)** — the existing `ann serve` is now a real bridge, not an isolated JSONL store.
- **#9 Local HTTP API (localhost bridge)** — the `/pending-notes` queue is a canonical example of the bridge's value; any tool can POST.
- **#10 MCP server (future)** — a thin MCP wrapper around `POST /pending-notes` becomes trivial once this ships.

## Implementation order (plan sketch — for the writing-plans step)

1. `ann serve` `/pending-notes` POST/GET/DELETE with LRU cap + tests.
2. Extension: `pending.check` message + SW proxy handler + content-script wakeup + viewport-resolved note creation.
3. End-to-end manual test: `curl` → extension drops note on load.
4. `handoff` plugin: hook script + transcript reverse-scan + `TASK:` regex + dedupe file.
5. `handoff` skill: `TASK:` preamble convention.
6. Plugin README + install verification on a clean machine.
7. Dogfood. Adjust color/positioning/plugin name based on real usage.
