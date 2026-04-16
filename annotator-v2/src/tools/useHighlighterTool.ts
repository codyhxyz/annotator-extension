import { useEffect } from "react";
import { db, getHighlightData } from "../store/db";
import { useLiveQuery } from "dexie-react-hooks";
import { serializeRange, deserializeRange, isInsideShadowDOM } from "../utils/rangeSerializer";
import { addAnnotation, deleteAnnotation } from "../store/undoable";
import { getPageContext } from "../utils/pageContext";
import type { UndoAction } from "../hooks/useUndoRedo";

interface Props {
  isActive: boolean;
  color: string;
  onUndoableAction?: (action: UndoAction) => void;
}

const HIGHLIGHT_ATTR = 'data-annotator-highlight-id';

export default function useHighlighterTool({ isActive, color, onUndoableAction }: Props) {
  const url = window.location.href;

  const highlights = useLiveQuery(
    () => db.annotations.where('[url+type]').equals([url, 'highlight']).toArray(),
    [url]
  );

  // ── Rendering: inject <mark> elements into real page DOM ──
  useEffect(() => {
    cleanupAllMarks();

    if (!highlights || highlights.length === 0) return;

    const resolved: { id: string; color: string; nodes: { node: Text; startOffset: number; endOffset: number }[] }[] = [];

    for (const hl of highlights) {
      try {
        const hlData = getHighlightData(hl);
        const range = deserializeRange(hlData.serializedRange);
        if (!range) continue;

        const walker = document.createTreeWalker(
          range.commonAncestorContainer,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) =>
              range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
          }
        );

        const nodes: { node: Text; startOffset: number; endOffset: number }[] = [];
        let n: Node | null;
        while ((n = walker.nextNode())) {
          const textNode = n as Text;
          let sOff = 0;
          let eOff = textNode.length;
          if (textNode === range.startContainer) sOff = range.startOffset;
          if (textNode === range.endContainer) eOff = range.endOffset;
          if (sOff < eOff) nodes.push({ node: textNode, startOffset: sOff, endOffset: eOff });
        }

        if (nodes.length > 0) resolved.push({ id: hl.id, color: hl.color, nodes });
      } catch {
        // XPath no longer valid — skip
      }
    }

    const ops: { node: Text; startOffset: number; endOffset: number; id: string; color: string }[] = [];
    for (const r of resolved) {
      for (const n of r.nodes) {
        ops.push({ ...n, id: r.id, color: r.color });
      }
    }

    ops.reverse();

    for (const { node: textNode, startOffset, endOffset, id, color: hlColor } of ops) {
      const parent = textNode.parentNode;
      if (!parent) continue;

      const fullText = textNode.textContent || '';
      if (startOffset >= fullText.length) continue;

      const mark = document.createElement('mark');
      mark.setAttribute(HIGHLIGHT_ATTR, id);
      mark.style.backgroundColor = hlColor;
      mark.style.color = 'inherit';
      mark.style.opacity = '0.5';
      mark.style.transition = 'opacity 0.2s';
      mark.style.cursor = 'pointer';
      mark.style.borderRadius = '2px';
      mark.style.padding = '0';
      mark.style.margin = '0';
      mark.textContent = fullText.substring(startOffset, endOffset);

      mark.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        deleteAnnotation(id).then((action) => {
          onUndoableAction?.(action);
        });
      });
      mark.addEventListener('mouseenter', () => { mark.style.opacity = '0.7'; });
      mark.addEventListener('mouseleave', () => { mark.style.opacity = '0.5'; });

      const frag = document.createDocumentFragment();
      if (startOffset > 0) {
        frag.appendChild(document.createTextNode(fullText.substring(0, startOffset)));
      }
      frag.appendChild(mark);
      if (endOffset < fullText.length) {
        frag.appendChild(document.createTextNode(fullText.substring(endOffset)));
      }

      parent.replaceChild(frag, textNode);
    }

    return () => cleanupAllMarks();
  }, [highlights, onUndoableAction]);

  // ── Selection capture: only when highlighter is the active tool ──
  useEffect(() => {
    if (!isActive) return;

    let didMouseDown = false;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isInsideShadowDOM(target)) return;
      if (target.hasAttribute?.(HIGHLIGHT_ATTR)) return;

      didMouseDown = true;

      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        if (!sel.isCollapsed) return;
        try {
          sel.modify('extend', 'forward', 'word');
          sel.modify('extend', 'backward', 'word');
          sel.collapseToStart();
          sel.modify('move', 'backward', 'word');
          sel.modify('extend', 'forward', 'word');
        } catch {
          // sel.modify not supported in some contexts
        }
      });
    };

    const onMouseUp = () => {
      if (!didMouseDown) return;
      didMouseDown = false;

      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);

        if (isInsideShadowDOM(range.startContainer) || isInsideShadowDOM(range.endContainer)) return;
        if ((range.startContainer.parentElement as HTMLElement)?.hasAttribute?.(HIGHLIGHT_ATTR)) return;

        try { expandRangeToWordBoundaries(range); } catch { /* ignore */ }

        const text = range.toString().trim();
        if (!text) return;

        const rangeRect = range.getBoundingClientRect();
        const highlightY = rangeRect.top + window.scrollY;
        const context = getPageContext(highlightY);

        serializeRange(range).then(serialized => {
          addAnnotation({
            id: crypto.randomUUID(),
            url,
            type: 'highlight',
            data: JSON.stringify({ serializedRange: serialized }),
            color,
            timestamp: Date.now(),
            ...context,
          }).then((action) => {
            onUndoableAction?.(action);
          });
        });

        sel.removeAllRanges();
      });
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isActive, color, url, onUndoableAction]);
}

function expandRangeToWordBoundaries(range: Range) {
  const wordChar = /[\w\u00C0-\u024F\u1E00-\u1EFF]/;

  const startNode = range.startContainer;
  let startOffset = range.startOffset;
  if (startNode.nodeType === Node.TEXT_NODE) {
    const text = startNode.textContent || '';
    while (startOffset > 0 && wordChar.test(text[startOffset - 1]!)) startOffset--;
    range.setStart(startNode, startOffset);
  }

  const endNode = range.endContainer;
  let endOffset = range.endOffset;
  if (endNode.nodeType === Node.TEXT_NODE) {
    const text = endNode.textContent || '';
    while (endOffset < text.length && wordChar.test(text[endOffset]!)) endOffset++;
    range.setEnd(endNode, endOffset);
  }
}

function cleanupAllMarks() {
  const marks = document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}
