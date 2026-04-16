import { Pen } from 'lucide-react';
import usePenTool from './usePenTool';
import type { Tool } from './types';

export const penTool: Tool = {
  id: 'pen',
  label: 'Draw',
  hotkey: 'd',
  icon: Pen,
  takesColor: true,
  takesStrokeWidth: true,
  defaultColor: '#ef4444',
  surface: 'canvas',
  Component({ ctx }) {
    usePenTool({
      isActive: ctx.overlayActive && ctx.active,
      canvasRef: ctx.canvasRef,
      color: ctx.color,
      strokeWidth: ctx.strokeWidth,
      redrawKey: 0,
      onUndoableAction: ctx.push,
    });
    return null;
  },
};
