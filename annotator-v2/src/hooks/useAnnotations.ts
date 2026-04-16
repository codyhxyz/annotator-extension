import { useEffect, useState } from 'react';
import type { Annotation } from '../store/db';
import { storage } from '../store/storage';
import type { AnnotationFilter } from '../store/adapter';

/**
 * Subscribe to a filtered annotation stream. Storage-agnostic — tools
 * call this instead of touching Dexie directly.
 *
 * The filter is serialized into a stable key so object-literal filters
 * created inline at render time don't re-subscribe every pass.
 */
export function useAnnotations(filter: AnnotationFilter): Annotation[] | undefined {
  const key = JSON.stringify(filter);
  const [list, setList] = useState<Annotation[]>();

  useEffect(() => {
    const parsed = JSON.parse(key) as AnnotationFilter;
    return storage.subscribe(parsed, setList);
  }, [key]);

  return list;
}
