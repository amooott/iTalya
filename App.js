import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CheckScreen from './src/screens/CheckScreen';
import BulkScreen from './src/screens/BulkScreen';
import StalkerScreen from './src/screens/StalkerScreen';
import AccountsScreen from './src/screens/AccountsScreen';
import ToolsScreen from './src/screens/ToolsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { addHistory, loadSettings } from './src/storage';
import { upsertAccounts } from './src/accounts';
import { colors, font, radius, spacing } from './src/theme';

const TABS = [
  { key: 'check', glyph: '⌕', label: 'Vérifier' },
  { key: 'bulk', glyph: '≡', label: 'Lot' },
  { key: 'stalker', glyph: '▣', label: 'Stalker' },
  { key: 'accounts', glyph: '▤', label: 'Comptes' },
  { key: 'tools', glyph: '✦', label: 'Outils' },
  { key: 'settings', glyph: '⚙', label: 'Réglages' },
];

function Main() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState('check');
  const [accountKey, setAccountKey] = useState(0);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const record = async (entry) => {
    await addHistory(entry);
  };

  const rememberAccounts = async (records) => {
    if (!records || !records.length) return;
    await upsertAccounts(records);
    setAccountKey((value) => value + 1);
  };

  if (!settings) {
    return (
      <View style={styles.loading}>
        <View style={styles.logoLarge}>
          <Text style={styles.logoLargeText}>iT</Text>
        </View>
        <Text style={styles.loadingTitle}>iTalya</Text>
        <Text style={styles.loadingSubtitle}>Inspecteur Xtream</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>iT</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.brand}>iTalya</Text>
          <Text style={styles.tagline}>Inspecteur Xtream</Text>
        </View>
        <View style={styles.versionPill}>
          <Text style={styles.versionText}>v1.1</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={[styles.pane, tab !== 'check' && styles.hidden]}>
          <CheckScreen settings={settings} onRecord={record} onAccounts={rememberAccounts} />
        </View>
        <View style={[styles.pane, tab !== 'bulk' && styles.hidden]}>
          <BulkScreen settings={settings} onRecord={record} onAccounts={rememberAccounts} />
        </View>
        <View style={[styles.pane, tab !== 'stalker' && styles.hidden]}>
          <StalkerScreen settings={settings} onAccounts={rememberAccounts} onRecord={record} />
        </View>
        <View style={[styles.pane, tab !== 'accounts' && styles.hidden]}>
          <AccountsScreen
            active={tab === 'accounts'}
            refreshKey={accountKey}
            settings={settings}
            onChanged={() => setAccountKey((value) => value + 1)}
          />
        </View>
        <View style={[styles.pane, tab !== 'tools' && styles.hidden]}>
          <ToolsScreen />
        </View>
        <View style={[styles.pane, tab !== 'settings' && styles.hidden]}>
          <SettingsScreen settings={settings} onSave={setSettings} />
        </View>
      </View>

      <View style={[styles.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((item) => {
          const selected = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
            >
              <Text style={[styles.tabGlyph, selected && styles.tabGlyphActive]}>{item.glyph}</Text>
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Main />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  logoText: {
    color: '#F59E0B',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerText: {
    flex: 1,
  },
  brand: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  tagline: {
    color: colors.muted,
    fontSize: font.tiny,
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  versionPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  versionText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  pane: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgSoft,
    paddingTop: 8,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabGlyph: {
    color: colors.faint,
    fontSize: 17,
    lineHeight: 20,
  },
  tabGlyphActive: {
    color: colors.accent,
  },
  tabLabel: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabLabelActive: {
    color: colors.accent,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  logoLarge: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoLargeText: {
    color: '#F59E0B',
    fontSize: 30,
    fontWeight: '800',
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  loadingSubtitle: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
});
