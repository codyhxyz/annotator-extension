/**
 * Handoff: on page load, drain the localhost pending-notes queue for the
 * current URL and materialize each pending note as a real annotation
 * with viewport-resolved x/y coordinates.
 *
 * - Positioning: horizontally centered in the viewport, vertically ~140px
 *   below the current scroll top (always visible at first paint).
 * - Goes through the normal `addAnnotation` path so Dexie, sync, and
 *   invalidation broadcasts are handled uniformly.
 * - Deletes each drained entry from the queue so it does not re-create
 *   on reload.
 */

import { addAnnotation } from '../store/undoable';
import { getPageContext } from '../utils/pageContext';
import type { HandoffResponse } from '../store/messageProtocol';

const NOTE_WIDTH = 250;
const NOTE_HEIGHT = 120;
const VERTICAL_OFFSET = 140;
const HANDOFF_COLOR = '#c7d2fe';
const HANDOFF_TAG = 'claude-task';

export async function drainPendingNotes(pageKey: string): Promise<number> {
  const url = window.location.href;
  const resp = await chrome.runtime.sendMessage({ kind: 'handoff.check', url }) as HandoffResponse;
  if (!resp || !resp.ok || resp.notes.length === 0) return 0;

  const viewportW = document.documentElement.clientWidth;
  const scrollY = window.scrollY;

  let created = 0;
  for (const note of resp.notes) {
    const y = scrollY + VERTICAL_OFFSET;
    const ctx = getPageContext(y);
    await addAnnotation({
      id: crypto.randomUUID(),
      url: pageKey,
      type: 'note',
      data: JSON.stringify({
        text: note.text,
        x: Math.max(0, Math.floor(viewportW / 2 - NOTE_WIDTH / 2)),
        y,
        width: NOTE_WIDTH,
        height: NOTE_HEIGHT,
      }),
      color: note.color ?? HANDOFF_COLOR,
      timestamp: Date.now(),
      tags: note.tags ?? [HANDOFF_TAG],
      ...ctx,
    });
    deletePendingQuietly(note.id);
    created++;
  }
  return created;
}

function deletePendingQuietly(id: string): void {
  fetch(`http://localhost:7717/pending-notes/${id}`, { method: 'DELETE' }).catch(() => {});
}
