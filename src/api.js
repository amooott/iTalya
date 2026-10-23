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

function decodeComponent(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch {
    return String(value);
  }
}

// Hermes/React Native fournit un URLSearchParams incomplet (get/set non
// implémentés) : on analyse la chaîne de requête nous-mêmes.
function parseQuery(search) {
  const result = {};
  const clean = String(search || '').replace(/^\?/, '');
  if (!clean) return result;
  for (const part of clean.split('&')) {
    if (!part) continue;
    const index = part.indexOf('=');
    const key = decodeComponent(index >= 0 ? part.slice(0, index) : part);
    const value = index >= 0 ? decodeComponent(part.slice(index + 1)) : '';
    if (!(key in result)) result[key] = value;
  }
  return result;
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

  const query = parseQuery(url.search);
  const username = query.username;
  const password = query.password;
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
  const pairs = [
    ['username', credentials.username],
    ['password', credentials.password],
  ];
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null) pairs.push([key, String(value)]);
  });
  const query = pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${credentials.host}/player_api.php?${query}`;
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

const CATEGORY_ACTIONS_BY_KIND = {
  live: ['get_live_categories', 'get_live_streams'],
  vod: ['get_vod_categories', 'get_vod_streams'],
  series: ['get_series_categories', 'get_series'],
};

export function itemId(kind, item) {
  const value = kind === 'series' ? item.series_id ?? item.id : item.stream_id ?? item.id;
  return value === undefined || value === null ? '' : String(value);
}

export function itemName(item) {
  return String(item.name || item.title || 'Sans nom').trim() || 'Sans nom';
}

export async function fetchCategories(credentials, kind, settings) {
  const action = CATEGORY_ACTIONS_BY_KIND[kind][0];
  const data = await requestJson(buildApiUrl(credentials, { action }), settings);
  if (!Array.isArray(data)) {
    throw new ApiError('categories', 'Le serveur ne renvoie pas de catégories.');
  }
  return data
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.category_id ?? item.id ?? ''),
      name: String(item.category_name ?? item.name ?? 'Sans nom').trim() || 'Sans nom',
    }))
    .filter((item) => item.id);
}

export async function fetchCategoryItems(credentials, kind, categoryId, settings) {
  const action = CATEGORY_ACTIONS_BY_KIND[kind][1];
  const data = await requestJson(
    buildApiUrl(credentials, { action, category_id: String(categoryId) }),
    settings,
  );
  if (!Array.isArray(data)) {
    throw new ApiError('items', 'Le serveur ne renvoie pas d’éléments.');
  }
  return data
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ id: itemId(kind, item), name: itemName(item), raw: item }))
    .filter((item) => item.id);
}

export async function fetchSeriesEpisodes(credentials, seriesId, settings) {
  const data = await requestJson(
    buildApiUrl(credentials, { action: 'get_series_info', series_id: String(seriesId) }),
    settings,
  );
  const episodes = data && data.episodes;
  const flat = [];
  if (Array.isArray(episodes)) {
    episodes.forEach((episode) => {
      if (episode && typeof episode === 'object' && episode.id !== undefined) flat.push(episode);
    });
  } else if (episodes && typeof episodes === 'object') {
    Object.keys(episodes).forEach((season) => {
      const list = episodes[season];
      if (!Array.isArray(list)) return;
      list.forEach((episode) => {
        if (episode && typeof episode === 'object' && episode.id !== undefined) {
          flat.push({ ...episode, season });
        }
      });
    });
  }
  return flat;
}

export function itemStreamUrl(credentials, kind, item) {
  const id = itemId(kind, item);
  if (!id) return '';
  const extension = item.container_extension || (kind === 'live' ? 'ts' : 'mp4');
  const path = kind === 'live' ? 'live' : 'movie';
  return (
    `${credentials.host}/${path}/` +
    `${encodeURIComponent(credentials.username)}/` +
    `${encodeURIComponent(credentials.password)}/` +
    `${encodeURIComponent(id)}.${encodeURIComponent(extension)}`
  );
}

export async function testAccountItem(credentials, kind, item, settings) {
  try {
    let url;
    if (kind === 'series') {
      const episodes = await fetchSeriesEpisodes(credentials, itemId(kind, item), settings);
      if (!episodes.length) return { ok: false, detail: 'Aucun épisode', url: '' };
      const episode = episodes[0];
      const extension = episode.container_extension || 'mp4';
      url =
        `${credentials.host}/series/` +
        `${encodeURIComponent(credentials.username)}/` +
        `${encodeURIComponent(credentials.password)}/` +
        `${encodeURIComponent(String(episode.id))}.${encodeURIComponent(extension)}`;
      const outcome = await testStream(url, settings);
      const season = Number(episode.season) || 0;
      const number = Number(episode.episode_num) || 0;
      return {
        ...outcome,
        url,
        detail: outcome.ok ? `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')} · ${outcome.detail}` : outcome.detail,
      };
    }

    url = itemStreamUrl(credentials, kind, item);
    if (!url) return { ok: false, detail: 'URL indisponible', url: '' };
    const outcome = await testStream(url, settings);
    return { ...outcome, url };
  } catch (error) {
    return { ok: false, detail: error.message || 'Erreur', url: '' };
  }
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
      password: credentials.password,
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
