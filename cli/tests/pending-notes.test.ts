import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PendingNotesStore, type PendingNoteInput } from '../src/pending-notes.js';

let store: PendingNotesStore;

beforeEach(() => { store = new PendingNotesStore({ capacity: 3 }); });

test('add returns an id and stores with canonicalized url', () => {
  const id = store.add({ url: 'HTTPS://Example.com/a/', text: 'do X' });
  assert.ok(id);
  const found = store.findByUrl('https://example.com/a');
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'do X');
});

test('findByUrl returns empty when no match', () => {
  store.add({ url: 'https://a.com/x', text: 't' });
  assert.deepEqual(store.findByUrl('https://b.com/x'), []);
});

test('delete removes the entry', () => {
  const id = store.add({ url: 'https://a.com/x', text: 't' });
  store.delete(id);
  assert.deepEqual(store.findByUrl('https://a.com/x'), []);
});

test('LRU: evicts oldest when capacity exceeded', () => {
  store.add({ url: 'https://a.com/1', text: 't1' });
  store.add({ url: 'https://a.com/2', text: 't2' });
  store.add({ url: 'https://a.com/3', text: 't3' });
  store.add({ url: 'https://a.com/4', text: 't4' }); // evicts #1
  assert.deepEqual(store.findByUrl('https://a.com/1'), []);
  assert.equal(store.findByUrl('https://a.com/4').length, 1);
});

test('findByUrl returns all matches for the same URL', () => {
  store.add({ url: 'https://a.com/x', text: 't1' });
  store.add({ url: 'https://a.com/x', text: 't2' });
  assert.equal(store.findByUrl('https://a.com/x').length, 2);
});

test('add accepts optional color and tags', () => {
  const id = store.add({ url: 'https://a.com/x', text: 't', color: '#c7d2fe', tags: ['claude-task'] });
  const [note] = store.findByUrl('https://a.com/x');
  assert.equal(note.id, id);
  assert.equal(note.color, '#c7d2fe');
  assert.deepEqual(note.tags, ['claude-task']);
});
