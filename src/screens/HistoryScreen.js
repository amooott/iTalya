import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, EmptyState, SectionTitle } from '../components';
import { clearHistory, loadHistory } from '../storage';
import { colors, font, spacing } from '../theme';
import { formatDateTime } from '../utils';

export default function HistoryScreen({ active, refreshKey }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!active) return undefined;
    loadHistory().then((items) => {
      if (mounted) {
        setEntries(items);
        setLoaded(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [active, refreshKey]);

  const vider = () => {
    Alert.alert('Vider l’historique ?', 'Les résumés enregistrés seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Vider',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setEntries([]);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <SectionTitle
          title="Historique"
          subtitle="30 dernières vérifications, stockées sur l’appareil."
          right={entries.length ? <Button title="Vider" variant="ghost" small onPress={vider} /> : null}
        />
        {!loaded ? (
          <Text style={styles.muted}>Chargement…</Text>
        ) : entries.length === 0 ? (
          <EmptyState
            glyph="◷"
            title="Aucune vérification"
            message="Les comptes testés apparaîtront ici avec leur résultat."
          />
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <View style={styles.entryHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryLabel} numberOfLines={1}>
                    {entry.label}
                  </Text>
                  <Text style={styles.entryDate}>{formatDateTime(entry.at)}</Text>
                </View>
                <Badge label={entry.mode === 'bulk' ? 'Lot' : 'Compte'} tone={entry.mode === 'bulk' ? 'accent' : 'muted'} />
              </View>
              <View style={styles.counts}>
                <Text style={[styles.count, { color: colors.success }]}>{entry.active} actif(s)</Text>
                <Text style={[styles.count, { color: colors.warning }]}>{entry.inactive} inactif(s)</Text>
                <Text style={[styles.count, { color: colors.danger }]}>{entry.errors} erreur(s)</Text>
                <Text style={styles.count}>{entry.total} testé(s)</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  muted: {
    color: colors.muted,
    fontSize: font.small,
  },
  entry: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  entryLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: '600',
  },
  entryDate: {
    color: colors.faint,
    fontSize: font.tiny,
    marginTop: 3,
  },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  count: {
    color: colors.muted,
    fontSize: font.tiny,
    fontWeight: '600',
  },
});
