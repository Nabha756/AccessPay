// Display preferences: contrast, text size and motion.
//
// Saved separately from transactions so "Delete all transactions" doesn't
// reset someone's accessibility settings. A small inline script in
// index.html applies the same values before the page first paints;
// keep the two in sync if the storage format changes.

export const SETTINGS_KEY = 'accesspay.settings';

export const FONT_SCALES = {
  '1': 'Default',
  '1.15': 'Large',
  '1.3': 'Larger',
  '1.5': 'Largest',
};

export const DEFAULT_SETTINGS = {
  contrast: 'standard', // 'standard' | 'high'
  fontScale: '1',       // key of FONT_SCALES
  motion: 'system',     // 'system' (follow OS setting) | 'reduce'
};

/** Drops anything unexpected so a hand-edited or old value can't break the page. */
export function sanitiseSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  if (raw.contrast === 'high') s.contrast = 'high';
  if (Object.hasOwn(FONT_SCALES, String(raw.fontScale))) s.fontScale = String(raw.fontScale);
  if (raw.motion === 'reduce') s.motion = 'reduce';
  return s;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return sanitiseSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(sanitiseSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/** Reflects settings on <html> where the CSS picks them up. */
export function applySettings(settings, root = document.documentElement) {
  if (settings.contrast === 'high') root.dataset.contrast = 'high';
  else delete root.dataset.contrast;

  if (settings.motion === 'reduce') root.dataset.motion = 'reduce';
  else delete root.dataset.motion;

  root.style.setProperty('--font-scale', settings.fontScale);
}
