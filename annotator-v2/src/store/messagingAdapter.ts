import type { Annotation } from './db';
import type { StorageAdapter, AnnotationFilter } from './adapter';
import type { ClientRequest, StorageResponse, InvalidationEvent } from './messageProtocol';
import { INVALIDATION_MSG } from './messageProtocol';

async function call<T = unknown>(req: ClientRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as StorageResponse<T>;
  if (!res) throw new Error('no response from service worker');
  if (!res.ok) throw new Error(res.error);
  return res.data as T;
}

/**
 * Best-effort match between a filter the subscriber cares about and
 * an affected hint broadcast by the SW. If hints don't match we just
 * re-fetch — the worst case is a redundant list().
 */
function filterOverlaps(sub: AnnotationFilter, affected?: AnnotationFilter): boolean {
  if (!affected) return true;
  if (sub.url && affected.url && sub.url !== affected.url) return false;
  if (sub.type && affected.type && sub.type !== affected.type) return false;
  return true;
}

export const messagingAdapter: StorageAdapter = {
  get: id => call<Annotation | undefined>({ kind: 'storage', op: 'get', id }),
  bulkGet: ids => call<(Annotation | undefined)[]>({ kind: 'storage', op: 'bulkGet', ids }).then(r => r ?? []),
  list: filter => call<Annotation[]>({ kind: 'storage', op: 'list', filter }).then(r => r ?? []),
  put: async ann => { await call({ kind: 'storage', op: 'put', ann }); },
  bulkPut: async list => { await call({ kind: 'storage', op: 'bulkPut', list }); },
  update: async (id, changes) => { await call({ kind: 'storage', op: 'update', id, changes }); },
  delete: async id => { await call({ kind: 'storage', op: 'delete', id }); },
  bulkDelete: async ids => { await call({ kind: 'storage', op: 'bulkDelete', ids }); },
  deleteWhere: filter => call<Annotation[]>({ kind: 'storage', op: 'deleteWhere', filter }).then(r => r ?? []),

  subscribe(filter, cb) {
    let active = true;

    const refresh = () => {
      if (!active) return;
      this.list(filter).then(list => { if (active) cb(list); }).catch(() => {});
    };

    const onMessage = (msg: unknown) => {
      const m = msg as InvalidationEvent;
      if (m?.type !== INVALIDATION_MSG) return;
      if (!filterOverlaps(filter, m.affected)) return;
      refresh();
    };

    chrome.runtime.onMessage.addListener(onMessage);
    refresh();

    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  },
};
