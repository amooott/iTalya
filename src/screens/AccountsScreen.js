import React, { useEffect, useMemo, useState } from 'react';
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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KeyValue,
  SectionTitle,
  Sheet,
} from '../components';
import { checkAccount } from '../api';
import { checkStalker } from '../stalker';
import {
  deleteAccounts,
  loadAccounts,
  removeDuplicateAccounts,
  updateAccount,
  upsertAccounts,
} from '../accounts';
import { clearHistory, loadHistory } from '../storage';
import { colors, font, radius, spacing } from '../theme';
import { formatDateTime, formatTimestamp, shortHost } from '../utils';

function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

async function shareCsv(content, name) {
  const path = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(path, `\uFEFF${content}`, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'text/csv',
      dialogTitle: 'Exporter les comptes',
      UTI: 'public.comma-separated-values-text',
    });
  }
}

function statusTone(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 'success';
  if (value === 'expired' || value === 'inactive') return 'warning';
  return 'danger';
}

function statusLabel(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 'Actif';
  if (value === 'expired' || value === 'inactive') return 'Expiré';
  return 'Erreur';
}

function AccountRow({ item, onPress }) {
  const server = shortHost(item.server);
  return (
    <Pressable onPress={() => onPress(item)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Badge label={item.type === 'stalker' ? 'Stalker' : 'Xtream'} tone={item.type === 'stalker' ? 'accent' : 'muted'} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.rowServer} numberOfLines={1}>{server || '—'}</Text>
        <Text style={styles.rowUser} numberOfLines={1}>
          {item.type === 'stalker' ? item.mac : item.username}
          {item.label ? ` · ${item.label}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Badge label={statusLabel(item.status)} tone={statusTone(item.status)} />
        <Text style={styles.rowDate}>{formatDateTime(item.lastCheck)}</Text>
      </View>
    </Pressable>
  );
}

export default function AccountsScreen({ active, refreshKey, settings, onChanged }) {
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [detail, setDetail] = useState(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setAccounts(await loadAccounts());
    setHistory(await loadHistory());
  };

  useEffect(() => {
    if (active) reload();
  }, [active, refreshKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts.filter((item) => {
      if (type !== 'all' && item.type !== type) return false;
      if (!needle) return true;
      return `${item.server} ${item.username || ''} ${item.mac || ''} ${item.label || ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [accounts, query, type]);

  const openDetail = (item) => {
    setDetail(item);
    setLabel(item.label || '');
  };

  const enregistrerEtiquette = async () => {
    if (!detail) return;
    await updateAccount(detail.key, { label: label.trim().slice(0, 60) });
    setDetail({ ...detail, label: label.trim().slice(0, 60) });
    await reload();
    onChanged?.();
  };

  const revérifier = async () => {
    if (!detail || busy) return;
    setBusy(true);
    try {
      let patch;
      if (detail.type === 'stalker') {
        const outcome = await checkStalker(detail.server, detail.mac, settings);
        patch = {
          status: outcome.kind === 'error' ? 'error' : outcome.kind === 'active' ? 'active' : 'expired',
          expiresAt: outcome.expiresRaw || '',
          lastCheck: new Date().toISOString(),
        };
      } else {
        const outcome = await checkAccount(
          { host: detail.server, username: detail.username, password: detail.password },
          settings,
        );
        patch = {
          status: String(outcome.info.status || '').toLowerCase() === 'active' ? 'active' : 'expired',
          expiresAt: outcome.info.exp_date || '',
          lastCheck: new Date().toISOString(),
        };
      }
      await updateAccount(detail.key, patch);
      setDetail({ ...detail, ...patch });
      await reload();
      onChanged?.();
    } catch (error) {
      Alert.alert('Revérification impossible', String(error.message || error));
    } finally {
      setBusy(false);
    }
  };

  const supprimer = () => {
    if (!detail) return;
    Alert.alert('Supprimer ce compte ?', `${detail.server}`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteAccounts([detail.key]);
          setDetail(null);
          await reload();
          onChanged?.();
        },
      },
    ]);
  };

  const doublons = async () => {
    const result = await removeDuplicateAccounts();
    await reload();
    onChanged?.();
    Alert.alert('Doublons', `${result.removed} doublon(s) supprimé(s), ${result.list.length} compte(s) restant(s).`);
  };

  const exporter = async () => {
    if (!filtered.length) return;
    const header = ['Type', 'Serveur', 'Identifiant', 'MAC', 'Étiquette', 'Statut', 'Expiration', 'Dernière vérification'];
    const lines = [header.map(csvCell).join(';')];
    for (const item of filtered) {
      lines.push(
        [
          item.type === 'stalker' ? 'Stalker' : 'Xtream',
          item.server,
          item.username || '',
          item.mac || '',
          item.label || '',
          statusLabel(item.status),
          item.type === 'stalker' ? item.expiresAt || '' : formatTimestamp(item.expiresAt),
          formatDateTime(item.lastCheck),
        ]
          .map(csvCell)
          .join(';'),
      );
    }
    try {
      await shareCsv(lines.join('\n'), 'mes_comptes.csv');
    } catch (error) {
      Alert.alert('Export impossible', String(error.message || error));
    }
  };

  const viderHistorique = () => {
    Alert.alert('Vider l’historique ?', 'Les résumés enregistrés seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Vider',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setHistory([]);
        },
      },
    ]);
  };

  const header = (
    <View>
      <View style={styles.segmented}>
        {[
          ['accounts', 'Comptes'],
          ['history', 'Historique'],
        ].map(([key, text]) => {
          const selected = tab === key;
          return (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.segment, selected && styles.segmentActive]}>
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{text}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'accounts' ? (
        <>
          <Card>
            <SectionTitle title="Mes comptes" subtitle={`${accounts.length} compte(s) vérifié(s) enregistré(s).`} />
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un serveur, un identifiant, une étiquette…"
              autoCapitalize="none"
            />
            <View style={styles.chips}>
              {[
                ['all', 'Tous'],
                ['xtream', 'Xtream'],
                ['stalker', 'Stalker'],
              ].map(([key, text]) => {
                const selected = type === key;
                return (
                  <Pressable key={key} onPress={() => setType(key)} style={[styles.chip, selected && styles.chipActive]}>
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{text}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.actions}>
              <Button title="Exporter CSV" variant="secondary" small onPress={exporter} style={{ flex: 1 }} />
              <Button title="Doublons" variant="secondary" small onPress={doublons} style={{ flex: 1 }} />
            </View>
          </Card>
        </>
      ) : (
        <Card>
          <SectionTitle
            title="Historique"
            subtitle="30 dernières vérifications."
            right={history.length ? <Button title="Vider" variant="ghost" small onPress={viderHistorique} /> : null}
          />
          {history.length === 0 ? (
            <EmptyState glyph="◷" title="Aucune vérification" message="Les comptes testés apparaîtront ici." />
          ) : (
            history.map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyLabel} numberOfLines={1}>{entry.label}</Text>
                  <Text style={styles.historyDate}>{formatDateTime(entry.at)}</Text>
                </View>
                <Badge label={entry.mode === 'bulk' ? 'Lot' : entry.mode === 'stalker' ? 'Stalker' : 'Compte'} tone="accent" />
                <Text style={styles.historyCounts}>
                  {entry.active} / {entry.total}
                </Text>
              </View>
            ))
          )}
        </Card>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={tab === 'accounts' ? filtered : []}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <AccountRow item={item} onPress={openDetail} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          tab === 'accounts' && !filtered.length ? (
            <Card style={{ marginTop: spacing.lg }}>
              <EmptyState
                glyph="▤"
                title={accounts.length ? 'Aucun résultat' : 'Aucun compte enregistré'}
                message={accounts.length ? 'Essaie une autre recherche.' : 'Vérifie un compte Xtream ou Stalker pour l’ajouter ici.'}
              />
            </Card>
          ) : null
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title="Compte">
        {detail ? (
          <View>
            <Text style={styles.detailServer}>{shortHost(detail.server)}</Text>
            <Text style={styles.detailUser}>{detail.type === 'stalker' ? detail.mac : detail.username}</Text>
            <Badge label={statusLabel(detail.status)} tone={statusTone(detail.status)} style={{ marginTop: spacing.sm }} />

            <View style={{ marginTop: spacing.md }}>
              <KeyValue label="Type" value={detail.type === 'stalker' ? 'Stalker / Ministra' : 'Xtream Codes'} />
              <KeyValue
                label="Expiration"
                value={detail.type === 'stalker' ? detail.expiresAt || '—' : formatTimestamp(detail.expiresAt)}
              />
              <KeyValue label="Dernière vérification" value={formatDateTime(detail.lastCheck)} />
            </View>

            <Field
              label="Étiquette (60 caractères max)"
              value={label}
              onChangeText={setLabel}
              placeholder="client, perso…"
              autoCapitalize="sentences"
            />

            <View style={styles.detailActions}>
              <Button title="Enregistrer" variant="secondary" small onPress={enregistrerEtiquette} style={{ flex: 1 }} />
              <Button title={busy ? 'Vérification…' : 'Revérifier'} small onPress={revérifier} loading={busy} style={{ flex: 1 }} />
            </View>
            <Button title="Supprimer" variant="danger" small onPress={supprimer} style={{ marginTop: spacing.sm }} />
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
  chips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: font.tiny, fontWeight: '700' },
  chipTextActive: { color: colors.accent },
  actions: { flexDirection: 'row', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowServer: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  rowUser: { color: colors.muted, fontSize: font.small, marginTop: 2 },
  rowDate: { color: colors.faint, fontSize: font.tiny },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyLabel: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  historyDate: { color: colors.faint, fontSize: font.tiny, marginTop: 3 },
  historyCounts: { color: colors.muted, fontSize: font.tiny, minWidth: 42, textAlign: 'right' },
  detailServer: { color: colors.text, fontSize: font.h2, fontWeight: '800' },
  detailUser: { color: colors.muted, fontSize: font.small, marginTop: 2 },
  detailActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
