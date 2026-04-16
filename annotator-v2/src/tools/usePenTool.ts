import { useEffect, useRef } from "react";
import { db, type Point, getStrokeData } from "../store/db";
import { useLiveQuery } from "dexie-react-hooks";
import { addAnnotation } from "../store/undoable";
import { getPageContext } from "../utils/pageContext";
import type { UndoAction } from "../hooks/useUndoRedo";

interface Props {
  isActive: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  color: string;
  strokeWidth: number;
  redrawKey: number;
  onUndoableAction?: (action: UndoAction) => void;
}

export default function usePenTool({ isActive, canvasRef, color, strokeWidth, redrawKey, onUndoableAction }: Props) {
  const isDrawingRef = useRef(false);
  const currentPathRef = useRef<Point[]>([]);
  const url = window.location.href;

  const existingStrokes = useLiveQuery(
    () => db.annotations.where('[url+type]').equals([url, 'stroke']).toArray(),
    [url]
  );

  // Re-draw all saved strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !existingStrokes) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
  }, [existingStrokes, canvasRef, redrawKey]);

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
