import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Pen, StickyNote, Highlighter, MapPin, Clock, ChevronRight, FileText, Trash2 } from "lucide-react";
import PanelOverlay from "./PanelOverlay";
import { searchAnnotations, getAnnotationCounts, type SearchResult, type FilterType } from "../utils/search";
import { storage } from "../store/storage";
import type { Annotation } from "../store/annotation";

const typeIcon = (type: string) => {
  switch (type) {
    case 'highlight': return <Highlighter size={14} />;
    case 'note': return <StickyNote size={14} />;
    case 'drawing': return <Pen size={14} />;
    default: return <FileText size={14} />;
  }
};

const timeAgo = (ts: number) => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

interface Props {
  onClose: () => void;
}

export default function SearchPanel({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [counts, setCounts] = useState({ highlight: 0, note: 0, drawing: 0 });
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Fetch counts once on mount
  useEffect(() => {
    getAnnotationCounts().then(setCounts);
  }, []);

  // Debounced search
  const runSearch = useCallback((q: string, f: FilterType | null) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const r = await searchAnnotations(q, f);
      setResults(r);
      setSelectedIdx(0);
      setLoading(false);
    }, q ? 150 : 0); // immediate for empty query, debounced for typing
  }, []);

  useEffect(() => {
    runSearch(query, filter);
    return () => clearTimeout(debounceRef.current);
  }, [query, filter, runSearch]);

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const item = container.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const navigateToResult = (result: SearchResult) => {
    // Try chrome.tabs API first (content script context), fall back to window.open
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'OPEN_TAB', url: result.url });
      } else {
        window.open(result.url, '_blank');
      }
    } catch {
      window.open(result.url, '_blank');
    }
    onClose();
  };

  const deleteResult = async (result: SearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    if (result.type === 'drawing') {
      const strokesOnUrl = await storage.list({ url: result.url, type: 'stroke' });
      await storage.bulkDelete(strokesOnUrl.map((s: Annotation) => s.id));
    } else {
      await storage.delete(result.id);
    }
    runSearch(query, filter);
    getAnnotationCounts().then(setCounts);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIdx]) navigateToResult(results[selectedIdx]);
        break;
      case 'Backspace':
        if (e.metaKey && results[selectedIdx]) {
          e.preventDefault();
          deleteResult(results[selectedIdx], e as unknown as React.MouseEvent);
        }
        break;
    }
  };

  const totalCount = counts.highlight + counts.note + counts.drawing;

  const filterChips: { id: FilterType | null; label: string; count: number }[] = [
    { id: null, label: 'All', count: totalCount },
    { id: 'highlight', label: 'Highlights', count: counts.highlight },
    { id: 'note', label: 'Notes', count: counts.note },
    { id: 'drawing', label: 'Drawings', count: counts.drawing },
  ];

  return (
    <PanelOverlay onClose={onClose} width={560}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <Search size={20} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all annotations..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 16,
              color: '#1e293b',
              background: 'transparent',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 2 }}
            >
              <X size={16} />
            </button>
          )}
          <kbd style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontSize: 12, fontFamily: 'inherit', border: '1px solid #e2e8f0' }}>esc</kbd>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px', borderBottom: '1px solid #f1f5f9' }}>
          {filterChips.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                background: filter === f.id ? '#3b82f6' : '#f1f5f9',
                color: filter === f.id ? 'white' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s',
              }}
            >
              {f.label}
              <span style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 10,
                background: filter === f.id ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
              }}>
                {f.count}
              </span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>{results.length} results</span>
        </div>

        {/* Results list */}
        <div ref={resultsRef} style={{ overflowY: 'auto', flex: 1 }}>
          {loading && results.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              Loading...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              {query ? 'No annotations match your search' : 'No annotations yet'}
            </div>
          ) : (
            results.map((result, idx) => (
              <div
                key={`${result.type}-${result.id}`}
                onClick={() => navigateToResult(result)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 20px',
                  cursor: 'pointer',
                  background: idx === selectedIdx ? '#f8fafc' : 'transparent',
                  borderLeft: idx === selectedIdx ? '3px solid #3b82f6' : '3px solid transparent',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: result.color + '30',
                  color: '#475569',
                  flexShrink: 0, marginTop: 2,
                }}>
                  {typeIcon(result.type)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {result.text}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <MapPin size={10} /> {result.page}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={10} /> {timeAgo(result.timestamp)}
                    </span>
                  </div>
                </div>
                {idx === selectedIdx && (
                  <button
                    onClick={(e) => deleteResult(result, e)}
                    title="Delete annotation"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#cbd5e1', padding: 4, flexShrink: 0, marginTop: 2,
                      display: 'flex', alignItems: 'center',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#cbd5e1'; }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <ChevronRight size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 4, opacity: idx === selectedIdx ? 1 : 0 }} />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8' }}>
          <span><kbd style={{ padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', marginRight: 4 }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', marginRight: 4 }}>↵</kbd> jump to</span>
          <span><kbd style={{ padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', marginRight: 4 }}>⌘⌫</kbd> delete</span>
        </div>
    </PanelOverlay>
  );
}
