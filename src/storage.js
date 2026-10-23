import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@italya/xtream/settings/v1';
const HISTORY_KEY = '@italya/xtream/history/v1';

export const DEFAULT_SETTINGS = {
  connectTimeout: 5,
  readTimeout: 12,
  concurrency: 5,
  userAgent: 'XtreamAccountInspector/3.0',
  expiryWarningDays: 7,
};

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addHistory(entry) {
  const previous = await loadHistory();
  const next = [entry, ...previous].slice(0, 30);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function clearHistory() {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
