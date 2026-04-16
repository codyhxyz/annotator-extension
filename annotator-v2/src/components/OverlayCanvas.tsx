import { useRef, useEffect, useState } from "react";
import usePenTool from "../tools/usePenTool";
import useEraserTool from "../tools/useEraserTool";
import { getCursorForTool } from "../utils/cursors";
import type { UndoAction } from "../hooks/useUndoRedo";

interface Props {
  isActive: boolean;
  activeTool: string | null;
  penColor?: string;
  penStrokeWidth?: number;
  onUndoableAction?: (action: UndoAction) => void;
}

export default function OverlayCanvas({ isActive, activeTool, penColor = '#ef4444', penStrokeWidth = 4, onUndoableAction }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resizeKey, setResizeKey] = useState(0);

  usePenTool({
    isActive: isActive && activeTool === 'pen',
    canvasRef,
    color: penColor,
    strokeWidth: penStrokeWidth,
    redrawKey: resizeKey,
    onUndoableAction,
  });

  useEraserTool({
    isActive: isActive && activeTool === 'eraser',
    canvasRef,
    onUndoableAction,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) {
      // Zero out canvas when inactive to free GPU memory
      if (canvas && canvas.width > 0) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }

    const resize = () => {
      const w = Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth
      );
      const h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        setResizeKey(k => k + 1);
      }
    };

    resize();

    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(resize, 200);
    });
    ro.observe(document.body);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [isActive]);

  // Highlighter operates on DOM text nodes (mark injection), not canvas
  const canvasPointerEvents =
    isActive && (activeTool === 'pen' || activeTool === 'eraser')
      ? 'auto'
      : 'none';

  const canvasCursor = isActive && activeTool
    ? getCursorForTool(activeTool, { color: penColor })
    : 'default';

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1,
        pointerEvents: canvasPointerEvents,
        cursor: canvasCursor,
      }}
    />
  );
}
