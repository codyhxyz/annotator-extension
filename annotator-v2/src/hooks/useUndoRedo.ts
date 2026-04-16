import { useEffect, useState, useCallback } from 'react';
import {
  pushAction, undo as undoKey, redo as redoKey,
  subscribe, canUndo as canUndoKey, canRedo as canRedoKey,
  type UndoAction,
} from '../store/undoStore';

export type { UndoAction };

/**
 * Hook over the module-scoped, per-page undo store.
 * Subscribes to the stack for `pageKey` and re-renders on change so
 * `canUndo`/`canRedo` actually track state.
 */
export default function useUndoRedo(pageKey: string) {
  const [, version] = useState(0);
  const rerender = useCallback(() => version(v => v + 1), []);

  useEffect(() => subscribe(pageKey, rerender), [pageKey, rerender]);

  const push = useCallback((action: UndoAction) => pushAction(pageKey, action), [pageKey]);
  const undo = useCallback(() => undoKey(pageKey), [pageKey]);
  const redo = useCallback(() => redoKey(pageKey), [pageKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let active: Element | null = document.activeElement;
      while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
      }
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta || e.key.toLowerCase() !== 'z') return;

      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    push,
    undo,
    redo,
    canUndo: canUndoKey(pageKey),
    canRedo: canRedoKey(pageKey),
  };
}
