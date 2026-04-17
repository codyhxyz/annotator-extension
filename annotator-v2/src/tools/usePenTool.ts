import { useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { type Point, getStrokeData } from "../store/annotation";
import { useAnnotations } from "../hooks/useAnnotations";
import { addAnnotation } from "../store/undoable";
import { getPageContext } from "../utils/pageContext";
import { currentPageKey } from "../utils/normalizeUrl";
import type { UndoAction } from "../hooks/useUndoRedo";

interface Props {
  isActive: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  color: string;
  strokeWidth: number;
  onUndoableAction?: (action: UndoAction) => void;
}

/**
 * Pen tool — strokes are smoothed with perfect-freehand (variable-width
 * polygon that approximates a pressure-aware brush). We render strokes
 * as filled polygons, not line-joined segments, so corners look sharp
 * and the line doesn't thin out on fast movements.
 *
 * Coords in storage are document-space. Render translates by -scroll
 * so the viewport-sized canvas stays correct while scrolling.
 */
export default function usePenTool({
  isActive, canvasRef, color, strokeWidth, onUndoableAction,
}: Props) {
  const isDrawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);
  const url = currentPageKey();
  const [redraw, setRedraw] = useState(0);

  const existingStrokes = useAnnotations({ url, type: 'stroke' });

  // Redraw on scroll / resize bumps (dispatched by OverlayCanvas).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onRedraw = () => setRedraw(r => r + 1);
    canvas.addEventListener('annotator-redraw', onRedraw);
    return () => canvas.removeEventListener('annotator-redraw', onRedraw);
  }, [canvasRef]);

  // Render existing strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !existingStrokes) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    const scrollX = window.scrollX, scrollY = window.scrollY;

    for (const ann of existingStrokes) {
      const stroke = getStrokeData(ann);
      if (stroke.points.length < 2) continue;
      drawStroke(ctx, stroke.points, stroke.strokeWidth, ann.color, scrollX, scrollY);
    }

    // If drawing, re-render the live path on top each frame.
    if (isDrawingRef.current && currentPathRef.current.length >= 2) {
      drawStroke(ctx, currentPathRef.current, strokeWidth, color, scrollX, scrollY);
    }
  }, [existingStrokes, canvasRef, redraw, color, strokeWidth]);

  // Input capture
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;

    const start = (e: MouseEvent) => {
      isDrawingRef.current = true;
      currentPathRef.current = [{ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY }];
      setRedraw(r => r + 1);
    };
    const move = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;
      currentPathRef.current.push({ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY });
      setRedraw(r => r + 1);
    };
    const end = async () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const pts = currentPathRef.current;
      if (pts.length > 1) {
        const minY = Math.min(...pts.map(p => p.y));
        const context = getPageContext(minY);
        const action = await addAnnotation({
          id: crypto.randomUUID(),
          url, type: 'stroke',
          data: JSON.stringify({ points: pts, strokeWidth }),
          color, timestamp: Date.now(),
          ...context,
        });
        onUndoableAction?.(action);
      }
      currentPathRef.current = [];
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', end);
      canvas.removeEventListener('mouseleave', end);
    };
  }, [isActive, color, strokeWidth, canvasRef, url, onUndoableAction]);
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  size: number,
  color: string,
  scrollX: number,
  scrollY: number,
) {
  const inputs: [number, number][] = points.map(p => [p.x - scrollX, p.y - scrollY]);
  const outline = getStroke(inputs, {
    size,
    thinning: 0.35,
    smoothing: 0.6,
    streamline: 0.5,
    simulatePressure: true,
  });
  if (outline.length < 2) return;

  ctx.fillStyle = color;
  ctx.beginPath();
  const [x0, y0] = outline[0]!;
  ctx.moveTo(x0, y0);
  for (let i = 1; i < outline.length; i++) {
    const [x, y] = outline[i]!;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
