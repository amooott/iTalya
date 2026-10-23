import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, SectionTitle } from '../components';
import { DEFAULT_SETTINGS, saveSettings } from '../storage';
import { colors, font, spacing } from '../theme';
import { clampInt } from '../utils';

export default function SettingsScreen({ settings, onSave }) {
  const [connectTimeout, setConnectTimeout] = useState(String(settings.connectTimeout));
  const [readTimeout, setReadTimeout] = useState(String(settings.readTimeout));
  const [concurrency, setConcurrency] = useState(String(settings.concurrency));
  const [warningDays, setWarningDays] = useState(String(settings.expiryWarningDays));
  const [userAgent, setUserAgent] = useState(settings.userAgent);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConnectTimeout(String(settings.connectTimeout));
    setReadTimeout(String(settings.readTimeout));
    setConcurrency(String(settings.concurrency));
    setWarningDays(String(settings.expiryWarningDays));
    setUserAgent(settings.userAgent);
  }, [settings]);

  const enregistrer = async () => {
    const next = {
      connectTimeout: clampInt(connectTimeout, 1, 30, DEFAULT_SETTINGS.connectTimeout),
      readTimeout: clampInt(readTimeout, 3, 60, DEFAULT_SETTINGS.readTimeout),
      concurrency: clampInt(concurrency, 1, 10, DEFAULT_SETTINGS.concurrency),
      expiryWarningDays: clampInt(warningDays, 1, 365, DEFAULT_SETTINGS.expiryWarningDays),
      userAgent: userAgent.trim() || DEFAULT_SETTINGS.userAgent,
      _language: settings._language,
    };
    await saveSettings(next);
    onSave(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const reinitialiser = () => {
    Alert.alert('Réinitialiser les réglages ?', 'Les valeurs par défaut seront appliquées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Réinitialiser',
        style: 'destructive',
        onPress: async () => {
          await saveSettings(DEFAULT_SETTINGS);
          onSave(DEFAULT_SETTINGS);
          setConnectTimeout(String(DEFAULT_SETTINGS.connectTimeout));
          setReadTimeout(String(DEFAULT_SETTINGS.readTimeout));
          setConcurrency(String(DEFAULT_SETTINGS.concurrency));
          setWarningDays(String(DEFAULT_SETTINGS.expiryWarningDays));
          setUserAgent(DEFAULT_SETTINGS.userAgent);
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <SectionTitle title="Réseau" subtitle="Délais et parallélisme des vérifications." />
        <Field
          label="Délai de connexion (secondes)"
          value={connectTimeout}
          onChangeText={setConnectTimeout}
          keyboardType="number-pad"
        />
        <Field
          label="Délai de lecture (secondes)"
          value={readTimeout}
          onChangeText={setReadTimeout}
          keyboardType="number-pad"
        />
        <Field
          label="Vérifications simultanées (1 à 10)"
          value={concurrency}
          onChangeText={setConcurrency}
          keyboardType="number-pad"
        />
        <Field
          label="User-Agent"
          value={userAgent}
          onChangeText={setUserAgent}
          autoCapitalize="none"
        />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <SectionTitle title="Analyse" subtitle="Seuils d’alerte sur l’expiration." />
        <Field
          label="Alerte expiration (jours)"
          value={warningDays}
          onChangeText={setWarningDays}
          keyboardType="number-pad"
        />
      </Card>

      {saved ? <Text style={styles.saved}>Réglages enregistrés.</Text> : null}

      <Button title="Enregistrer les réglages" onPress={enregistrer} style={{ marginTop: spacing.lg }} />
      <Button
        title="Réinitialiser"
        variant="ghost"
        onPress={reinitialiser}
        style={{ marginTop: spacing.sm }}
      />

      <Card style={{ marginTop: spacing.xxl }}>
        <SectionTitle title="À propos" />
        <Text style={styles.about}>
          iTalya · Inspecteur Xtream{'\n'}
          Version 1.1.0 (build 2){'\n\n'}
          Comptes Xtream Codes et Stalker/Ministra, lots TXT/M3U, catégories,
          test de flux, portails, nettoyeur, doublons, MAC et registre des comptes.
        </Text>
        <Text style={styles.disclaimer}>
          Outil de diagnostic. Utilise-le uniquement sur les comptes et serveurs dont tu as
          l’autorisation.
        </Text>
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
  saved: {
    color: colors.success,
    fontSize: font.small,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  about: {
    color: colors.muted,
    fontSize: font.small,
    lineHeight: 21,
  },
  disclaimer: {
    color: colors.faint,
    fontSize: font.tiny,
    lineHeight: 17,
    marginTop: spacing.md,
  },
});
