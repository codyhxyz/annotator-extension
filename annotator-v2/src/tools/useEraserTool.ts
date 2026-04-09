import { useEffect, useRef } from "react";
import { db, getStrokeData } from "../store/db";
import { useLiveQuery } from "dexie-react-hooks";
import { deleteAnnotations } from "../store/undoable";
import type { UndoAction } from "../hooks/useUndoRedo";

interface Props {
  isActive: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  eraserRadius?: number;
  onUndoableAction?: (action: UndoAction) => void;
}

export default function useEraserTool({ isActive, canvasRef, eraserRadius = 20, onUndoableAction }: Props) {
  const isErasingRef = useRef(false);
  const url = window.location.href;

  const existingStrokes = useLiveQuery(
    () => db.annotations.where('[url+type]').equals([url, 'stroke']).toArray(),
    [url]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;

    const radiusSq = eraserRadius * eraserRadius;

    const eraseAtPoint = async (clientX: number, clientY: number) => {
      if (!existingStrokes) return;

      const ex = clientX + window.scrollX;
      const ey = clientY + window.scrollY;
      const idsToDelete: string[] = [];

      for (const ann of existingStrokes) {
        const stroke = getStrokeData(ann);
        for (const pt of stroke.points) {
          const dx = pt.x - ex;
          const dy = pt.y - ey;
          if (dx * dx + dy * dy <= radiusSq) {
            idsToDelete.push(ann.id);
            break;
          }
        }
      }

      if (idsToDelete.length > 0) {
        const action = await deleteAnnotations(idsToDelete);
        onUndoableAction?.(action);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      isErasingRef.current = true;
      eraseAtPoint(e.clientX, e.clientY);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isErasingRef.current) return;
      eraseAtPoint(e.clientX, e.clientY);
    };

    const onMouseUp = () => {
      isErasingRef.current = false;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseout", onMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseout", onMouseUp);
    };
  }, [isActive, canvasRef, eraserRadius, existingStrokes, onUndoableAction]);
}
