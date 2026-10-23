import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { checkUrl, fetchCategoryCounts, parseM3U } from '../api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KeyValue,
  ProgressBar,
  SectionTitle,
  Sheet,
  StatusDot,
} from '../components';
import { colors, font, radius, spacing } from '../theme';
import { formatTimestamp, shortHost } from '../utils';

const FILTERS = [
  ['all', 'Tous'],
  ['active', 'Actifs'],
  ['inactive', 'Inactifs'],
  ['error', 'Erreurs'],
];

function extractUrls(text) {
  const found = String(text || '').match(/https?:\/\/[^\s"'<>]+/gi) || [];
  const seen = new Set();
  const urls = [];
  let duplicates = 0;

  for (const raw of found) {
    const clean = raw.replace(/[),;\].,]+$/g, '');
    const key = clean.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    urls.push(clean);
  }

  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;

  return { urls, lines, found: found.length, duplicates };
}

function csvCell(value) {
  const text = String(value == null ? '' : value).replace(/"/g, '""');
  return `"${text}"`;
}

function toneOf(kind) {
  if (kind === 'active') return 'success';
  if (kind === 'inactive') return 'warning';
  return 'danger';
}

function labelOf(kind) {
  if (kind === 'active') return 'Actif';
  if (kind === 'inactive') return 'Inactif';
  return 'Erreur';
}

async function shareFile(name, content, mimeType, UTI) {
  const path = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Partage indisponible', 'Le partage de fichiers n’est pas disponible sur cet appareil.');
    return null;
  }
  await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Exporter les résultats', UTI });
  return path;
}

function ResultRow({ item, onPress }) {
  const host = item.host || shortHost((item.url.match(/^https?:\/\/[^/]+/i) || [''])[0]);
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <StatusDot tone={toneOf(item.kind)} size={9} />
      <View style={styles.rowMain}>
        <Text style={styles.rowHost} numberOfLines={1}>
          {host || '—'}
        </Text>
        <Text style={styles.rowUser} numberOfLines={1}>
          {item.username || item.message || '—'}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Badge label={labelOf(item.kind)} tone={toneOf(item.kind)} />
        <Text style={styles.rowDuration}>{item.duration ? `${item.duration} ms` : ''}</Text>
      </View>
    </Pressable>
  );
}

export default function BulkScreen({ settings, onRecord, activeTab }) {
  const [text, setText] = useState('');
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailCats, setDetailCats] = useState(null);
  const stopRef = useRef(false);

  const counts = useMemo(() => {
    return results.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.kind] += 1;
        return acc;
      },
      { total: 0, active: 0, inactive: 0, error: 0 },
    );
  }, [results]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return results.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (!needle) return true;
      return `${item.host || ''} ${item.username || ''} ${item.url || ''} ${item.message || ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [results, filter, query]);

  const analyser = () => {
    const parsed = extractUrls(text);
    setStats(parsed);
    if (!parsed.urls.length) {
      Alert.alert('Aucune URL', 'Colle des URL M3U ou importe un fichier .txt.');
      return null;
    }
    return parsed;
  };

  const importer = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/*', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets && picked.assets[0];
      if (!asset) return;
      if (asset.size && asset.size > 8 * 1024 * 1024) {
        Alert.alert('Fichier trop volumineux', 'Limite : 8 Mo.');
        return;
      }
      const content = await FileSystem.readAsStringAsync(asset.uri);
      setText(content);
      setStats(extractUrls(content));
    } catch (error) {
      Alert.alert('Import impossible', String(error.message || error));
    }
  };

  const verifier = async () => {
    if (running) return;
    const parsed = stats && stats.urls && stats.urls.length ? stats : analyser();
    if (!parsed) return;

    stopRef.current = false;
    setStopping(false);
    setResults([]);
    setDone(0);
    setTotal(parsed.urls.length);
    setRunning(true);
    setFilter('all');
    setQuery('');

    let index = 0;
    const collected = [];
    const worker = async () => {
      while (true) {
        if (stopRef.current) return;
        const position = index;
        index += 1;
        if (position >= parsed.urls.length) return;
        const outcome = await checkUrl(parsed.urls[position], settings);
        collected.push(outcome);
        setResults((previous) => [...previous, outcome]);
        setDone((value) => value + 1);
      }
    };

    const parallel = Math.max(1, Math.min(Number(settings.concurrency) || 5, 10));
    await Promise.all(
      Array.from({ length: Math.min(parallel, parsed.urls.length) }, () => worker()),
    );

    setRunning(false);
    setStopping(false);

    const summary = collected.reduce(
      (acc, item) => {
        acc[item.kind] = (acc[item.kind] || 0) + 1;
        return acc;
      },
      { active: 0, inactive: 0, error: 0 },
    );

    onRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      mode: 'bulk',
      label: `${parsed.urls.length} URL`,
      total: parsed.urls.length,
      active: summary.active || 0,
      inactive: summary.inactive || 0,
      errors: summary.error || 0,
    });
  };

  const arreter = () => {
    stopRef.current = true;
    setStopping(true);
  };

  const exporterTxt = async () => {
    const actives = results.filter((item) => item.kind === 'active');
    if (!actives.length) {
      Alert.alert('Aucun compte actif', 'Rien à exporter pour le moment.');
      return;
    }
    try {
      await shareFile('comptes_actifs.txt', actives.map((item) => item.url).join('\n'), 'text/plain', 'public.plain-text');
    } catch (error) {
      Alert.alert('Export impossible', String(error.message || error));
    }
  };

  const exporterCsv = async () => {
    if (!results.length) {
      Alert.alert('Aucun résultat', 'Lance une vérification avant d’exporter.');
      return;
    }
    const header = [
      'URL',
      'Serveur',
      'Identifiant',
      'Statut',
      'Expiration',
      'Connexions max',
      'Connexions actives',
      'Essai',
      'Formats',
      'Erreur',
    ];
    const lines = [header.map(csvCell).join(';')];
    for (const item of results) {
      const info = item.info || {};
      lines.push(
        [
          item.url,
          item.host || '',
          item.username || '',
          item.kind === 'active' ? 'Actif' : item.kind === 'inactive' ? 'Inactif' : 'Erreur',
          formatTimestamp(info.exp_date),
          info.max_connections ?? '',
          info.active_cons ?? '',
          String(info.is_trial) === '1' ? 'Oui' : 'Non',
          Array.isArray(info.allowed_output_formats) ? info.allowed_output_formats.join(', ') : '',
          item.message || '',
        ]
          .map(csvCell)
          .join(';'),
      );
    }
    try {
      await shareFile('comptes_xtream.csv', `\uFEFF${lines.join('\n')}`, 'text/csv', 'public.comma-separated-values-text');
    } catch (error) {
      Alert.alert('Export impossible', String(error.message || error));
    }
  };

  const ouvrirDetail = async (item) => {
    setDetail(item);
    setDetailCats(null);
    if (item.kind === 'active') {
      try {
        const credentials = parseM3U(item.url);
        const cats = await fetchCategoryCounts(credentials, settings);
        setDetailCats(cats);
      } catch {
        setDetailCats(null);
      }
    }
  };

  const header = (
    <View>
      <Card>
        <SectionTitle
          title="Fichier TXT / M3U"
          subtitle="Colle les URL ou importe un fichier, puis vérifie en lot."
        />
        <Field
          label="URL à vérifier"
          value={text}
          onChangeText={(value) => { setText(value); setStats(null); }}
          placeholder={'http://serveur:8080/get.php?username=…&password=…\nhttp://autre…'}
          multiline
          numberOfLines={8}
          editable={!running}
        />

        <View style={styles.inlineButtons}>
          <Button title="Importer un .txt" variant="secondary" onPress={importer} small disabled={running} />
          <Button title="Analyser" variant="secondary" onPress={analyser} small disabled={running || !text.trim()} />
        </View>

        {stats ? (
          <Text style={styles.statsLine}>
            {stats.lines} lignes · {stats.found} URL · {stats.urls.length} uniques
            {stats.duplicates ? ` · ${stats.duplicates} doublons` : ''}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          {running ? (
            <Button title={stopping ? 'Arrêt…' : 'Arrêter'} variant="danger" onPress={arreter} small disabled={stopping} style={{ flex: 1 }} />
          ) : (
            <Button
              title="Vérifier les comptes"
              onPress={verifier}
              small
              disabled={!text.trim()}
              style={{ flex: 1 }}
            />
          )}
        </View>

        {running || total > 0 ? (
          <View style={styles.progressZone}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressText}>
                {done}/{total} vérifiés
              </Text>
              <Text style={styles.progressText}>
                {counts.active} actifs · {counts.inactive} inactifs · {counts.error} erreurs
              </Text>
            </View>
            <ProgressBar value={total ? done / total : 0} />
          </View>
        ) : null}
      </Card>

      {results.length ? (
        <>
          <View style={styles.filters}>
            {FILTERS.map(([key, label]) => {
              const selected = filter === key;
              const count = key === 'all' ? counts.total : counts[key];
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {label} {count}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher un serveur ou un identifiant…"
            autoCapitalize="none"
          />

          <View style={styles.exportRow}>
            <Button title="Exporter TXT (actifs)" variant="secondary" onPress={exporterTxt} small style={{ flex: 1 }} />
            <Button title="Exporter CSV" variant="secondary" onPress={exporterCsv} small style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <Card style={{ marginTop: spacing.lg }}>
          <EmptyState
            glyph="≡"
            title="Aucun résultat"
            message="Colle des URL M3U, importe un fichier TXT puis lance la vérification."
          />
        </Card>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={filtered}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        renderItem={({ item }) => <ResultRow item={item} onPress={ouvrirDetail} />}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: spacing.xxl }} />}
      />

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title="Détail du compte">
        {detail ? (
          <View>
            <View style={styles.detailHead}>
              <Text style={styles.detailHost}>{detail.host || '—'}</Text>
              <Badge label={labelOf(detail.kind)} tone={toneOf(detail.kind)} />
            </View>
            <Text selectable style={styles.detailUrl}>
              {detail.url}
            </Text>

            {detail.info ? (
              <View style={{ marginTop: spacing.md }}>
                <KeyValue label="Identifiant" value={detail.username || '—'} />
                <KeyValue label="Statut" value={detail.info.status || '—'} />
                <KeyValue label="Expiration" value={formatTimestamp(detail.info.exp_date)} />
                <KeyValue label="Connexions max." value={String(detail.info.max_connections ?? '—')} />
                <KeyValue label="Connexions actives" value={String(detail.info.active_cons ?? '—')} />
                <KeyValue label="Essai" value={String(detail.info.is_trial) === '1' ? 'Oui' : 'Non'} />
              </View>
            ) : null}

            {detail.kind === 'error' ? (
              <View style={styles.detailError}>
                <Text style={styles.detailErrorText}>{detail.message}</Text>
              </View>
            ) : null}

            {detail.kind === 'active' ? (
              <View style={styles.detailCats}>
                <Text style={styles.detailCatsTitle}>Catégories</Text>
                {detailCats ? (
                  <Text style={styles.detailCatsText}>
                    {detailCats.live ?? '?'} chaînes · {detailCats.vod ?? '?'} films · {detailCats.series ?? '?'} séries
                  </Text>
                ) : (
                  <Text style={styles.detailCatsText}>Chargement…</Text>
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.lg,
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statsLine: {
    color: colors.muted,
    fontSize: font.small,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  progressZone: {
    marginTop: spacing.lg,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    color: colors.muted,
    fontSize: font.tiny,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.accent,
  },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowMain: {
    flex: 1,
  },
  rowHost: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  rowUser: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowDuration: {
    color: colors.faint,
    fontSize: font.tiny,
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailHost: {
    color: colors.text,
    fontSize: font.h2,
    fontWeight: '800',
    flexShrink: 1,
  },
  detailUrl: {
    color: colors.faint,
    fontSize: font.tiny,
    marginTop: 6,
  },
  detailError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  detailErrorText: {
    color: colors.danger,
    fontSize: font.small,
  },
  detailCats: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailCatsTitle: {
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  detailCatsText: {
    color: colors.text,
    fontSize: font.body,
  },
});
