import { MousePointer2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type Annotation, getStrokeData } from '../store/db';
import { useAnnotations } from '../hooks/useAnnotations';
import { updateAnnotation } from '../store/undoable';
import type { Tool, ToolContext } from './types';

interface SelectionBox { x: number; y: number; w: number; h: number; }

function PointerTool({ ctx }: { ctx: ToolContext }) {
  const strokes = useAnnotations({ url: ctx.pageKey, type: 'stroke' });
  const [selected, setSelected] = useState<Annotation | null>(null);
  const [box, setBox] = useState<SelectionBox | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!ctx.active) return;
    const onMouseDown = (e: MouseEvent) => {
      const clickX = e.clientX + window.scrollX;
      const clickY = e.clientY + window.scrollY;
      const hit = pickStroke(strokes, clickX, clickY, 10);
      if (!hit) { setSelected(null); setBox(null); return; }
      setSelected(hit);
      dragStartRef.current = { x: clickX, y: clickY };
      setBox(strokeBounds(hit, 8));
    };
    const onMouseUp = async (e: MouseEvent) => {
      if (!selected || !dragStartRef.current) return;
      const endX = e.clientX + window.scrollX;
      const endY = e.clientY + window.scrollY;
      const dx = endX - dragStartRef.current.x;
      const dy = endY - dragStartRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        const oldData = getStrokeData(selected);
        const newPoints = oldData.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        const newData = JSON.stringify({ ...oldData, points: newPoints });
        const action = await updateAnnotation(selected.id, { data: newData });
        ctx.push(action);
        setBox(prev => prev ? { ...prev, x: prev.x + dx, y: prev.y + dy } : null);
      }
      dragStartRef.current = null;
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [ctx.active, ctx.push, selected, strokes]);

  if (!ctx.overlayActive || !box) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x, top: box.y, width: box.w, height: box.h,
        border: '2px dashed #3b82f6', borderRadius: 4,
        pointerEvents: 'none', zIndex: 2,
      }}
    />
  );
}

/**
 * Segment-distance hit test: checks the perpendicular distance to each
 * segment, not just the sampled points. Fast-moving strokes sample
 * sparsely; point-only checks miss the line between samples.
 */
function pickStroke(strokes: Annotation[] | undefined, x: number, y: number, radius: number): Annotation | null {
  if (!strokes) return null;
  const r2 = radius * radius;
  for (const ann of strokes) {
    const pts = getStrokeData(ann).points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1];
      if (!b) {
        const dx = a.x - x, dy = a.y - y;
        if (dx * dx + dy * dy <= r2) return ann;
        continue;
      }
      if (pointSegmentDistSq(x, y, a.x, a.y, b.x, b.y) <= r2) return ann;
    }
  }
  return null;
}

function pointSegmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax, ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const ex = px - cx, ey = py - cy;
  return ex * ex + ey * ey;
}

function strokeBounds(ann: Annotation, pad: number): SelectionBox {
  const pts = getStrokeData(ann).points;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export const pointerTool: Tool = {
  id: 'pointer',
  label: 'Cursor',
  hotkey: 'v',
  icon: MousePointer2,
  surface: 'pointer',
  Component: PointerTool,
};
