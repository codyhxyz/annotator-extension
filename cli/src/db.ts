/**
 * Direct access to the annotation database via JSONL file.
 *
 * The CLI reads/writes a canonical JSONL file that the extension
 * can import/export. This is the bridge between browser and filesystem.
 *
 * Default location: ~/.ann/annotations.jsonl
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface Annotation {
  id: string;
  url: string;
  type: 'stroke' | 'note' | 'highlight';
  privacy: 'private' | 'friends' | 'open';
  syncStatus: 'pending' | 'synced';
  data: string;
  color: string;
  timestamp: number;
  updatedAt: number;
  deletedAt?: number;
  pageTitle: string;
  favicon: string;
  pageSection?: string;
  userId?: string;
  tags?: string[];
}

const ANN_DIR = join(homedir(), '.ann');
const DB_FILE = join(ANN_DIR, 'annotations.jsonl');

function ensureDir() {
  if (!existsSync(ANN_DIR)) mkdirSync(ANN_DIR, { recursive: true });
}

export function loadAll(): Annotation[] {
  ensureDir();
  if (!existsSync(DB_FILE)) return [];
  const content = readFileSync(DB_FILE, 'utf-8');
  return content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

export function saveAll(annotations: Annotation[]) {
  ensureDir();
  const content = annotations.map(a => JSON.stringify(a)).join('\n') + '\n';
  writeFileSync(DB_FILE, content);
}

export function addAnnotation(ann: Annotation) {
  const all = loadAll();
  all.push(ann);
  saveAll(all);
}

export function deleteAnnotation(id: string) {
  const all = loadAll().filter(a => a.id !== id);
  saveAll(all);
}

export function getDbPath(): string {
  return DB_FILE;
}
