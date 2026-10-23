export class ApiError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const DEFAULT_UA = 'XtreamAccountInspector/3.0';

function timeoutController(seconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, seconds * 1000));
  return { controller, clear: () => clearTimeout(timer) };
}

async function requestJson(url, settings, timeoutSeconds) {
  const { controller, clear } = timeoutController(timeoutSeconds || settings.readTimeout || 12);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': settings.userAgent || DEFAULT_UA,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError('http', `Le serveur a répondu HTTP ${response.status}.`, { status: response.status });
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError('json', 'Réponse illisible : le serveur ne renvoie pas du JSON.');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new ApiError('timeout', 'Délai dépassé : le serveur ne répond pas.');
    }
    throw new ApiError('network', 'Erreur réseau : serveur injoignable.');
  } finally {
    clear();
  }
}

export function normalizeHost(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new ApiError('host_empty', 'Indique l’adresse du serveur.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('host_invalid', 'Adresse de serveur invalide.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError('host_scheme', 'Seules les adresses http:// et https:// sont acceptées.');
  }
  if (!url.hostname) {
    throw new ApiError('host_invalid', 'Adresse de serveur invalide.');
  }
  if (url.username || url.password) {
    throw new ApiError('host_credentials', 'Ne mets pas d’identifiants dans l’adresse du serveur.');
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new ApiError('host_base', 'Indique uniquement le serveur, sans chemin ni paramètres.');
  }

  return `${url.protocol}//${url.host}`;
}

export function parseM3U(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) throw new ApiError('url_empty', 'Colle une URL M3U.');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('url_invalid', 'URL M3U invalide.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError('url_scheme', 'L’URL doit commencer par http:// ou https://.');
  }
  if (!url.hostname) {
    throw new ApiError('url_host', 'L’URL ne contient pas de serveur.');
  }

  const username = url.searchParams.get('username');
  const password = url.searchParams.get('password');
  if (!username || !password) {
    throw new ApiError('url_credentials', 'L’URL doit contenir username= et password=.');
  }

  return {
    host: `${url.protocol}//${url.host}`,
    username,
    password,
    m3uUrl: value,
  };
}

export function buildApiUrl(credentials, extra = {}) {
  const params = new URLSearchParams();
  params.set('username', credentials.username);
  params.set('password', credentials.password);
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  return `${credentials.host}/player_api.php?${params.toString()}`;
}

export function isActive(info) {
  return String((info && info.status) || '').trim().toLowerCase() === 'active';
}

export async function checkAccount(credentials, settings) {
  const data = await requestJson(buildApiUrl(credentials), settings);
  const info = data && data.user_info;

  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    throw new ApiError('account', 'Réponse inattendue : informations du compte absentes.');
  }
  if (String(info.auth) === '0') {
    throw new ApiError('auth', 'Identifiants refusés par le serveur.');
  }

  return { info, server: data.server_info || null };
}

const CATEGORY_ACTIONS = [
  ['live', 'get_live_categories'],
  ['vod', 'get_vod_categories'],
  ['series', 'get_series_categories'],
];

export async function fetchCategoryCounts(credentials, settings) {
  const entries = await Promise.all(
    CATEGORY_ACTIONS.map(async ([key, action]) => {
      try {
        const data = await requestJson(buildApiUrl(credentials, { action }), settings);
        return [key, Array.isArray(data) ? data.length : null];
      } catch {
        return [key, null];
      }
    }),
  );
  return entries.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

export async function testStream(url, settings) {
  const value = String(url || '').trim();
  if (!value) return { ok: false, detail: 'URL vide' };
  if (!/^https?:\/\//i.test(value)) return { ok: false, detail: 'URL invalide' };

  const { controller, clear } = timeoutController(settings.connectTimeout || 5);
  try {
    const response = await fetch(value, {
      headers: {
        'User-Agent': settings.userAgent || DEFAULT_UA,
        Range: 'bytes=0-2047',
      },
      signal: controller.signal,
    });
    const status = response.status;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const length = response.headers.get('content-length');

    // On coupe immédiatement le corps : seuls les en-têtes nous intéressent.
    controller.abort();

    if (status !== 200 && status !== 206) return { ok: false, detail: `HTTP ${status}` };
    if (contentType.includes('text/html')) return { ok: false, detail: 'Réponse HTML' };
    if (length === '0') return { ok: false, detail: 'Réponse vide' };
    return { ok: true, detail: 'Accessible' };
  } catch (error) {
    if (error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      return { ok: false, detail: 'Délai dépassé' };
    }
    return { ok: false, detail: 'Erreur réseau' };
  } finally {
    clear();
  }
}

export async function checkUrl(url, settings) {
  const started = Date.now();
  try {
    const credentials = parseM3U(url);
    const { info } = await checkAccount(credentials, settings);
    const active = isActive(info);
    return {
      kind: active ? 'active' : 'inactive',
      url,
      host: credentials.host,
      username: credentials.username,
      info,
      duration: Date.now() - started,
    };
  } catch (error) {
    const known = error instanceof ApiError;
    return {
      kind: 'error',
      url,
      code: known ? error.code : 'unexpected',
      message: known ? error.message : 'Erreur inattendue',
      duration: Date.now() - started,
    };
  }
}
