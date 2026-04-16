import type { ComponentType, RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { UndoAction } from '../store/undoStore';
import type { StorageAdapter } from '../store/adapter';

export interface ToolContext {
  /** True when this tool is the currently selected tool. */
  active: boolean;
  /** True whenever the overlay is toggled on, regardless of active tool. */
  overlayActive: boolean;
  pageKey: string;
  color: string;
  strokeWidth: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  storage: StorageAdapter;
  push: (action: UndoAction) => void;
  setActiveTool: (id: string | null) => void;
}

export interface Tool {
  id: string;
  label: string;
  hotkey: string;       // single character, lowercase; matched against KeyboardEvent.key
  icon: LucideIcon;
  takesColor?: boolean;
  takesStrokeWidth?: boolean;
  defaultColor?: string;

  /**
   * Rendered inside the overlay while the overlay is active. Tools
   * read `ctx.active` to gate input capture; "always-on" rendering
   * (existing strokes, existing highlights) runs unconditionally.
   */
  Component: ComponentType<{ ctx: ToolContext }>;

  /**
   * How the tool wants to interact with the overlay container.
   *   'canvas'   — draws on the shared canvas (pen, eraser)
   *   'dom'      — operates on the host page DOM (highlighter)
   *   'pointer'  — placeholder cursor / selection layer
   *   'click'    — captures clicks on the overlay container to create
   */
  surface: 'canvas' | 'dom' | 'pointer' | 'click';
}
