import { Highlighter } from 'lucide-react';
import useHighlighterTool from './useHighlighterTool';
import type { Tool } from './types';

export const highlighterTool: Tool = {
  id: 'highlighter',
  label: 'Highlight',
  hotkey: 'h',
  icon: Highlighter,
  takesColor: true,
  defaultColor: '#fde047',
  surface: 'dom',
  Component({ ctx }) {
    useHighlighterTool({
      isActive: ctx.overlayActive && ctx.active,
      color: ctx.color,
      onUndoableAction: ctx.push,
    });
    return null;
  },
};
