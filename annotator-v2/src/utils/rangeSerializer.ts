/**
 * W3C Web Annotation Data Model selectors.
 * https://www.w3.org/TR/annotation-model/#text-quote-selector
 * https://www.w3.org/TR/annotation-model/#text-position-selector
 *
 * Two selectors work together:
 *   TextPositionSelector — fast path (character offsets in body text)
 *   TextQuoteSelector    — resilient path (exact text + prefix/suffix context)
 */

import { getNodeByXPath } from './xpath';

const CONTEXT_CHARS = 32;

export interface TextQuoteSelector {
  type: 'TextQuoteSelector';
  exact: string;
  prefix: string;
  suffix: string;
}

export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
}

export interface AnnotationSelector {
  quote: TextQuoteSelector;
  position: TextPositionSelector;
  /** SHA-256 hash of normalized highlighted text — content-addressed anchor for durability */
  textHash?: string;
}

// ── Serialize: Range → JSON string ──────────────────────────────────

export async function serializeRange(range: Range): Promise<string> {
  const bodyText = document.body.textContent ?? '';
  const exact = range.toString();

  // Compute character offset of selection within body text
  const preRange = document.createRange();
  preRange.selectNodeContents(document.body);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + exact.length;

  // Grab surrounding context for disambiguation
  const prefix = bodyText.slice(Math.max(0, start - CONTEXT_CHARS), start);
  const suffix = bodyText.slice(end, end + CONTEXT_CHARS);

  // Content-addressed hash — normalize whitespace before hashing
  const normalized = exact.trim().replace(/\s+/g, ' ').toLowerCase();
  const textHash = await hashText(normalized);

  const selector: AnnotationSelector = {
    quote: { type: 'TextQuoteSelector', exact, prefix, suffix },
    position: { type: 'TextPositionSelector', start, end },
    textHash,
  };

  return JSON.stringify(selector);
}

/** SHA-256 hash of text, returned as hex string. */
async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Deserialize: JSON string → Range ────────────────────────────────

export function deserializeRange(serialized: string): Range | null {
  try {
    const data = JSON.parse(serialized);

    // Handle legacy XPath format from old highlights
    if (data.startContainerXPath) {
      return deserializeLegacy(data);
    }

    const selector = data as AnnotationSelector;
    const bodyText = document.body.textContent ?? '';

    // Fast path: TextPositionSelector — check if text at stored offsets still matches
    const { start, end } = selector.position;
    if (bodyText.slice(start, end) === selector.quote.exact) {
      const range = offsetsToRange(start, end);
      if (range) return range;
    }

    // Resilient path: TextQuoteSelector — search for exact text with context
    const { exact, prefix, suffix } = selector.quote;
    if (!exact) return null;

    // Try increasingly relaxed searches
    const candidates: { needle: string; offset: number }[] = [];
    if (prefix && suffix) candidates.push({ needle: prefix + exact + suffix, offset: prefix.length });
    if (prefix) candidates.push({ needle: prefix + exact, offset: prefix.length });
    if (suffix) candidates.push({ needle: exact + suffix, offset: 0 });
    candidates.push({ needle: exact, offset: 0 });

    for (const { needle, offset } of candidates) {
      const idx = bodyText.indexOf(needle);
      if (idx === -1) continue;
      const range = offsetsToRange(idx + offset, idx + offset + exact.length);
      if (range) return range;
    }

    // textHash is stored for CLI-based reanchoring (ann orphans / ann reanchor),
    // not used at runtime — scanning the full page text is too expensive in-browser.

    return null;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert character offsets within body text to a DOM Range. */
function offsetsToRange(start: number, end: number): Range | null {
  const startPos = findTextNodeAtOffset(document.body, start);
  const endPos = findTextNodeAtOffset(document.body, end);
  if (!startPos || !endPos) return null;

  try {
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    return range;
  } catch {
    return null;
  }
}

/** Walk text nodes to find the node containing a given character offset. */
function findTextNodeAtOffset(root: Node, targetOffset: number): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let charCount = 0;

  let textNode = walker.nextNode();
  while (textNode) {
    const len = textNode.textContent?.length ?? 0;
    if (charCount + len > targetOffset) {
      return { node: textNode, offset: targetOffset - charCount };
    }
    charCount += len;
    textNode = walker.nextNode();
  }

  // Edge case: offset equals total length — anchor at end of last text node
  if (charCount === targetOffset) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    let n = w.nextNode();
    while (n) { last = n; n = w.nextNode(); }
    if (last) return { node: last, offset: last.textContent?.length ?? 0 };
  }

  return null;
}

/** Backwards-compat: deserialize old XPath-based format. */
function deserializeLegacy(data: { startContainerXPath: string; startOffset: number; endContainerXPath: string; endOffset: number }): Range | null {
  try {
    const startContainer = getNodeByXPath(data.startContainerXPath);
    const endContainer = getNodeByXPath(data.endContainerXPath);
    if (!startContainer || !endContainer) return null;
    const range = document.createRange();
    range.setStart(startContainer, data.startOffset);
    range.setEnd(endContainer, data.endOffset);
    return range;
  } catch {
    return null;
  }
}

/** Returns true if the node lives inside a ShadowRoot (i.e. our extension UI). */
export function isInsideShadowDOM(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current instanceof ShadowRoot) return true;
    current = current.parentNode;
  }
  return false;
}
