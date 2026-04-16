# Known Limitations

## Per-host IndexedDB (cross-origin storage split)

**Status:** open. Tracked for the next refactor.

In MV3, content scripts run in the host page's storage context. Opening
`new Dexie('WebAnnotatorDB')` from a content script creates a separate
IndexedDB database *per origin*: the DB on `https://news.ycombinator.com`
is not the same DB as the one on `https://example.com`. The extension's
Feed page and Auth page, which run in the extension origin, see yet
another DB.

### User-visible effects

- The Feed / "All Annotations" view misses most annotations because it
  lives in the extension origin, not the host origin where the
  annotations were written.
- "Search all annotations" only searches the current site's DB.
- Exports are per-host.
- Sync uploads per-host, so cloud state *is* unified, but the local
  view is not.

### The fix

A Chrome *offscreen document* owns a single Dexie instance in the
extension origin. Content scripts, Feed, Auth, and the background SW
all talk to the offscreen document via `chrome.runtime.sendMessage`:

```
content script / feed / bg  ──sendMessage──▶  offscreen document
                                                (owns unified Dexie)
```

The existing `StorageAdapter` abstraction (`store/adapter.ts`) is the
seam: swap `dexieAdapter` for a `messagingAdapter` that proxies to the
offscreen document. Tools do not change.

Sync moves with the DB — it runs inside the offscreen document and is
triggered by `chrome.alarms` firing in the background SW.

### Why not fixed in this pass

It's a multi-hour rewrite with careful lifecycle work (offscreen
documents have their own creation / teardown rules) and needs browser
testing. Queued as a dedicated phase.

### Workaround today

Sync with the Cloudflare backend and use the server's `/annotations`
endpoints as the unified source of truth for aggregate views.
