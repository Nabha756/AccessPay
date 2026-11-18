import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, sanitiseSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from '../../js/lib/settings.js';
import { createMemoryStorage, createBrokenStorage } from './helpers.js';

test('defaults when nothing is saved', () => {
  assert.deepEqual(loadSettings(createMemoryStorage()), DEFAULT_SETTINGS);
});

test('saved settings round-trip', () => {
  const storage = createMemoryStorage();
  saveSettings({ contrast: 'high', fontScale: '1.3', motion: 'reduce' }, storage);
  assert.deepEqual(loadSettings(storage), { contrast: 'high', fontScale: '1.3', motion: 'reduce' });
});

test('unexpected values are replaced with defaults', () => {
  assert.deepEqual(
    sanitiseSettings({ contrast: 'neon', fontScale: '9', motion: 'fast', extra: true }),
    DEFAULT_SETTINGS,
  );
  assert.equal(sanitiseSettings({ fontScale: 1.5 }).fontScale, '1.5', 'numbers from older saves still work');
});

test('corrupt JSON or blocked storage falls back to defaults', () => {
  assert.deepEqual(loadSettings(createMemoryStorage({ [SETTINGS_KEY]: '{oops' })), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(createBrokenStorage()), DEFAULT_SETTINGS);
  assert.equal(saveSettings(DEFAULT_SETTINGS, createBrokenStorage()), false);
});
