import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCOUNTS_KEY = '@italya/xtream/accounts/v1';
const PORTALS_KEY = '@italya/xtream/portals/v1';

export function normalizeServer(server) {
  return String(server || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/:80$/, '')
    .replace(/:443$/, '')
    .toLowerCase();
}

export function accountKey(account) {
  if (account.type === 'stalker') {
    return `stalker|${normalizeServer(account.server)}|${String(account.mac || '').toUpperCase()}`;
  }
  return `xtream|${normalizeServer(account.server)}|${String(account.username || '').trim().toLowerCase()}`;
}

export async function loadAccounts() {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAccounts(list) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.slice(0, 2000)));
}

export async function upsertAccounts(records) {
  const list = await loadAccounts();
  const map = new Map(list.map((item) => [item.key, item]));
  const now = new Date().toISOString();

  for (const record of records) {
    if (!record) continue;
    const key = accountKey(record);
    const previous = map.get(key);
    map.set(key, {
      ...previous,
      ...record,
      key,
      id: key,
      label: record.label !== undefined ? record.label : previous?.label || '',
      createdAt: previous?.createdAt || now,
      lastCheck: record.lastCheck || now,
    });
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => String(b.lastCheck || '').localeCompare(String(a.lastCheck || '')),
  );
  await saveAccounts(merged);
  return merged;
}

export async function updateAccount(key, patch) {
  const list = await loadAccounts();
  const next = list.map((item) => (item.key === key ? { ...item, ...patch } : item));
  await saveAccounts(next);
  return next;
}

export async function deleteAccounts(keys) {
  const remove = new Set(keys);
  const list = await loadAccounts();
  const next = list.filter((item) => !remove.has(item.key));
  await saveAccounts(next);
  return next;
}

export async function removeDuplicateAccounts() {
  const list = await loadAccounts();
  const map = new Map();
  for (const item of list) {
    const previous = map.get(item.key);
    if (!previous || String(item.lastCheck || '') > String(previous.lastCheck || '')) {
      map.set(item.key, item);
    }
  }
  const next = Array.from(map.values());
  await saveAccounts(next);
  return { list: next, removed: list.length - next.length };
}

export async function loadPortals() {
  try {
    const raw = await AsyncStorage.getItem(PORTALS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function rememberPortal(panel) {
  const value = String(panel || '').trim();
  if (!value) return loadPortals();
  const current = await loadPortals();
  const next = [value, ...current.filter((item) => item !== value)].slice(0, 50);
  await AsyncStorage.setItem(PORTALS_KEY, JSON.stringify(next));
  return next;
}

export async function forgetPortal(panel) {
  const current = await loadPortals();
  const next = current.filter((item) => item !== panel);
  await AsyncStorage.setItem(PORTALS_KEY, JSON.stringify(next));
  return next;
}
