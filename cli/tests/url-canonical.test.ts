import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeUrl } from '../src/url-canonical.js';

test('lowercases scheme and host', () => {
  assert.equal(canonicalizeUrl('HTTPS://Example.COM/path'), 'https://example.com/path');
});

test('strips trailing slash from pathname', () => {
  assert.equal(canonicalizeUrl('https://example.com/foo/'), 'https://example.com/foo');
});

test('keeps single-slash path as-is', () => {
  assert.equal(canonicalizeUrl('https://example.com/'), 'https://example.com/');
});

test('drops fragment', () => {
  assert.equal(canonicalizeUrl('https://example.com/a#section'), 'https://example.com/a');
});

test('keeps query string verbatim', () => {
  assert.equal(canonicalizeUrl('https://example.com/a?b=1&a=2'), 'https://example.com/a?b=1&a=2');
});

test('returns input unchanged when invalid URL', () => {
  assert.equal(canonicalizeUrl('not a url'), 'not a url');
});
