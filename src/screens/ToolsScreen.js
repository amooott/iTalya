import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Badge, Button, Card, Field, SectionTitle, StatusDot } from '../components';
import { colors, font, radius, spacing } from '../theme';

const FORBIDDEN = [
  'access denied',
  'forbidden',
  'not allowed',
  'unauthorized',
  'permission denied',
  'your ip',
  'error 403',
  'not authorized',
];

function dedupe(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    const key = url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function portalTarget(line) {
  let text = String(line || '').trim();
  if (!text) return null;
  const first = text.split(/\s+/)[0];
  if (!first || first.startsWith('#')) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(first)) text = `http://${first}`;
  else text = first;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return { host: url.hostname, port: url.port ? Number(url.port) : 80 };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options, seconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function shareText(name, content, mimeType, UTI) {
  const path = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) return null;
  await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Partager', UTI });
  return path;
}

export default function ToolsScreen() {
  const [tool, setTool] = useState('cleaner');

  // Nettoyeur
  const [cleanMode, setCleanMode] = useState('m3u');
  const [cleanInput, setCleanInput] = useState('');
  const [customRe, setCustomRe] = useState('');
  const [exclude, setExclude] = useState('');
  const [cleanResult, setCleanResult] = useState(null);
  const [cleanError, setCleanError] = useState('');

  // Portail
  const [portalInput, setPortalInput] = useState('');
  const [portalRows, setPortalRows] = useState([]);
  const [portalRunning, setPortalRunning] = useState(false);
  const [portalDone, setPortalDone] = useState(0);
  const [portalTotal, setPortalTotal] = useState(0);

  // MAC
  const [pattern, setPattern] = useState('00:1A:79:**:**:**');
  const [count, setCount] = useState('10');
  const [macs, setMacs] = useState([]);

  // Doublons
  const [dupeInput, setDupeInput] = useState('');
  const [dupeResult, setDupeResult] = useState(null);

  const nettoyer = () => {
    setCleanError('');
    const lines = cleanInput.split(/\r?\n/).filter((line) => line.trim());
    const found = [];

    try {
      if (cleanMode === 'custom') {
        if (!customRe.trim()) throw new Error('Indique une expression régulière.');
        const regex = new RegExp(customRe, 'g');
        for (const line of lines) {
          let match = regex.exec(line);
          while (match !== null) {
            found.push(match[0]);
            if (match[0] === '') regex.lastIndex += 1;
            match = regex.exec(line);
          }
        }
      } else if (cleanMode === 'portal') {
        for (const line of lines) {
          const tokens = line.match(/http:\/\/\S+/g) || [];
          for (const raw of tokens) {
            const token = raw.replace(/[.,;)\]"']+$/g, '');
            const match = token.match(/^http:\/\/([^\s/:]+)(:\d{1,5})?(\/c\/?)?$/);
            if (match) found.push(`http://${match[1]}${match[2] || ''}${match[3] ? '/c/' : ''}`);
          }
        }
      } else {
        for (const line of lines) {
          const match = line.match(/http:\/\/[^\s]+/);
          if (!match) continue;
          const url = match[0];
          if (url.includes('/get.php?username=') && !url.includes('/get.php?username=play')) {
            found.push(url);
          }
        }
      }
    } catch (error) {
      setCleanError(error.message || 'Expression invalide.');
      setCleanResult(null);
      return;
    }

    const filtered = exclude.trim() ? found.filter((url) => !url.includes(exclude.trim())) : found;
    const unique = dedupe(filtered);
    setCleanResult({
      urls: unique,
      lines: lines.length,
      found: found.length,
      duplicates: filtered.length - unique.length,
    });
  };

  const copierNettoyage = async () => {
    if (!cleanResult || !cleanResult.urls.length) return;
    await Share.share({ message: cleanResult.urls.join('\n') });
  };

  const enregistrerNettoyage = async () => {
    if (!cleanResult || !cleanResult.urls.length) return;
    try {
      await shareText('liste_nettoyee.txt', `${cleanResult.urls.join('\n')}\n`, 'text/plain', 'public.plain-text');
    } catch (error) {
      Alert.alert('Enregistrement impossible', String(error.message || error));
    }
  };

  const verifierPortails = async () => {
    if (portalRunning) return;
    const targets = portalInput
      .split(/\r?\n/)
      .map(portalTarget)
      .filter(Boolean);
    const unique = [];
    const seen = new Set();
    for (const target of targets) {
      const key = `${target.host}:${target.port}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(target);
      }
    }
    if (!unique.length) {
      Alert.alert('Aucune cible', 'Indique un serveur, par exemple 10.0.0.1:8080.');
      return;
    }

    setPortalRows([]);
    setPortalDone(0);
    setPortalTotal(unique.length);
    setPortalRunning(true);

    let index = 0;
    const collect = [];
    const worker = async () => {
      while (true) {
        const position = index;
        index += 1;
        if (position >= unique.length) return;
        const target = unique[position];
        const row = { ...target, ok: false, ip: '', country: '', city: '', org: '', error: '' };

        try {
          const dns = await fetchWithTimeout(
            `https://dns.google/resolve?name=${encodeURIComponent(target.host)}&type=A`,
            { headers: { Accept: 'application/json' } },
            6,
          );
          const dnsData = await dns.json();
          const answer = (dnsData.Answer || []).find((entry) => entry.type === 1);
          if (!answer) throw new Error('DNS introuvable');
          row.ip = answer.data;

          const base = target.port === 80 ? target.host : `${target.host}:${target.port}`;
          const response = await fetchWithTimeout(
            `http://${base}/c/`,
            { headers: { 'User-Agent': 'Mozilla/5.0 Talya/portal-check' } },
            7,
          );
          const body = (await response.text()).slice(0, 4096).toLowerCase();
          if (response.status === 403) throw new Error('Accès refusé (403)');
          const forbidden = FORBIDDEN.find((word) => body.includes(word));
          if (forbidden) throw new Error(`Accès refusé (« ${forbidden} »)`);
          if (response.status !== 200) throw new Error(`HTTP ${response.status}`);

          const geoResponse = await fetchWithTimeout(
            `https://ipinfo.io/${row.ip}/json`,
            { headers: { Accept: 'application/json' } },
            7,
          );
          const geo = await geoResponse.json();
          row.country = geo.country || '';
          row.city = geo.city || '';
          row.org = geo.org || '';
          row.ok = Boolean(row.country || row.city || row.org);
          if (!row.ok) row.error = 'Informations indisponibles';
        } catch (error) {
          row.error = error && error.name === 'AbortError' ? 'Délai dépassé' : String(error.message || error);
        }

        collect.push(row);
        setPortalRows((previous) => [...previous, row]);
        setPortalDone((value) => value + 1);
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, unique.length) }, () => worker()));
    setPortalRunning(false);
  };

  const analyserDoublons = () => {
    const lines = dupeInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const seen = new Map();
    let duplicates = 0;

    for (const line of lines) {
      let key = `t|${line.toLowerCase()}`;
      const macMatch = line.match(/([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}/);
      const urlMatch = line.match(/https?:\/\/[^\s]+/);

      if (macMatch) {
        const panel = line.replace(macMatch[0], '').trim().split(/\s+/)[0] || '';
        const host = panel.replace(/^https?:\/\//i, '').split('/')[0].replace(/:(80|443)$/, '');
        key = `s|${host.toLowerCase()}|${macMatch[0].toUpperCase()}`;
      } else if (urlMatch) {
        try {
          const url = new URL(urlMatch[0]);
          const host = url.host.replace(/:(80|443)$/, '').toLowerCase();
          const userMatch = url.search.match(/[?&]username=([^&]*)/);
          const user = userMatch ? decodeURIComponent(userMatch[1]).toLowerCase() : '';
          key = user ? `x|${host}|${user}` : `p|${host}|${url.pathname}`;
        } catch {
          key = `t|${line.toLowerCase()}`;
        }
      }

      if (seen.has(key)) duplicates += 1;
      else seen.set(key, line);
    }

    setDupeResult({
      total: lines.length,
      unique: seen.size,
      duplicates,
      lines: Array.from(seen.values()),
    });
  };

  const genererMacs = () => {
    const cleanPattern = pattern.trim().toUpperCase();
    if (!/^([0-9A-F*]{2}:){5}[0-9A-F*]{2}$/.test(cleanPattern)) {
      Alert.alert('Modèle invalide', 'Exemple : 00:1A:79:**:**:**');
      return;
    }
    const stars = (cleanPattern.match(/\*/g) || []).length;
    const capacity = 16 ** stars;
    const wanted = Math.max(1, Math.min(parseInt(count, 10) || 1, 5000));
    if (wanted > capacity) {
      Alert.alert('Modèle trop court', `Ce modèle ne peut produire que ${capacity} adresse(s).`);
      return;
    }

    const set = new Set();
    const hex = '0123456789ABCDEF';
    let guard = 0;
    while (set.size < wanted && guard < wanted * 60) {
      guard += 1;
      set.add(cleanPattern.replace(/\*/g, () => hex[Math.floor(Math.random() * 16)]));
    }
    setMacs(Array.from(set));
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.segmented}>
        {[
          ['cleaner', 'Nettoyeur'],
          ['portal', 'Portail'],
          ['mac', 'MAC'],
          ['dupes', 'Doublons'],
        ].map(([key, label]) => {
          const selected = tool === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTool(key)}
              style={[styles.segment, selected && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tool === 'cleaner' ? (
        <>
          <Card>
            <SectionTitle
              title="Nettoyeur de liste"
              subtitle="Extrait les URL utiles, supprime les doublons."
            />
            <View style={styles.modeRow}>
              {[
                ['m3u', 'M3U'],
                ['portal', 'Portail'],
                ['custom', 'Perso'],
              ].map(([key, label]) => {
                const selected = cleanMode === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setCleanMode(key)}
                    style={[styles.miniChip, selected && styles.miniChipActive]}
                  >
                    <Text style={[styles.miniChipText, selected && styles.miniChipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {cleanMode === 'custom' ? (
              <>
                <Field label="Expression régulière" value={customRe} onChangeText={setCustomRe} placeholder="https?://[^\\s]+" />
                <Field label="Exclure (facultatif)" value={exclude} onChangeText={setExclude} placeholder="play" />
              </>
            ) : null}

            <Field
              label="Texte à nettoyer"
              value={cleanInput}
              onChangeText={setCleanInput}
              placeholder="Colle ta liste ici…"
              multiline
              numberOfLines={8}
            />
            <Button title="Nettoyer" onPress={nettoyer} disabled={!cleanInput.trim()} />

            {cleanError ? <Text style={styles.error}>{cleanError}</Text> : null}

            {cleanResult ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultStats}>
                  {cleanResult.lines} lignes · {cleanResult.found} trouvées · {cleanResult.urls.length} uniques
                  {cleanResult.duplicates ? ` · ${cleanResult.duplicates} doublons` : ''}
                </Text>
                <View style={styles.inlineButtons}>
                  <Button title="Partager" variant="secondary" small onPress={copierNettoyage} disabled={!cleanResult.urls.length} style={{ flex: 1 }} />
                  <Button title="Enregistrer .txt" variant="secondary" small onPress={enregistrerNettoyage} disabled={!cleanResult.urls.length} style={{ flex: 1 }} />
                </View>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      {tool === 'portal' ? (
        <Card>
          <SectionTitle
            title="Vérification de portail"
            subtitle="DNS, réponse HTTP et informations du serveur."
          />
          <Field
            label="Serveurs (un par ligne)"
            value={portalInput}
            onChangeText={setPortalInput}
            placeholder={'10.0.0.1:8080\nhttp://serveur.exemple/c/'}
            multiline
            numberOfLines={6}
          />
          <Button
            title={portalRunning ? `Vérification ${portalDone}/${portalTotal}…` : 'Vérifier les portails'}
            onPress={verifierPortails}
            loading={portalRunning}
            disabled={!portalInput.trim()}
          />

          {portalRows.map((row, index) => (
            <View key={`${row.host}-${row.port}-${index}`} style={styles.portalRow}>
              <StatusDot tone={row.ok ? 'success' : 'danger'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.portalHost}>
                  {row.host}:{row.port}
                </Text>
                <Text style={styles.portalInfo}>
                  {row.ok
                    ? [row.ip, row.country, row.city, row.org].filter(Boolean).join(' · ')
                    : row.error}
                </Text>
              </View>
              <Badge label={row.ok ? 'OK' : 'Échec'} tone={row.ok ? 'success' : 'danger'} />
            </View>
          ))}
        </Card>
      ) : null}

      {tool === 'mac' ? (
        <>
          <Card>
            <SectionTitle
              title="Générateur de MAC"
              subtitle="Modèle avec * remplacés par un hexadécimal."
            />
            <Field label="Modèle" value={pattern} onChangeText={setPattern} autoCapitalize="characters" />
            <Field label="Nombre" value={count} onChangeText={setCount} keyboardType="number-pad" />
            <Button title="Générer" onPress={genererMacs} />
          </Card>

          {macs.length ? (
            <Card style={{ marginTop: spacing.lg }}>
              <SectionTitle title={`${macs.length} adresse(s)`} />
              <Text selectable style={styles.macList}>
                {macs.join('\n')}
              </Text>
              <View style={styles.inlineButtons}>
                <Button title="Partager" variant="secondary" small onPress={() => Share.share({ message: macs.join('\n') })} style={{ flex: 1 }} />
                <Button
                  title="Enregistrer .txt"
                  variant="secondary"
                  small
                  onPress={() => shareText('mac_addresses.txt', `${macs.join('\n')}\n`, 'text/plain', 'public.plain-text')}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ) : null}
        </>
      ) : null}

      {tool === 'dupes' ? (
        <Card>
          <SectionTitle
            title="Doublons"
            subtitle="Ignore les répétitions Xtream (serveur + identifiant) et Stalker (portail + MAC)."
          />
          <Field
            label="Liste à analyser"
            value={dupeInput}
            onChangeText={(value) => { setDupeInput(value); setDupeResult(null); }}
            placeholder={'Colle des URL M3U ou des lignes « portail MAC »…'}
            multiline
            numberOfLines={8}
          />
          <Button title="Analyser" onPress={analyserDoublons} disabled={!dupeInput.trim()} />
          {dupeResult ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultStats}>
                {dupeResult.total} lignes · {dupeResult.unique} uniques · {dupeResult.duplicates} doublons
              </Text>
              <Text selectable style={styles.dupePreview}>
                {dupeResult.lines.slice(0, 40).join('\n')}
                {dupeResult.lines.length > 40 ? '\n…' : ''}
              </Text>
              <View style={styles.inlineButtons}>
                <Button
                  title="Partager"
                  variant="secondary"
                  small
                  onPress={() => Share.share({ message: dupeResult.lines.join('\n') })}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Enregistrer .txt"
                  variant="secondary"
                  small
                  onPress={() => shareText('sans_doublons.txt', `${dupeResult.lines.join('\n')}\n`, 'text/plain', 'public.plain-text')}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Text style={styles.footnote}>
        Outils repris de l’Inspecteur Xtream : nettoyage de listes, portails, MAC et doublons.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.bgSoft,
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.lg,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radius.sm - 2,
  },
  segmentActive: {
    backgroundColor: colors.cardAlt,
  },
  segmentText: {
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.text,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  miniChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  miniChipText: {
    color: colors.muted,
    fontSize: font.tiny,
    fontWeight: '700',
  },
  miniChipTextActive: {
    color: colors.accent,
  },
  error: {
    color: colors.danger,
    fontSize: font.small,
    marginTop: spacing.sm,
  },
  resultBox: {
    marginTop: spacing.lg,
  },
  resultStats: {
    color: colors.muted,
    fontSize: font.small,
    marginBottom: spacing.md,
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  portalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  portalHost: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  portalInfo: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  macList: {
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  dupePreview: {
    color: colors.muted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 17,
    backgroundColor: colors.bgSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  footnote: {
    color: colors.faint,
    fontSize: font.tiny,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
});
