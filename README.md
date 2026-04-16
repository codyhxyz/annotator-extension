# Web Annotator

A persistent interaction layer for the web. Draw, highlight, and leave notes on any webpage — your annotations stay with the page.

## Overview

Web Annotator is a Chrome extension that gives you a personal overlay on every webpage. Toggle it with backtick (`` ` ``), pick a tool, and start annotating. Everything is stored locally in your browser — no account required.

### Tools

- **Pen** (`d`) — Freehand drawing on any page
- **Highlighter** (`h`) — Select and highlight text with word-boundary snapping
- **Note** (`n`) — Draggable, resizable sticky notes
- **Eraser** (`e`) — Remove strokes by proximity
- **Pointer** (`v`) — Select and drag strokes

### Features

- Annotations persist per-URL in IndexedDB (via Dexie)
- Undo/redo (`Cmd+Z` / `Cmd+Shift+Z`)
- Export to Markdown, JSONL, or W3C Web Annotation format
- Import from Readwise, Kindle, and Hypothesis
- Full-text search across all annotations
- Optional cloud sync and realtime collaboration via Cloudflare Workers

## Project Structure

```
annotator-v2/    Chrome extension (React + Vite + Dexie)
backend/         Cloudflare Workers sync API (Hono + D1 + Durable Objects)
cli/             Local CLI companion (better-sqlite3)
old_extension/   Deprecated v1 (archived, not maintained)
```

## Getting Started

### Extension (local-only mode)

The extension works fully offline with no backend or account. Annotations are stored in IndexedDB.

```bash
cd annotator-v2
pnpm install
pnpm dev
```

Load the `dist/` directory as an unpacked extension at `chrome://extensions` (enable Developer Mode).

### With Cloud Sync (optional)

Cloud sync requires a [Cloudflare Workers](https://workers.cloudflare.com/) backend and [Clerk](https://clerk.com/) authentication. This is entirely optional — the extension is fully functional without it.

1. **Backend:**
   ```bash
   cd backend
   pnpm install
   ```
   Create a D1 database and KV namespace in your Cloudflare dashboard, then update `wrangler.toml` with your resource IDs.
   ```bash
   pnpm run db:migrate:local
   pnpm dev
   ```

2. **Clerk:** Create a Clerk application configured for Chrome extension auth. Set `CLERK_SECRET_KEY` as a Cloudflare secret (`wrangler secret put CLERK_SECRET_KEY`).

3. **Extension env:**
   ```bash
   cd annotator-v2
   cp .env.example .env
   # Set VITE_API_URL to your backend URL
   # Set VITE_CLERK_PUBLISHABLE_KEY to your Clerk key
   pnpm dev
   ```

### CLI Companion

The `ann` CLI provides local annotation management via SQLite, independent of the browser extension.

```bash
cd cli
pnpm install
pnpm build
node bin/ann.js --help
```

`ann serve` starts a local HTTP API on port 7717 for integration with Raycast, Alfred, shell scripts, and other tools.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `` ` `` | Toggle overlay |
| `d` | Pen tool |
| `h` | Highlighter |
| `n` | Note tool |
| `e` | Eraser |
| `v` / `p` | Pointer |
| `Esc` | Deselect tool |
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |

## Architecture

The extension injects a content script into every page, mounting a React app inside a Shadow DOM to avoid CSS conflicts with the host page. Each tool is a self-contained hook (`usePenTool`, `useHighlighterTool`, `useEraserTool`).

**Storage:** Annotations use a unified Dexie (IndexedDB) table with typed `data` payloads per annotation type (stroke, highlight, note). Highlights are anchored using W3C TextQuoteSelector + TextPositionSelector for resilient reanchoring when page content changes.

**Sync (optional):** Cursor-based bidirectional sync with last-write-wins conflict resolution. Realtime presence and live annotation broadcasts use Cloudflare Durable Objects for per-page WebSocket rooms.

## Data Formats

Annotations can be exported as:

- **Markdown** — Human-readable with YAML frontmatter, grouped by page
- **JSONL** — Full-fidelity round-trip format with LWW merge on import
- **W3C Web Annotation** — Standards-compliant JSON-LD

## License

[ISC](LICENSE)
