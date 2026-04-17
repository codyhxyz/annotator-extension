/**
 * W3C Web Annotation Data Model export.
 * Converts unified Annotation records to JSON-LD conforming to
 * https://www.w3.org/TR/annotation-model/
 */

import { type Annotation, getHighlightData, getNoteData, getStrokeData } from '../store/annotation';
import { storage } from '../store/storage';

interface W3CAnnotation {
  '@context': string;
  id: string;
  type: 'Annotation';
  motivation: string;
  created: string;
  modified: string;
  creator?: { type: string; name: string };
  target: W3CTarget;
  body?: W3CBody | W3CBody[];
}

interface W3CTarget {
  source: string;
  selector?: W3CSelector | W3CSelector[];
}

interface W3CSelector {
  type: string;
  [key: string]: unknown;
}

interface W3CBody {
  type: string;
  value: string;
  format?: string;
  purpose?: string;
}

function toISOString(ms: number): string {
  return new Date(ms).toISOString();
}

function toW3C(ann: Annotation): W3CAnnotation {
  const base: W3CAnnotation = {
    '@context': 'http://www.w3.org/ns/anno.jsonld',
    id: `ann://${ann.type[0]}/${ann.id}`,
    type: 'Annotation',
    motivation: 'highlighting',
    created: toISOString(ann.timestamp),
    modified: toISOString(ann.updatedAt * 1000),
    target: { source: ann.url },
  };

  switch (ann.type) {
    case 'highlight': {
      base.motivation = 'highlighting';
      const hd = getHighlightData(ann);
      try {
        const parsed = JSON.parse(hd.serializedRange);
        const selectors: W3CSelector[] = [];

        if (parsed?.quote) {
          selectors.push({
            type: 'TextQuoteSelector',
            exact: parsed.quote.exact,
            prefix: parsed.quote.prefix,
            suffix: parsed.quote.suffix,
          });
        }
        if (parsed?.position) {
          selectors.push({
            type: 'TextPositionSelector',
            start: parsed.position.start,
            end: parsed.position.end,
          });
        }

        if (selectors.length > 0) {
          base.target.selector = selectors.length === 1 ? selectors[0] : selectors;
        }
      } catch { /* use target without selector */ }
      break;
    }

    case 'note': {
      base.motivation = 'commenting';
      const nd = getNoteData(ann);
      if (nd.text) {
        base.body = {
          type: 'TextualBody',
          value: nd.text,
          format: 'text/plain',
        };
      }
      break;
    }

    case 'stroke': {
      base.motivation = 'describing';
      const sd = getStrokeData(ann);
      // Convert stroke points to SVG path
      if (sd.points.length > 1) {
        const pathParts = sd.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`);
        const svgPath = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathParts.join(' ')}" stroke="${ann.color}" stroke-width="${sd.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        base.target.selector = {
          type: 'SvgSelector',
          value: svgPath,
        };
      }
      break;
    }
  }

  // Add tags as bodies with tagging motivation
  if (ann.tags && ann.tags.length > 0) {
    const tagBodies: W3CBody[] = ann.tags.map(tag => ({
      type: 'TextualBody',
      value: tag,
      purpose: 'tagging',
    }));

    if (base.body) {
      base.body = [base.body as W3CBody, ...tagBodies];
    } else {
      base.body = tagBodies.length === 1 ? tagBodies[0] : tagBodies;
    }
  }

  return base;
}

/** Export all annotations as W3C Web Annotation JSON-LD array. */
export async function exportAsW3C(options?: { url?: string }): Promise<string> {
  const all = options?.url
    ? await storage.list({ url: options.url })
    : await storage.list();

  const w3cAnnotations = all.map(toW3C);
  return JSON.stringify(w3cAnnotations, null, 2);
}

/** Export as W3C JSONL (one annotation per line). */
export async function exportAsW3CJsonl(options?: { url?: string }): Promise<string> {
  const all = options?.url
    ? await storage.list({ url: options.url })
    : await storage.list();

  return all.map(ann => JSON.stringify(toW3C(ann))).join('\n') + (all.length > 0 ? '\n' : '');
}

export { toW3C };
