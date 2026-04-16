import { useState, useEffect, useCallback, useRef } from 'react';
import { type Annotation, getStrokeData, getNoteData, getHighlightData } from './store/db';
import { storage } from './store/storage';
import CommandPalette from './components/CommandPalette';
import ContextualPanel from './components/ContextualPanel';
import OverlayCanvas from './components/OverlayCanvas';
import AnnotationCard from './components/AnnotationCard';
import useHighlighterTool from './tools/useHighlighterTool';
import SearchPanel from './components/SearchPanel';
import useUndoRedo from './hooks/useUndoRedo';
import { useAnnotations } from './hooks/useAnnotations';
import { addAnnotation, updateAnnotation } from './store/undoable';
import { getCursorForTool } from './utils/cursors';
import { getPageContext } from './utils/pageContext';
import { currentPageKey } from './utils/normalizeUrl';
import { watchAuthState, startAutoSync, stopAutoSync, connect, disconnect } from './sync';

type ToolWithColor = 'pen' | 'highlighter' | 'note';
const TOOLS_WITH_COLOR: ToolWithColor[] = ['pen', 'highlighter', 'note'];

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [selectedStroke, setSelectedStroke] = useState<Annotation | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [toolColors, setToolColors] = useState<Record<ToolWithColor, string>>({
    pen: '#ef4444',
    highlighter: '#fde047',
    note: '#fef08a',
  });
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [showSearch, setShowSearch] = useState(false);

  const url = currentPageKey();
  const { push } = useUndoRedo(url);

  useEffect(() => {
    if (!isActive) return;
    const unwatchAuth = watchAuthState((signedIn) => {
      if (signedIn) {
        startAutoSync();
        connect(url);
      } else {
        stopAutoSync();
        disconnect();
      }
    });
    return () => {
      unwatchAuth();
      stopAutoSync();
      disconnect();
    };
  }, [url, isActive]);

  const notes = useAnnotations({ url, type: 'note' });
  const strokes = useAnnotations({ url, type: 'stroke' });

  useHighlighterTool({
    isActive: isActive && activeTool === 'highlighter',
    color: toolColors.highlighter,
    onUndoableAction: push,
  });

  const toggle = useCallback(() => {
    setIsActive((prev) => !prev);
  }, []);

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

      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        toggle();
        return;
      }

      if (isActive) {
        switch (e.key) {
          case 'd': setActiveTool('pen'); break;
          case 'h': setActiveTool('highlighter'); break;
          case 'n': setActiveTool('note'); break;
          case 'e': setActiveTool('eraser'); break;
          case 'v':
          case 'p': setActiveTool('pointer'); break;
          case 'Escape': setActiveTool(null); break;
          default: return;
        }
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, isActive]);

  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener('annotator-toggle', handler);
    return () => window.removeEventListener('annotator-toggle', handler);
  }, [toggle]);

  // ann:// scroll-to-annotation handler
  useEffect(() => {
    const handler = async (e: Event) => {
      const { annotationId } = (e as CustomEvent).detail;
      if (!annotationId) return;

      const ann = await storage.get(annotationId);
      if (!ann) return;

      if (ann.type === 'note') {
        const data = getNoteData(ann);
        window.scrollTo({ top: data.y - 100, behavior: 'smooth' });
        return;
      }

      if (ann.type === 'highlight') {
        const { deserializeRange } = await import('./utils/rangeSerializer');
        const data = getHighlightData(ann);
        const range = deserializeRange(data.serializedRange);
        if (range) {
          const rect = range.getBoundingClientRect();
          window.scrollTo({ top: rect.top + window.scrollY - 100, behavior: 'smooth' });

          // Flash the highlight mark if it exists
          const mark = document.querySelector(`[data-annotator-highlight-id="${annotationId}"]`);
          if (mark) {
            (mark as HTMLElement).style.outline = '2px solid #3b82f6';
            setTimeout(() => { (mark as HTMLElement).style.outline = ''; }, 2000);
          }
        }
        return;
      }

      if (ann.type === 'stroke') {
        const data = getStrokeData(ann);
        if (data.points?.length > 0) {
          const minY = Math.min(...data.points.map((p: { y: number }) => p.y));
          window.scrollTo({ top: minY - 100, behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('annotator-scroll-to', handler);
    return () => window.removeEventListener('annotator-scroll-to', handler);
  }, []);

  const handleContainerClick = async (e: React.MouseEvent) => {
    if (!isActive) return;

    if (activeTool === 'note') {
      const noteY = e.clientY + window.scrollY;
      const context = getPageContext(noteY);
      const action = await addAnnotation({
        id: crypto.randomUUID(),
        url,
        type: 'note',
        data: JSON.stringify({ text: '', x: e.clientX + window.scrollX, y: noteY, width: 250, height: 120 }),
        color: toolColors.note,
        timestamp: Date.now(),
        ...context,
      });
      push(action);
      setActiveTool('pointer');
      return;
    }

    if (activeTool === 'pointer') {
      const clickX = e.clientX + window.scrollX;
      const clickY = e.clientY + window.scrollY;
      const hitRadius = 10;

      if (strokes) {
        for (const ann of strokes) {
          const stroke = getStrokeData(ann);
          for (const pt of stroke.points) {
            const dx = pt.x - clickX;
            const dy = pt.y - clickY;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
              setSelectedStroke(ann);
              dragStartRef.current = { x: clickX, y: clickY };
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const p of stroke.points) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
              }
              const pad = 8;
              setSelectionBox({ x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 });
              return;
            }
          }
        }
      }
      setSelectedStroke(null);
      setSelectionBox(null);
    }
  };

  const handleContainerMouseUp = async (e: React.MouseEvent) => {
    if (activeTool !== 'pointer' || !selectedStroke || !dragStartRef.current) return;

    const endX = e.clientX + window.scrollX;
    const endY = e.clientY + window.scrollY;
    const dx = endX - dragStartRef.current.x;
    const dy = endY - dragStartRef.current.y;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      const oldData = getStrokeData(selectedStroke);
      const newPoints = oldData.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      const newData = JSON.stringify({ ...oldData, points: newPoints });
      const action = await updateAnnotation(selectedStroke.id, { data: newData });
      push(action);
      if (selectionBox) {
        setSelectionBox({ ...selectionBox, x: selectionBox.x + dx, y: selectionBox.y + dy });
      }
    }

    dragStartRef.current = null;
  };

  const setColorForTool = (tool: ToolWithColor, color: string) => {
    setToolColors((prev) => ({ ...prev, [tool]: color }));
  };

  const containerPointerEvents =
    isActive && activeTool === 'note'
      ? 'pointer-events-auto'
      : 'pointer-events-none';

  const cursorOptions = activeTool ? { color: toolColors[activeTool as ToolWithColor] } : undefined;
  const containerCursor = isActive && activeTool ? getCursorForTool(activeTool, cursorOptions) : 'default';

  useEffect(() => {
    if (!isActive || !activeTool) {
      document.documentElement.style.cursor = '';
      return;
    }
    document.documentElement.style.cursor = getCursorForTool(activeTool, cursorOptions);
    return () => { document.documentElement.style.cursor = ''; };
  }, [isActive, activeTool, cursorOptions]);

  const showContextualPanel = isActive && activeTool && TOOLS_WITH_COLOR.includes(activeTool as ToolWithColor);

  return (
    <div
      className={`relative w-full h-full ${containerPointerEvents}`}
      style={{ cursor: containerCursor }}
      onClick={handleContainerClick}
      onMouseUp={handleContainerMouseUp}
      onWheel={(e) => { window.scrollBy(e.deltaX, e.deltaY); }}
    >
      <OverlayCanvas
        isActive={isActive}
        activeTool={activeTool}
        penColor={toolColors.pen}
        penStrokeWidth={strokeWidth}
        onUndoableAction={push}
      />

      {isActive && selectionBox && (
        <div
          style={{
            position: 'absolute',
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.w,
            height: selectionBox.h,
            border: '2px dashed #3b82f6',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      {isActive && notes?.map((ann) => (
        <AnnotationCard key={ann.id} annotation={ann} onUndoableAction={push} />
      ))}

      {showContextualPanel && (
        <ContextualPanel
          activeTool={activeTool!}
          color={toolColors[activeTool as ToolWithColor]}
          onColorChange={(c) => setColorForTool(activeTool as ToolWithColor, c)}
          strokeWidth={strokeWidth}
          onStrokeWidthChange={setStrokeWidth}
        />
      )}

      {isActive && (
        <CommandPalette
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          onClose={() => setIsActive(false)}
          onUndoableAction={push}
          onSearchOpen={() => setShowSearch(true)}
        />
      )}

      {showSearch && (
        <SearchPanel onClose={() => setShowSearch(false)} />
      )}

    </div>
  );
}
