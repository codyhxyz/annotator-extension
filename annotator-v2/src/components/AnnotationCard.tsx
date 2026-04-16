import { useState, useEffect, useRef, useCallback } from 'react';
import { db, type Annotation, type PrivacyLevel, getNoteData } from '../store/db';
import { deleteAnnotation, updateAnnotation } from '../store/undoable';
import { Pin, PinOff } from 'lucide-react';
import PrivacyToggle from './PrivacyToggle';
import type { UndoAction } from '../hooks/useUndoRedo';

interface Props {
  annotation: Annotation;
  onUndoableAction?: (action: UndoAction) => void;
}

const MIN_WIDTH = 180;
const MIN_HEIGHT = 80;
const MAX_AUTO_HEIGHT = 400;

export default function AnnotationCard({ annotation, onUndoableAction }: Props) {
  const noteData = getNoteData(annotation);
  const [text, setText] = useState(noteData.text);
  const [position, setPosition] = useState({ x: noteData.x, y: noteData.y });
  const [size, setSize] = useState({ width: noteData.width || 250, height: noteData.height || 120 });
  const [isFocused, setIsFocused] = useState(false);
  const [pinned, setPinned] = useState(!!noteData.pinned);
  const [privacy, setPrivacy] = useState<PrivacyLevel>(annotation.privacy || 'private');
  const textOnFocusRef = useRef(noteData.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [userResized, setUserResized] = useState(false);

  const updateData = useCallback((patch: Record<string, unknown>) => {
    const current = getNoteData(annotation);
    const updated = { ...current, ...patch };
    db.annotations.update(annotation.id, { data: JSON.stringify(updated), syncStatus: 'pending', updatedAt: Math.floor(Date.now() / 1000) });
  }, [annotation]);

  useEffect(() => {
    if (userResized) return;
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = '0px';
    const contentHeight = el.scrollHeight;
    el.style.height = '';

    const totalHeight = Math.max(MIN_HEIGHT, Math.min(contentHeight + 16 + 24, MAX_AUTO_HEIGHT));
    if (Math.abs(totalHeight - size.height) > 4) {
      setSize(prev => ({ ...prev, height: totalHeight }));
      updateData({ height: totalHeight });
    }
  }, [text, userResized, annotation.id, updateData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== noteData.text) {
        updateData({ text });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [text, annotation.id, noteData.text, updateData]);

  const handleTogglePin = useCallback(() => {
    const wasPinned = pinned;
    const newPinned = !wasPinned;

    if (newPinned) {
      const viewportX = position.x - window.scrollX;
      const viewportY = position.y - window.scrollY;
      setPosition({ x: viewportX, y: viewportY });
      setPinned(true);
      updateData({ pinned: true, x: viewportX, y: viewportY });
      onUndoableAction?.({
        undo: async () => {
          const pageX = viewportX + window.scrollX;
          const pageY = viewportY + window.scrollY;
          const current = getNoteData(annotation);
          db.annotations.update(annotation.id, { data: JSON.stringify({ ...current, pinned: false, x: pageX, y: pageY }) });
        },
        redo: async () => {
          const current = getNoteData(annotation);
          db.annotations.update(annotation.id, { data: JSON.stringify({ ...current, pinned: true, x: viewportX, y: viewportY }) });
        },
      });
    } else {
      const pageX = position.x + window.scrollX;
      const pageY = position.y + window.scrollY;
      setPosition({ x: pageX, y: pageY });
      setPinned(false);
      updateData({ pinned: false, x: pageX, y: pageY });
      onUndoableAction?.({
        undo: async () => {
          const vpX = pageX - window.scrollX;
          const vpY = pageY - window.scrollY;
          const current = getNoteData(annotation);
          db.annotations.update(annotation.id, { data: JSON.stringify({ ...current, pinned: true, x: vpX, y: vpY }) });
        },
        redo: async () => {
          const current = getNoteData(annotation);
          db.annotations.update(annotation.id, { data: JSON.stringify({ ...current, pinned: false, x: pageX, y: pageY }) });
        },
      });
    }
  }, [pinned, position, annotation, onUndoableAction, updateData]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = position.x;
    const startY = position.y;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      setPosition({ x: startX + dx, y: startY + dy });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      setPosition(current => {
        if (current.x !== startX || current.y !== startY) {
          updateData({ x: current.x, y: current.y });
          onUndoableAction?.({
            undo: async () => { updateData({ x: startX, y: startY }); },
            redo: async () => { updateData({ x: current.x, y: current.y }); },
          });
        }
        return current;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [position, annotation.id, onUndoableAction, updateData]);

  const handleResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    setUserResized(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let newW = startW;
      let newH = startH;

      if (corner.includes('r')) newW = Math.max(MIN_WIDTH, startW + dx);
      if (corner.includes('b')) newH = Math.max(MIN_HEIGHT, startH + dy);
      if (corner.includes('l')) newW = Math.max(MIN_WIDTH, startW - dx);

      setSize({ width: newW, height: newH });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      setSize(current => {
        updateData({ width: current.width, height: current.height });
        onUndoableAction?.({
          undo: async () => { updateData({ width: startW, height: startH }); },
          redo: async () => { updateData({ width: current.width, height: current.height }); },
        });
        return current;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [size, annotation.id, onUndoableAction, updateData]);

  return (
    <div
      className={`shadow-lg rounded-xl overflow-hidden backdrop-blur-md border transition-shadow group ${
        isFocused ? 'ring-2 ring-blue-500 border-blue-200' : 'border-slate-200/50 hover:border-slate-300'
      }`}
      style={{
        position: pinned ? 'fixed' : 'absolute',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        backgroundColor: annotation.color || '#fef08a',
        pointerEvents: 'auto',
        zIndex: pinned ? 10000 : 10,
      }}
    >
      {/* Drag handle with pin + privacy buttons */}
      <div
        onMouseDown={handleDragStart}
        className="h-5 w-full cursor-grab active:cursor-grabbing bg-black/5 hover:bg-black/10 transition-colors flex items-center px-1"
      >
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleTogglePin}
          className="flex items-center justify-center w-4 h-4 rounded-sm opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity cursor-pointer"
          style={{ opacity: pinned ? 0.7 : undefined }}
          title={pinned ? 'Unpin from viewport' : 'Pin to viewport'}
        >
          {pinned ? (
            <PinOff size={11} strokeWidth={2} />
          ) : (
            <Pin size={11} strokeWidth={2} />
          )}
        </button>
        <div className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ml-auto mr-5">
          <PrivacyToggle
            compact
            value={privacy}
            onChange={async (level) => {
              setPrivacy(level);
              const action = await updateAnnotation(annotation.id, { privacy: level });
              onUndoableAction?.(action);
            }}
          />
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={async () => {
          const action = await deleteAnnotation(annotation.id);
          onUndoableAction?.(action);
        }}
        className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center rounded-bl-md bg-black/0 hover:bg-black/20 text-slate-800 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer z-10"
        title="Delete note"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="8" y2="8" />
          <line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>

      {/* Text area */}
      <div className="p-3" style={{ height: `calc(100% - 20px)` }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
            textOnFocusRef.current = text;
          }}
          onBlur={() => {
            setIsFocused(false);
            const oldText = textOnFocusRef.current;
            const newText = text;
            if (oldText !== newText) {
              onUndoableAction?.({
                undo: async () => { updateData({ text: oldText }); },
                redo: async () => { updateData({ text: newText }); },
              });
            }
          }}
          className="w-full h-full bg-transparent resize-none outline-none text-slate-800 placeholder:text-slate-800/50 text-sm leading-relaxed"
          placeholder="Type a note..."
          autoFocus={!noteData.text}
        />
      </div>

      {/* Resize handles */}
      <div
        onMouseDown={(e) => handleResizeStart(e, 'r')}
        style={{ position: 'absolute', top: 8, right: 0, bottom: 8, width: 6, cursor: 'ew-resize' }}
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'b')}
        style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 6, cursor: 'ns-resize' }}
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'br')}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, cursor: 'nwse-resize' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.3 }}>
          <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10" y1="6" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}
