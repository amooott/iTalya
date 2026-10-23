import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ApiError,
  checkAccount,
  fetchCategoryCounts,
  normalizeHost,
  parseM3U,
  testStream,
} from '../api';
import { Badge, Button, Card, Field, KeyValue, SectionTitle, Stat, StatusDot } from '../components';
import { colors, font, radius, spacing } from '../theme';
import {
  daysRemaining,
  expiryTone,
  formatTimestamp,
  shortHost,
  statusLabel,
  statusTone,
} from '../utils';

function Segmented({ mode, onChange }) {
  return (
    <View style={styles.segmented}>
      {[
        ['url', 'URL M3U'],
        ['server', 'Serveur'],
      ].map(([key, label]) => {
        const active = mode === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function CheckScreen({ settings, onRecord }) {
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [categories, setCategories] = useState(null);

  const [streamUrl, setStreamUrl] = useState('');
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamResult, setStreamResult] = useState(null);

  const reset = () => {
    setResult(null);
    setCategories(null);
    setError('');
    setStreamResult(null);
    setStreamUrl('');
  };

  const verifier = async () => {
    if (loading) return;
    setError('');
    setResult(null);
    setCategories(null);
    setStreamResult(null);

    let credentials;
    try {
      if (mode === 'url') {
        credentials = parseM3U(url);
      } else {
        const cleanHost = normalizeHost(host);
        if (!username.trim() || !password) {
          throw new ApiError('credentials', 'Identifiant et mot de passe requis.');
        }
        credentials = { host: cleanHost, username: username.trim(), password };
      }
    } catch (exc) {
      setError(exc.message || 'Informations incomplètes.');
      return;
    }

    setLoading(true);
    try {
      const { info } = await checkAccount(credentials, settings);
      setResult({ credentials, info });
      setLoading(false);

      const active = String(info.status || '').toLowerCase() === 'active';
      onRecord({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: new Date().toISOString(),
        mode: 'single',
        label: `${shortHost(credentials.host)} · ${credentials.username}`,
        total: 1,
        active: active ? 1 : 0,
        inactive: active ? 0 : 1,
        errors: 0,
      });

      if (active) {
        fetchCategoryCounts(credentials, settings)
          .then(setCategories)
          .catch(() => setCategories(null));
      }
    } catch (exc) {
      setError(exc.message || 'Échec de la connexion.');
      setLoading(false);
    }
  };

  const testerFlux = async () => {
    setStreamLoading(true);
    setStreamResult(null);
    const outcome = await testStream(streamUrl, settings);
    setStreamResult(outcome);
    setStreamLoading(false);
  };

  const info = result ? result.info : null;
  const active = info && String(info.status || '').toLowerCase() === 'active';
  const expiration = info ? formatTimestamp(info.exp_date) : '';
  const tone = info ? expiryTone(info.exp_date, settings.expiryWarningDays) : 'muted';
  const remaining = info ? daysRemaining(info.exp_date) : null;
  const formats = info && Array.isArray(info.allowed_output_formats) ? info.allowed_output_formats.join(', ') : '';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <SectionTitle
            title="Connexion au compte"
            subtitle="URL M3U complète ou identifiants du serveur."
          />
          <Segmented mode={mode} onChange={(value) => { setMode(value); setError(''); }} />

          {mode === 'url' ? (
            <Field
              label="URL M3U"
              value={url}
              onChangeText={setUrl}
              placeholder="http://serveur:8080/get.php?username=…&password=…"
              autoCapitalize="none"
              multiline
              numberOfLines={3}
              hint="L’URL doit contenir username= et password=."
            />
          ) : (
            <>
              <Field
                label="Serveur"
                value={host}
                onChangeText={setHost}
                placeholder="http://serveur:8080"
                keyboardType="url"
              />
              <Field
                label="Identifiant"
                value={username}
                onChangeText={setUsername}
                placeholder="username"
              />
              <Field
                label="Mot de passe"
                value={password}
                onChangeText={setPassword}
                placeholder="password"
                secure
              />
            </>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            title={loading ? 'Connexion…' : 'Vérifier le compte'}
            onPress={verifier}
            loading={loading}
            style={{ marginTop: spacing.sm }}
          />
        </Card>

        {result ? (
          <Card style={{ marginTop: spacing.lg }}>
            <View style={styles.resultHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultHost}>{shortHost(result.credentials.host)}</Text>
                <Text style={styles.resultUser}>{result.credentials.username}</Text>
              </View>
              <Badge label={statusLabel(info.status)} tone={statusTone(info.status)} />
            </View>

            <View style={styles.statsRow}>
              <Stat label="Expiration" value={expiration} tone={tone === 'muted' ? undefined : tone} />
              <Stat
                label="Restant"
                value={remaining === null ? '—' : remaining < 0 ? 'Expiré' : `${remaining} j`}
                tone={remaining !== null && remaining < 0 ? 'danger' : remaining !== null && remaining <= settings.expiryWarningDays ? 'warning' : undefined}
              />
            </View>

            <View style={styles.kvGroup}>
              <KeyValue label="Statut" value={statusLabel(info.status)} />
              <KeyValue label="Connexions max." value={String(info.max_connections ?? '—')} />
              <KeyValue label="Connexions actives" value={String(info.active_cons ?? '—')} />
              <KeyValue label="Essai" value={String(info.is_trial) === '1' ? 'Oui' : 'Non'} />
              <KeyValue label="Formats autorisés" value={formats || 'Aucun'} />
              <KeyValue label="Serveur" value={result.credentials.host} />
            </View>

            <View style={styles.categories}>
              <Text style={styles.categoriesTitle}>Catégories du compte</Text>
              {categories ? (
                <View style={styles.statsRow}>
                  <Stat label="Chaînes" value={categories.live === null ? '?' : String(categories.live)} />
                  <Stat label="Films" value={categories.vod === null ? '?' : String(categories.vod)} />
                  <Stat label="Séries" value={categories.series === null ? '?' : String(categories.series)} />
                </View>
              ) : (
                <Text style={styles.categoriesHint}>
                  {active ? 'Chargement des catégories…' : 'Disponible pour un compte actif.'}
                </Text>
              )}
            </View>

            <View style={styles.actions}>
              <Button title="Réinitialiser" variant="secondary" onPress={reset} small />
            </View>
          </Card>
        ) : null}

        {result && active ? (
          <Card style={{ marginTop: spacing.lg }}>
            <SectionTitle
              title="Test de flux"
              subtitle="Vérifie qu’une URL de flux renvoie bien des données."
            />
            <Field
              label="URL du flux"
              value={streamUrl}
              onChangeText={setStreamUrl}
              placeholder="http://serveur/live/user/pass/1234.ts"
              autoCapitalize="none"
            />
            <Button
              title={streamLoading ? 'Test en cours…' : 'Tester le flux'}
              onPress={testerFlux}
              loading={streamLoading}
              variant="secondary"
              disabled={!streamUrl.trim()}
            />
            {streamResult ? (
              <View style={styles.streamResult}>
                <StatusDot tone={streamResult.ok ? 'success' : 'danger'} />
                <Text style={[styles.streamText, { color: streamResult.ok ? colors.success : colors.danger }]}>
                  {streamResult.ok ? 'Flux accessible' : `Échec : ${streamResult.detail}`}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        <Text style={styles.footnote}>
          Les identifiants ne quittent jamais l’appareil : ils servent uniquement aux requêtes vers ton serveur.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.sm - 2,
  },
  segmentActive: {
    backgroundColor: colors.cardAlt,
  },
  segmentText: {
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.text,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    fontSize: font.small,
    lineHeight: 19,
  },
  resultHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  resultHost: {
    color: colors.text,
    fontSize: font.h2,
    fontWeight: '800',
  },
  resultUser: {
    color: colors.muted,
    fontSize: font.small,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  kvGroup: {
    marginTop: spacing.sm,
  },
  categories: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  categoriesTitle: {
    color: colors.muted,
    fontSize: font.small,
    fontWeight: '700',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  categoriesHint: {
    color: colors.faint,
    fontSize: font.small,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
  streamResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  streamText: {
    fontSize: font.small,
    fontWeight: '600',
    flexShrink: 1,
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
