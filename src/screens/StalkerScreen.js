import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
import { checkStalker, normalizePanel } from '../stalker';
import { loadPortals, rememberPortal } from '../accounts';
import { exportXlsx } from '../excel';
import StalkerBrowser from './StalkerBrowser';
import { colors, font, radius, spacing } from '../theme';

const TONE = { active: 'success', inactive: 'warning', error: 'danger' };
const LABEL = { active: 'Fonctionnel', inactive: 'Expiré', error: 'Erreur' };

function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

async function shareCsv(content, name) {
  const path = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(path, `\uFEFF${content}`, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      dialogTitle: 'Exporter les comptes Stalker',
      UTI: 'public.comma-separated-values-text',
    });
  }
}

function StalkerRow({ item, onPress }) {
  return (
    <Pressable onPress={() => onPress(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <StatusDot tone={TONE[item.kind]} size={9} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowHost} numberOfLines={1}>{item.panel || '—'}</Text>
        <Text style={styles.rowMac}>{item.mac}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Badge label={LABEL[item.kind]} tone={TONE[item.kind]} />
        <Text style={styles.rowMeta}>
          {item.kind === 'error'
            ? item.message
            : item.unlimited
              ? 'Illimité'
              : item.daysLeft === null
                ? '—'
                : `${item.daysLeft} j`}
        </Text>
      </View>
    </Pressable>
  );
}

export default function StalkerScreen({ settings, onAccounts, onRecord }) {
  const [mode, setMode] = useState('single');

  const [panel, setPanel] = useState('');
  const [mac, setMac] = useState('');
  const [portals, setPortals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [listText, setListText] = useState('');
  const [listPanel, setListPanel] = useState('');
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const stopRef = useRef(false);
  const [detail, setDetail] = useState(null);

  React.useEffect(() => {
    loadPortals().then(setPortals);
  }, []);

  const verifier = async () => {
    if (loading) return;
    setError('');
    setResult(null);
    setLoading(true);
    const outcome = await checkStalker(panel, mac, settings);
    setResult(outcome);
    setLoading(false);

    if (outcome.kind === 'error') {
      setError(outcome.message || 'Échec de la vérification.');
      return;
    }

    rememberPortal(panel).then(setPortals);
    onAccounts([
      {
        type: 'stalker',
        server: outcome.panel,
        mac: outcome.mac,
        status: outcome.kind === 'active' ? 'active' : 'expired',
        expiresAt: outcome.expiresRaw,
        lastCheck: new Date().toISOString(),
      },
    ]);
    onRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      mode: 'stalker',
      label: `${outcome.panel} · ${outcome.mac}`,
      total: 1,
      active: outcome.kind === 'active' ? 1 : 0,
      inactive: outcome.kind === 'inactive' ? 1 : 0,
      errors: 0,
    });
  };

  const verifierListe = async () => {
    if (running) return;
    const accounts = [];
    const seen = new Set();
    for (const raw of listText.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const tokens = line.split(/[\s,;|]+/).filter(Boolean);
      let lineMac = '';
      const others = [];
      for (const token of tokens) {
        if (!lineMac && /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(token)) lineMac = token.toUpperCase().replace(/-/g, ':');
        else others.push(token);
      }
      if (!lineMac) continue;
      const linePanel = normalizePanel(others.join(' ') || listPanel).address;
      const key = `${linePanel}|${lineMac}`;
      if (seen.has(key)) continue;
      seen.add(key);
      accounts.push({ panel: linePanel, mac: lineMac });
    }

    if (!accounts.length) {
      Alert.alert('Aucun compte', 'Colle des lignes « portail MAC » ou importe un fichier.');
      return;
    }

    stopRef.current = false;
    setRows([]);
    setDone(0);
    setTotal(accounts.length);
    setRunning(true);

    let index = 0;
    const collected = [];
    const worker = async () => {
      while (true) {
        if (stopRef.current) return;
        const position = index;
        index += 1;
        if (position >= accounts.length) return;
        const account = accounts[position];
        const outcome = await checkStalker(account.panel, account.mac, settings);
        collected.push(outcome);
        setRows((previous) => [...previous, outcome]);
        setDone((value) => value + 1);
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, accounts.length) }, () => worker()));
    setRunning(false);

    onAccounts(
      collected
        .filter((item) => item.kind !== 'error')
        .map((item) => ({
          type: 'stalker',
          server: item.panel,
          mac: item.mac,
          status: item.kind === 'active' ? 'active' : 'expired',
          expiresAt: item.expiresRaw,
          lastCheck: new Date().toISOString(),
        })),
    );

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
      mode: 'stalker',
      label: `${accounts.length} compte(s) Stalker`,
      total: accounts.length,
      active: summary.active || 0,
      inactive: summary.inactive || 0,
      errors: summary.error || 0,
    });
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
      const content = await FileSystem.readAsStringAsync(asset.uri);
      setListText(content);
    } catch (exc) {
      Alert.alert('Import impossible', String(exc.message || exc));
    }
  };

  const exporterExcel = async () => {
    if (!rows.length) return;
    const header = ['Portail', 'MAC', 'Statut', 'Expiration', 'Jours', 'Chaînes', 'Live', 'VOD', 'Séries', 'Erreur'];
    const data = rows.map((item) => [
      item.panel,
      item.mac,
      LABEL[item.kind],
      item.expiresRaw || '',
      item.unlimited ? 'Illimité' : item.daysLeft ?? '',
      item.channels ?? '',
      item.categories?.live?.count ?? '',
      item.categories?.vod?.count ?? '',
      item.categories?.series?.count ?? '',
      item.message || '',
    ]);
    try {
      await exportXlsx('comptes_stalker.xlsx', 'Stalker', header, data);
    } catch (exc) {
      Alert.alert('Export Excel impossible', String(exc.message || exc));
    }
  };

  const exporter = async () => {
    if (!rows.length) return;
    const header = ['Portail', 'MAC', 'Statut', 'Expiration', 'Jours', 'Chaînes', 'Live', 'VOD', 'Séries', 'Erreur'];
    const lines = [header.map(csvCell).join(';')];
    for (const item of rows) {
      lines.push(
        [
          item.panel,
          item.mac,
          LABEL[item.kind],
          item.expiresRaw || '',
          item.unlimited ? 'Illimité' : item.daysLeft ?? '',
          item.channels ?? '',
          item.categories?.live?.count ?? '',
          item.categories?.vod?.count ?? '',
          item.categories?.series?.count ?? '',
          item.message || '',
        ]
          .map(csvCell)
          .join(';'),
      );
    }
    try {
      await shareCsv(lines.join('\n'), 'comptes_stalker.csv');
    } catch (exc) {
      Alert.alert('Export impossible', String(exc.message || exc));
    }
  };

  const header = (
    <View>
      <View style={styles.segmented}>
        {[
          ['single', 'Compte'],
          ['list', 'Liste'],
        ].map(([key, label]) => {
          const selected = mode === key;
          return (
            <Pressable key={key} onPress={() => setMode(key)} style={[styles.segment, selected && styles.segmentActive]}>
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'single' ? (
        <>
          <Card>
            <SectionTitle title="Compte Stalker / Ministra" subtitle="Portail MAG et adresse MAC." />
            {portals.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {portals.slice(0, 8).map((item) => (
                    <Pressable key={item} onPress={() => setPanel(item)} style={styles.portalChip}>
                      <Text style={styles.portalChipText}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : null}
            <Field label="Portail" value={panel} onChangeText={setPanel} placeholder="http://serveur:8080/c/" />
            <Field label="Adresse MAC" value={mac} onChangeText={setMac} placeholder="00:1A:79:12:34:56" autoCapitalize="characters" />
            <Button title={loading ? 'Vérification…' : 'Vérifier le compte'} onPress={verifier} loading={loading} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </Card>

          {result && result.kind !== 'error' ? (
            <Card style={{ marginTop: spacing.lg }}>
              <View style={styles.resultHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultPanel}>{result.panel}</Text>
                  <Text style={styles.resultMac}>{result.mac}</Text>
                </View>
                <Badge label={LABEL[result.kind]} tone={TONE[result.kind]} />
              </View>
              <View style={styles.kv}>
                <KeyValue label="Expiration" value={result.unlimited ? 'Illimitée' : result.expiresRaw || '—'} />
                <KeyValue label="Jours restants" value={result.unlimited ? 'Illimité' : result.daysLeft === null ? '—' : String(result.daysLeft)} />
                <KeyValue label="Chaînes" value={result.channels === null ? '—' : String(result.channels)} />
                <KeyValue
                  label="Catégories"
                  value={`${result.categories.live.count ?? '?'} live · ${result.categories.vod.count ?? '?'} VOD · ${result.categories.series.count ?? '?'} séries`}
                />
              </View>
            </Card>
          ) : null}
          {result && result.kind !== 'error' ? (
            <StalkerBrowser result={result} settings={settings} />
          ) : null}
        </>
      ) : (
        <Card>
          <SectionTitle title="Liste Stalker" subtitle="Une ligne par compte : portail + MAC, ou MAC seul avec le portail par défaut." />
          <Field label="Portail par défaut" value={listPanel} onChangeText={setListPanel} placeholder="http://serveur:8080/c/" />
          <Field
            label="Comptes"
            value={listText}
            onChangeText={setListText}
            placeholder={'http://serveur:8080/c/ 00:1A:79:12:34:56\n00:1A:79:AA:BB:CC'}
            multiline
            numberOfLines={7}
            editable={!running}
          />
          <View style={styles.inlineButtons}>
            <Button title="Importer" variant="secondary" small onPress={importer} disabled={running} style={{ flex: 1 }} />
            <Button title="CSV" variant="secondary" small onPress={exporter} disabled={!rows.length} style={{ flex: 1 }} />
            <Button title="Excel" variant="secondary" small onPress={exporterExcel} disabled={!rows.length} style={{ flex: 1 }} />
          </View>
          <Button
            title={running ? `Vérification ${done}/${total}…` : 'Vérifier la liste'}
            onPress={verifierListe}
            loading={running}
            disabled={!listText.trim()}
          />
          {running ? (
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar value={total ? done / total : 0} />
            </View>
          ) : null}
        </Card>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={mode === 'list' ? rows : []}
        keyExtractor={(item, index) => `${item.panel}-${item.mac}-${index}`}
        renderItem={({ item }) => <StalkerRow item={item} onPress={setDetail} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          mode === 'list' && !rows.length ? (
            <Card style={{ marginTop: spacing.lg }}>
              <EmptyState glyph="▣" title="Aucun résultat" message="Colle une liste de comptes Stalker puis lance la vérification." />
            </Card>
          ) : null
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title="Détail Stalker">
        {detail ? (
          <View>
            <Text style={styles.resultPanel}>{detail.panel}</Text>
            <Text style={styles.resultMac}>{detail.mac}</Text>
            <Badge label={LABEL[detail.kind]} tone={TONE[detail.kind]} style={{ marginTop: spacing.sm }} />
            {detail.kind !== 'error' ? (
              <View style={{ marginTop: spacing.md }}>
                <KeyValue label="Expiration" value={detail.unlimited ? 'Illimitée' : detail.expiresRaw || '—'} />
                <KeyValue label="Jours restants" value={detail.unlimited ? 'Illimité' : String(detail.daysLeft ?? '—')} />
                <KeyValue label="Chaînes" value={String(detail.channels ?? '—')} />
                <KeyValue label="Live" value={String(detail.categories?.live?.count ?? '—')} />
                <KeyValue label="VOD" value={String(detail.categories?.vod?.count ?? '—')} />
                <KeyValue label="Séries" value={String(detail.categories?.series?.count ?? '—')} />
              </View>
            ) : (
              <Text style={styles.error}>{detail.message}</Text>
            )}
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.bgSoft,
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.lg,
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm - 2 },
  segmentActive: { backgroundColor: colors.cardAlt },
  segmentText: { color: colors.muted, fontSize: font.small, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  portalChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  portalChipText: { color: colors.muted, fontSize: font.tiny, fontWeight: '600' },
  inlineButtons: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: font.small, marginTop: spacing.sm },
  resultHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  resultPanel: { color: colors.text, fontSize: font.h2, fontWeight: '800' },
  resultMac: { color: colors.muted, fontSize: font.small, marginTop: 2 },
  kv: { marginTop: spacing.sm },
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
  rowHost: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  rowMac: { color: colors.muted, fontSize: font.small, marginTop: 2 },
  rowMeta: { color: colors.faint, fontSize: font.tiny },
});
