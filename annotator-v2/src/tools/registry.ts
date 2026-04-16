import type { Tool } from './types';
import { penTool } from './pen';
import { highlighterTool } from './highlighter';
import { noteTool } from './note';
import { eraserTool } from './eraser';
import { pointerTool } from './pointer';

/**
 * The app's tools, in palette order. Adding a tool is a single-file
 * change: create tools/<id>.tsx exporting a Tool, then append here.
 */
export const tools: Tool[] = [
  pointerTool,
  penTool,
  noteTool,
  highlighterTool,
  eraserTool,
];

export function findToolByHotkey(key: string): Tool | undefined {
  const k = key.toLowerCase();
  return tools.find(t => t.hotkey === k);
}

export function findTool(id: string | null | undefined): Tool | undefined {
  if (!id) return undefined;
  return tools.find(t => t.id === id);
}
