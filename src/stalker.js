export class StalkerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StalkerError';
    this.code = code;
  }
}

export const STALKER_UA =
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp Mobile Safari/533.3';

export function normalizeMac(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, ':');
}

export function validMac(mac) {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalizeMac(mac));
}

export function normalizePanel(value) {
  let text = String(value || '').trim().split(/\s+/)[0] || '';
  if (!text) return { address: '', host: '' };
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const address = text.split('/')[0].replace(/\/+$/, '');
  const host = address.split(':')[0];
  return { address, host };
}

export function portalUrl(panel) {
  const { address } = normalizePanel(panel);
  return address ? `http://${address}/c/` : '';
}

export function parseStalkerAccounts(text, defaultPanel = '') {
  const seen = new Set();
  const result = [];

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const tokens = line.split(/[\s,;|]+/).filter(Boolean);
    let mac = '';
    const others = [];
    for (const token of tokens) {
      if (!mac && validMac(token)) mac = normalizeMac(token);
      else others.push(token);
    }
    if (!mac) continue;
    const panel = normalizePanel(others.join(' ') || defaultPanel).address;
    const key = `${panel}|${mac}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ panel, mac });
  }

  return result;
}

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function parseStalkerDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const english = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (english) {
    const month = MONTHS[english[1].toLowerCase()];
    if (month) {
      const date = new Date(Date.UTC(Number(english[3]), month - 1, Number(english[2])));
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const europe = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (europe) {
    const date = new Date(Date.UTC(Number(europe[3]), Number(europe[2]) - 1, Number(europe[1])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function timeoutController(seconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, seconds * 1000));
  return { controller, clear: () => clearTimeout(timer) };
}

function headersFor(host, mac, token) {
  const headers = {
    Accept: '*/*',
    'User-Agent': STALKER_UA,
    Referer: `http://${host}/c/`,
    'Accept-Language': 'en-US,*',
    'Accept-Charset': 'UTF-8,*;q=0.8',
    'X-User-Agent': 'Model: MAG250; Link: WiFi',
    Cookie: `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/Paris;`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function stalkerGet(url, host, mac, token, settings, timeoutSeconds = 12) {
  const { controller, clear } = timeoutController(timeoutSeconds);
  try {
    const response = await fetch(url, {
      headers: headersFor(host, mac, token),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new StalkerError('http', `HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof StalkerError) throw error;
    if (error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new StalkerError('timeout', 'Délai dépassé');
    }
    throw new StalkerError('network', 'Portail injoignable');
  } finally {
    clear();
  }
}

const CATEGORY_CALLS = [
  ['live', 'itv', 'get_genres'],
  ['vod', 'vod', 'get_categories'],
  ['series', 'series', 'get_categories'],
];

export async function checkStalker(panelInput, macInput, settings) {
  const started = Date.now();
  const mac = normalizeMac(macInput);
  const { address, host } = normalizePanel(panelInput);

  if (!address) {
    return { kind: 'error', code: 'panel', message: 'Adresse du portail manquante.', duration: 0 };
  }
  if (!validMac(mac)) {
    return { kind: 'error', code: 'mac', message: 'Adresse MAC invalide (AA:BB:CC:DD:EE:FF).', duration: 0 };
  }

  const base = `http://${address}/portal.php`;

  try {
    const handshake = await stalkerGet(
      `${base}?type=stb&action=handshake&prehash=false&token=&JsHttpRequest=1-xml`,
      host,
      mac,
      null,
      settings,
      10,
    );
    let token;
    try {
      token = JSON.parse(handshake).js.token;
    } catch {
      throw new StalkerError('handshake', 'Poignée de main refusée par le portail.');
    }
    if (!token) {
      throw new StalkerError('handshake', 'Poignée de main refusée par le portail.');
    }

    const profileBody = await stalkerGet(
      `${base}?type=account_info&action=get_main_info&JsHttpRequest=1-xml`,
      host,
      mac,
      token,
      settings,
      10,
    );
    let profile;
    try {
      profile = JSON.parse(profileBody).js;
    } catch {
      throw new StalkerError('profile', 'Profil illisible.');
    }
    if (!profile || (!profile.phone && !profile.end_date)) {
      throw new StalkerError('profile', 'Aucun profil renvoyé par le portail.');
    }

    const expiresRaw = String(profile.end_date || profile.phone || '').trim();
    const unlimited = expiresRaw.toLowerCase().startsWith('un');
    const expiry = unlimited ? null : parseStalkerDate(expiresRaw);
    const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null;
    const functional = unlimited || daysLeft === null || daysLeft >= 0;

    let channels = null;
    try {
      const body = await stalkerGet(
        `${base}?type=itv&action=get_all_channels&JsHttpRequest=1-xml`,
        host,
        mac,
        token,
        settings,
        20,
      );
      channels = Number(JSON.parse(body).js.total_items) || 0;
    } catch {
      channels = null;
    }

    const categories = {};
    for (const [key, type, action] of CATEGORY_CALLS) {
      try {
        const body = await stalkerGet(
          `${base}?type=${type}&action=${action}&JsHttpRequest=1-xml`,
          host,
          mac,
          token,
          settings,
          15,
        );
        const list = JSON.parse(body).js;
        const titles = Array.isArray(list)
          ? list
              .filter((item) => item && typeof item === 'object')
              .map((item) => String(item.title || item.name || '').trim())
              .filter(Boolean)
          : [];
        categories[key] = { count: titles.length, titles: titles.slice(0, 40) };
      } catch {
        categories[key] = { count: null, titles: [] };
      }
    }

    return {
      kind: functional ? 'active' : 'inactive',
      panel: address,
      host,
      mac: String(profile.mac || '').trim() || mac,
      expiresRaw,
      unlimited,
      daysLeft,
      channels,
      categories,
      duration: Date.now() - started,
    };
  } catch (error) {
    const known = error instanceof StalkerError;
    return {
      kind: 'error',
      panel: address,
      mac,
      code: known ? error.code : 'unexpected',
      message: known ? error.message : 'Erreur inattendue',
      duration: Date.now() - started,
    };
  }
}

export async function testStalkerStream(url, host, mac, settings) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return { ok: false, detail: 'URL invalide' };

  const { controller, clear } = timeoutController(settings.connectTimeout || 5);
  try {
    const response = await fetch(value, {
      headers: {
        'User-Agent': STALKER_UA,
        Referer: `http://${host}/c/`,
        Cookie: `mac=${encodeURIComponent(mac)}; stb_lang=en;`,
        Range: 'bytes=0-2047',
      },
      signal: controller.signal,
    });
    const status = response.status;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    controller.abort();
    if (status !== 200 && status !== 206) return { ok: false, detail: `HTTP ${status}` };
    if (contentType.includes('text/html')) return { ok: false, detail: 'Réponse HTML' };
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
