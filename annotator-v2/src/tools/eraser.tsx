import { Eraser } from 'lucide-react';
import useEraserTool from './useEraserTool';
import type { Tool } from './types';

export const eraserTool: Tool = {
  id: 'eraser',
  label: 'Eraser',
  hotkey: 'e',
  icon: Eraser,
  surface: 'canvas',
  Component({ ctx }) {
    useEraserTool({
      isActive: ctx.overlayActive && ctx.active,
      canvasRef: ctx.canvasRef,
      onUndoableAction: ctx.push,
    });
    return null;
  },
};
