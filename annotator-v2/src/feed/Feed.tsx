import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pen,
  Highlighter,
  StickyNote,
  Search,
  ExternalLink,
  Layers,
  Globe,
} from 'lucide-react';
import { db, type Annotation, type AnnotationType, getNoteData, getHighlightData } from '../store/db';

type FilterType = 'all' | 'highlights' | 'notes' | 'drawings';

interface FeedItem {
  id: string;
  type: AnnotationType;
  url: string;
  timestamp: number;
  color: string;
  pageTitle?: string;
  favicon?: string;
  pageSection?: string;
  label: string;
}

function hostnameFromUrl(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function toFeedItem(ann: Annotation): FeedItem {
  let label: string;
  switch (ann.type) {
    case 'note':
      label = getNoteData(ann).text || 'Empty note';
      break;
    case 'highlight': {
      const hd = getHighlightData(ann);
      try {
        const parsed = JSON.parse(hd.serializedRange);
        label = parsed?.quote?.exact || 'Highlight';
      } catch { label = 'Highlight'; }
      break;
    }
    case 'stroke':
      label = `Drawing on ${ann.pageTitle || hostnameFromUrl(ann.url)}`;
      break;
  }
  return {
    id: ann.id, type: ann.type, url: ann.url,
    timestamp: ann.timestamp, color: ann.color,
    pageTitle: ann.pageTitle, favicon: ann.favicon,
    pageSection: ann.pageSection, label,
  };
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function dateGroup(ts: number): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - now.getDay() * 86400000;

  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfYesterday) return 'Yesterday';
  if (ts >= startOfWeek) return 'This Week';
  return 'Older';
}

const typeIcon: Record<AnnotationType, typeof Pen> = {
  stroke: Pen,
  highlight: Highlighter,
  note: StickyNote,
};

export default function Feed() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  const annotations = useLiveQuery(() => db.annotations.toArray()) ?? [];

  const items = useMemo(() => {
    let merged = annotations.map(toFeedItem);

    if (filter === 'highlights') merged = merged.filter((i) => i.type === 'highlight');
    if (filter === 'notes') merged = merged.filter((i) => i.type === 'note');
    if (filter === 'drawings') merged = merged.filter((i) => i.type === 'stroke');

    if (search.trim()) {
      const q = search.toLowerCase();
      merged = merged.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.url.toLowerCase().includes(q) ||
          (i.pageTitle?.toLowerCase().includes(q) ?? false) ||
          (i.pageSection?.toLowerCase().includes(q) ?? false),
      );
    }

    merged.sort((a, b) => b.timestamp - a.timestamp);
    return merged;
  }, [annotations, filter, search]);

  const grouped = useMemo(() => {
    const groups: { label: string; items: FeedItem[] }[] = [];
    const order = ['Today', 'Yesterday', 'This Week', 'Older'];
    const map = new Map<string, FeedItem[]>();
    for (const item of items) {
      const g = dateGroup(item.timestamp);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    for (const label of order) {
      const list = map.get(label);
      if (list?.length) groups.push({ label, items: list });
    }
    return groups;
  }, [items]);

  const filters: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'highlights', label: 'Highlights' },
    { id: 'notes', label: 'Notes' },
    { id: 'drawings', label: 'Drawings' },
  ];

  const totalCount = annotations.length;

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-slate-900 text-white">
              <Layers size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Annotations</h1>
              <p className="text-sm text-slate-500">
                {totalCount} annotation{totalCount !== 1 ? 's' : ''} across all pages
              </p>
            </div>
          </div>

          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search annotations..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-1">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  filter === f.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {totalCount === 0 ? (
          <EmptyState />
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Search size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No annotations match your search.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <AnimatePresence mode="popLayout">
              {grouped.map((group) => (
                <motion.div
                  key={group.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    {group.label}
                  </h2>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <FeedRow key={item.id} item={item} />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const Icon = typeIcon[item.type];
  const displayTitle = item.pageTitle || hostnameFromUrl(item.url);

  return (
    <motion.button
      layout
      onClick={() => chrome.tabs.create({ url: item.url })}
      className="w-full flex items-start gap-3 p-3 rounded-xl text-left hover:bg-slate-50 transition-colors group"
    >
      <div className="relative mt-0.5 flex-shrink-0">
        <div className="p-2 rounded-lg" style={{ backgroundColor: item.color + '20' }}>
          <Icon size={16} style={{ color: item.color }} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 leading-snug line-clamp-2">{item.label}</p>
        <div className="flex items-center gap-2 mt-1">
          {item.favicon ? (
            <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded-sm"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <Globe size={12} className="text-slate-400" />
          )}
          <span className="text-xs text-slate-400 truncate">{displayTitle}</span>
          {item.pageSection && (
            <>
              <span className="text-xs text-slate-300">/</span>
              <span className="text-xs text-slate-400 truncate">{item.pageSection}</span>
            </>
          )}
          <span className="text-xs text-slate-300 ml-auto flex-shrink-0">{relativeTime(item.timestamp)}</span>
        </div>
      </div>

      <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <ExternalLink size={14} className="text-slate-400" />
      </div>
    </motion.button>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-24">
      <div className="inline-flex p-4 rounded-2xl bg-slate-50 mb-4">
        <Layers size={32} className="text-slate-300" />
      </div>
      <h3 className="text-base font-medium text-slate-600 mb-1">No annotations yet</h3>
      <p className="text-sm text-slate-400 max-w-sm mx-auto">
        Press <kbd className="px-1.5 py-0.5 text-xs bg-slate-100 rounded border border-slate-200 font-mono">`</kbd> on any page to start annotating. Your highlights, notes, and drawings will appear here.
      </p>
    </div>
  );
}
