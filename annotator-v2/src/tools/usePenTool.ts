import { useEffect, useRef, useState } from "react";
import { type Point, getStrokeData } from "../store/db";
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
  /** Retained for call-site compatibility; internal ResizeObserver now drives redraws. */
  redrawKey?: number;
  onUndoableAction?: (action: UndoAction) => void;
}

export default function usePenTool({ isActive, canvasRef, color, strokeWidth, onUndoableAction }: Props) {
  const isDrawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);
  const url = currentPageKey();
  const [epoch, setEpoch] = useState(0);

  const existingStrokes = useAnnotations({ url, type: 'stroke' });

  // Canvas-size → epoch bump. Internal so pen doesn't need a redrawKey prop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let prev = `${canvas.width}x${canvas.height}`;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cur = `${canvas.width}x${canvas.height}`;
      if (cur !== prev) { prev = cur; setEpoch(e => e + 1); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);

  // Re-draw all saved strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !existingStrokes) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    existingStrokes.forEach(ann => {
      const stroke = getStrokeData(ann);
      const first = stroke.points[0];
      if (!first || stroke.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = stroke.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i]!;
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    });
  }, [existingStrokes, canvasRef, epoch]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const startDrawing = (e: MouseEvent) => {
      isDrawingRef.current = true;
      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;
      currentPathRef.current = [{ x, y }];
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const draw = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;

      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;
      currentPathRef.current.push({ x, y });

      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const stopDrawing = async () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      ctx.closePath();

      if (currentPathRef.current.length > 1) {
        const minY = Math.min(...currentPathRef.current.map(p => p.y));
        const context = getPageContext(minY);
        const action = await addAnnotation({
          id: crypto.randomUUID(),
          url,
          type: 'stroke',
          data: JSON.stringify({ points: currentPathRef.current, strokeWidth }),
          color,
          timestamp: Date.now(),
          ...context,
        });
        onUndoableAction?.(action);
      }
      currentPathRef.current = [];
    };

    canvas.addEventListener("mousedown", startDrawing);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stopDrawing);
    canvas.addEventListener("mouseout", stopDrawing);

    return () => {
      canvas.removeEventListener("mousedown", startDrawing);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stopDrawing);
      canvas.removeEventListener("mouseout", stopDrawing);
    };
  }, [isActive, color, strokeWidth, canvasRef, url, onUndoableAction]);
}
