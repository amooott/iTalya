import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchStalkerItems, testStalkerItem } from '../stalker';
import { Badge, Button, Card, ProgressBar, SectionTitle } from '../components';
import { colors, font, radius, spacing } from '../theme';

const KINDS = [
  ['live', 'Live'],
  ['vod', 'Films'],
  ['series', 'Séries'],
];

const LIMITS = [
  [5, '5'],
  [10, '10'],
  [25, '25'],
  ['all', 'Tous'],
];

export default function StalkerBrowser({ result, settings }) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState('live');
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(10);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [testingId, setTestingId] = useState('');
  const stopRef = useRef(false);

  const categories = (result.categories && result.categories[kind] && result.categories[kind].cats) || [];

  const summary = useMemo(() => {
    const values = Object.values(results);
    return {
      ok: values.filter((item) => item.ok).length,
      fail: values.filter((item) => !item.ok).length,
      tested: values.length,
    };
  }, [results]);

  const ouvrir = async () => {
    if (!selected) return;
    setOpen(true);
    setItems([]);
    setLoading(true);
    setError('');
    setResults({});
    setDone(0);
    setTotal(0);
    stopRef.current = false;
    try {
      const list = await fetchStalkerItems(
        result.panel,
        result.mac,
        result.token,
        kind,
        selected.id,
        settings,
      );
      setItems(list);
    } catch (exc) {
      setError(exc.message || 'Éléments illisibles.');
    } finally {
      setLoading(false);
    }
  };

  const testerUn = async (item) => {
    setTestingId(item.id);
    const outcome = await testStalkerItem(result.panel, result.mac, result.token, kind, item, settings);
    setResults((previous) => ({ ...previous, [item.id]: outcome }));
    setTestingId('');
  };

  const lancer = async () => {
    if (running || !items.length) return;
    const targets = limit === 'all' ? items : items.slice(0, Number(limit));
    stopRef.current = false;
    setResults({});
    setDone(0);
    setTotal(targets.length);
    setRunning(true);

    let index = 0;
    const worker = async () => {
      while (true) {
        if (stopRef.current) return;
        const position = index;
        index += 1;
        if (position >= targets.length) return;
        const item = targets[position];
        const outcome = await testStalkerItem(result.panel, result.mac, result.token, kind, item, settings);
        setResults((previous) => ({ ...previous, [item.id]: outcome }));
        setDone((value) => value + 1);
      }
    };

    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, () => worker()));
    setRunning(false);
  };

  const partager = async () => {
    const lines = Object.entries(results).map(([id, outcome]) => {
      const item = items.find((entry) => entry.id === id);
      return `[${outcome.ok ? 'OK' : 'ÉCHEC'}] ${item ? item.name : id} | ${outcome.detail}`;
    });
    if (lines.length) await Share.share({ message: lines.join('\n') });
  };

  const fermer = () => {
    stopRef.current = true;
    setRunning(false);
    setOpen(false);
  };

  return (
    <>
      <Card style={{ marginTop: spacing.lg }}>
        <SectionTitle title="Tester les flux" subtitle="Catégories du compte, éléments et liens create_link." />

        <View style={styles.kinds}>
          {KINDS.map(([key, label]) => {
            const active = kind === key;
            const count = result.categories?.[key]?.count;
            return (
              <Pressable
                key={key}
                onPress={() => { setKind(key); setSelected(null); }}
                style={[styles.kindChip, active && styles.kindChipActive]}
              >
                <Text style={[styles.kindText, active && styles.kindTextActive]}>
                  {label}{count !== undefined && count !== null ? ` (${count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {categories.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {categories.map((category) => {
                const active = selected && selected.id === category.id;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => setSelected(category)}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                  >
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]} numberOfLines={1}>
                      {category.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <Text style={styles.hint}>Aucune catégorie disponible pour ce type.</Text>
        )}

        <Button
          title={selected ? `Afficher « ${selected.title} »` : 'Choisis une catégorie'}
          variant="secondary"
          onPress={ouvrir}
          disabled={!selected}
        />
      </Card>

      <Modal visible={open} animationType="slide" onRequestClose={fermer}>
        <SafeAreaView style={styles.modal} edges={['top', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <Pressable onPress={fermer} hitSlop={10}>
              <Text style={styles.close}>Fermer</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selected ? selected.title : 'Catégorie'}</Text>
              <Text style={styles.modalSub}>{items.length} élément(s)</Text>
            </View>
            <Pressable onPress={partager} hitSlop={10} disabled={!summary.tested}>
              <Text style={[styles.close, !summary.tested && { opacity: 0.35 }]}>Partager</Text>
            </Pressable>
          </View>

          <View style={styles.toolbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {LIMITS.map(([value, label]) => {
                  const active = limit === value;
                  return (
                    <Pressable
                      key={String(value)}
                      onPress={() => setLimit(value)}
                      disabled={running}
                      style={[styles.limitChip, active && styles.limitChipActive]}
                    >
                      <Text style={[styles.limitText, active && styles.limitTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
              {running ? (
                <Button title={`Arrêter (${done}/${total})`} variant="danger" small onPress={() => { stopRef.current = true; }} style={{ flex: 1 }} />
              ) : (
                <Button
                  title={limit === 'all' ? `Tester les ${items.length}` : `Tester ${Math.min(Number(limit), items.length)}`}
                  small
                  onPress={lancer}
                  disabled={!items.length}
                  style={{ flex: 1 }}
                />
              )}
            </View>

            {total > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar value={total ? done / total : 0} />
                <Text style={styles.summary}>{summary.ok} OK · {summary.fail} échec(s) · {done}/{total}</Text>
              </View>
            ) : null}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xxl }} />
          ) : error ? (
            <Text style={[styles.error, { padding: spacing.lg }]}>{error}</Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
              renderItem={({ item, index }) => {
                const outcome = results[item.id];
                return (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemIndex}>{index + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                      {outcome ? (
                        <Text
                          style={[styles.itemDetail, { color: outcome.ok ? colors.success : colors.danger }]}
                          numberOfLines={2}
                        >
                          {outcome.detail}
                        </Text>
                      ) : null}
                    </View>
                    {testingId === item.id ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : outcome ? (
                      <Pressable onPress={() => testerUn(item)} hitSlop={8}>
                        <Badge label={outcome.ok ? 'OK' : 'Échec'} tone={outcome.ok ? 'success' : 'danger'} />
                      </Pressable>
                    ) : (
                      <Button title="Tester" variant="secondary" small onPress={() => testerUn(item)} />
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.hint, { textAlign: 'center', marginTop: spacing.xxl }]}>
                  Aucun élément dans cette catégorie.
                </Text>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  kinds: {
    flexDirection: 'row',
    backgroundColor: colors.bgSoft,
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.md,
  },
  kindChip: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: radius.sm - 2 },
  kindChipActive: { backgroundColor: colors.cardAlt },
  kindText: { color: colors.muted, fontSize: font.small, fontWeight: '600' },
  kindTextActive: { color: colors.text },
  categoryChip: {
    maxWidth: 190,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSoft,
  },
  categoryChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  categoryText: { color: colors.muted, fontSize: font.small, fontWeight: '600' },
  categoryTextActive: { color: colors.accent },
  hint: { color: colors.faint, fontSize: font.small, marginBottom: spacing.md },
  error: { color: colors.danger, fontSize: font.small, marginVertical: spacing.md },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  close: { color: colors.accent, fontSize: font.small, fontWeight: '700' },
  modalTitle: { color: colors.text, fontSize: font.h3, fontWeight: '800' },
  modalSub: { color: colors.muted, fontSize: font.tiny, marginTop: 2 },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  limitChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  limitChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  limitText: { color: colors.muted, fontSize: font.tiny, fontWeight: '700' },
  limitTextActive: { color: colors.accent },
  summary: { color: colors.muted, fontSize: font.tiny, marginTop: 6 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  itemIndex: { color: colors.faint, fontSize: font.tiny, width: 28, textAlign: 'right' },
  itemName: { color: colors.text, fontSize: font.body, fontWeight: '600' },
  itemDetail: { fontSize: font.tiny, marginTop: 2 },
});
