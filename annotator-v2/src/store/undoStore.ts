/**
 * Module-scoped, per-page undo/redo.
 *
 * An undo stack is bound to a page key (normalized URL). Two tabs on the
 * same page share a stack via the in-memory store; cross-page undo is
 * impossible by construction — undoing on page A never rolls back an
 * action committed on page B.
 */

export interface UndoAction {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface Stack {
  undo: UndoAction[];
  redo: UndoAction[];
}

const MAX_STACK_SIZE = 50;
const stacks = new Map<string, Stack>();
const listeners = new Map<string, Set<() => void>>();

function getStack(key: string): Stack {
  let s = stacks.get(key);
  if (!s) {
    s = { undo: [], redo: [] };
    stacks.set(key, s);
  }
  return s;
}

function notify(key: string) {
  listeners.get(key)?.forEach(l => l());
}

export function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(key);
  };
}

export function pushAction(key: string, action: UndoAction) {
  const s = getStack(key);
  s.undo.push(action);
  if (s.undo.length > MAX_STACK_SIZE) s.undo.shift();
  s.redo.length = 0;
  notify(key);
}

export async function undo(key: string) {
  const s = getStack(key);
  const action = s.undo.pop();
  if (!action) return;
  await action.undo();
  s.redo.push(action);
  notify(key);
}

export async function redo(key: string) {
  const s = getStack(key);
  const action = s.redo.pop();
  if (!action) return;
  await action.redo();
  s.undo.push(action);
  if (s.undo.length > MAX_STACK_SIZE) s.undo.shift();
  notify(key);
}

export function canUndo(key: string): boolean {
  return getStack(key).undo.length > 0;
}

export function canRedo(key: string): boolean {
  return getStack(key).redo.length > 0;
}
