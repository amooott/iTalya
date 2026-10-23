export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatTimestamp(value) {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') {
    return 'Non renseignée';
  }
  const seconds = toNumber(value);
  if (seconds === null) return 'Date invalide';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return 'Date invalide';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())} UTC`;
}

export function daysRemaining(value) {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  const seconds = toNumber(value);
  if (seconds === null) return null;
  const remaining = seconds * 1000 - Date.now();
  return Math.ceil(remaining / 86400000);
}

export function expiryTone(value, warningDays = 7) {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return 'muted';
  const seconds = toNumber(value);
  if (seconds === null) return 'muted';
  const remaining = seconds * 1000 - Date.now();
  if (remaining <= 0) return 'danger';
  if (remaining <= warningDays * 86400000) return 'warning';
  return 'success';
}

export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function statusTone(status) {
  return String(status || '').trim().toLowerCase() === 'active' ? 'success' : 'danger';
}

export function statusLabel(status) {
  const clean = String(status || '').trim();
  if (!clean) return 'Inconnu';
  if (clean.toLowerCase() === 'active') return 'Actif';
  if (clean.toLowerCase() === 'expired') return 'Expiré';
  if (clean.toLowerCase() === 'banned') return 'Banni';
  if (clean.toLowerCase() === 'disabled') return 'Désactivé';
  return clean;
}

export function clampInt(value, min, max, fallback) {
  const number = parseInt(String(value).replace(/[^0-9-]/g, ''), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function plural(count, singular, pluralForm) {
  return count > 1 ? pluralForm : singular;
}

export function shortHost(host) {
  return String(host || '').replace(/^https?:\/\//i, '');
}
