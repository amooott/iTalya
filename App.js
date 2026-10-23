import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const CLE_STOCKAGE = '@italya/taches/v1';
const LONGUEUR_MAX = 160;

const FILTRES = [
  { cle: 'toutes', libelle: 'Toutes' },
  { cle: 'afaire', libelle: 'À faire' },
  { cle: 'faites', libelle: 'Terminées' },
];

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

function dateLisible() {
  const maintenant = new Date();
  return `${JOURS[maintenant.getDay()]} ${maintenant.getDate()} ${MOIS[maintenant.getMonth()]}`;
}

function nouvelIdentifiant() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normaliserTaches(valeur) {
  if (!Array.isArray(valeur)) return [];
  return valeur
    .filter((tache) => tache && typeof tache.texte === 'string' && tache.texte.trim() !== '')
    .map((tache) => ({
      id: typeof tache.id === 'string' ? tache.id : nouvelIdentifiant(),
      texte: tache.texte.slice(0, LONGUEUR_MAX),
      fait: Boolean(tache.fait),
      creeLe: Number(tache.creeLe) || Date.now(),
    }));
}

const Tache = React.memo(function Tache({ tache, onBasculer, onSupprimer }) {
  return (
    <View style={styles.carte}>
      <Pressable
        onPress={() => onBasculer(tache.id)}
        hitSlop={10}
        style={({ pressed }) => [styles.zoneCase, pressed && styles.presse]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: tache.fait }}
        accessibilityLabel={`${tache.texte}, ${tache.fait ? 'terminée' : 'à faire'}`}
      >
        <View style={[styles.case, tache.fait && styles.caseCochee]}>
          {tache.fait ? <Text style={styles.coche}>✓</Text> : null}
        </View>
      </Pressable>

      <Pressable
        onPress={() => onBasculer(tache.id)}
        style={styles.zoneTexte}
        accessibilityRole="button"
        accessibilityLabel={`Basculer ${tache.texte}`}
      >
        <Text
          style={[styles.texteTache, tache.fait && styles.texteTacheFaite]}
          numberOfLines={3}
        >
          {tache.texte}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onSupprimer(tache.id)}
        hitSlop={12}
        style={({ pressed }) => [styles.boutonSupprimer, pressed && styles.presse]}
        accessibilityRole="button"
        accessibilityLabel={`Supprimer ${tache.texte}`}
      >
        <Text style={styles.croix}>✕</Text>
      </Pressable>
    </View>
  );
});

function Contenu() {
  const [taches, setTaches] = useState([]);
  const [brouillon, setBrouillon] = useState('');
  const [filtre, setFiltre] = useState('toutes');
  const [pret, setPret] = useState(false);
  const entree = useRef(null);

  // Chargement unique des tâches enregistrées sur l'appareil.
  useEffect(() => {
    let annule = false;

    (async () => {
      try {
        const brut = await AsyncStorage.getItem(CLE_STOCKAGE);
        if (!annule && brut) {
          setTaches(normaliserTaches(JSON.parse(brut)));
        }
      } catch (erreur) {
        // Stockage illisible : on repart d'une liste vide plutôt que de planter.
      } finally {
        if (!annule) setPret(true);
      }
    })();

    return () => {
      annule = true;
    };
  }, []);

  // Sauvegarde à chaque modification, une fois le chargement terminé.
  useEffect(() => {
    if (!pret) return;
    AsyncStorage.setItem(CLE_STOCKAGE, JSON.stringify(taches)).catch(() => {});
  }, [taches, pret]);

  const ajouter = useCallback(() => {
    const texte = brouillon.trim();
    if (!texte) return;

    setTaches((precedentes) => [
      { id: nouvelIdentifiant(), texte: texte.slice(0, LONGUEUR_MAX), fait: false, creeLe: Date.now() },
      ...precedentes,
    ]);
    setBrouillon('');
    entree.current?.focus();
  }, [brouillon]);

  const basculer = useCallback((id) => {
    setTaches((precedentes) =>
      precedentes.map((tache) => (tache.id === id ? { ...tache, fait: !tache.fait } : tache)),
    );
  }, []);

  const supprimer = useCallback((id) => {
    setTaches((precedentes) => precedentes.filter((tache) => tache.id !== id));
  }, []);

  const effacerTerminees = useCallback(() => {
    Alert.alert(
      'Effacer les tâches terminées ?',
      'Cette action ne peut pas être annulée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer',
          style: 'destructive',
          onPress: () => setTaches((precedentes) => precedentes.filter((tache) => !tache.fait)),
        },
      ],
    );
  }, []);

  const { total, terminees } = useMemo(() => {
    const finies = taches.filter((tache) => tache.fait).length;
    return { total: taches.length, terminees: finies };
  }, [taches]);

  const restantes = total - terminees;
  const progression = total === 0 ? 0 : terminees / total;

  const tachesAffichees = useMemo(() => {
    if (filtre === 'afaire') return taches.filter((tache) => !tache.fait);
    if (filtre === 'faites') return taches.filter((tache) => tache.fait);
    return taches;
  }, [taches, filtre]);

  const messageVide =
    filtre === 'faites'
      ? 'Aucune tâche terminée pour le moment.'
      : filtre === 'afaire'
        ? 'Tout est fait. Profitez-en !'
        : 'Votre liste est vide. Ajoutez une première tâche.';

  const enTete = (
    <View>
      <View style={styles.entete}>
        <View style={styles.marque}>
          <View style={styles.pastille} />
          <Text style={styles.nomApplication}>iTalya</Text>
        </View>
        <Text style={styles.date}>{dateLisible()}</Text>
      </View>

      <View style={styles.resume}>
        <View style={styles.resumeHaut}>
          <Text style={styles.resumeTitre}>
            {restantes === 0 && total > 0
              ? 'Tout est terminé'
              : restantes === 0
                ? 'À vous de jouer'
                : `${restantes} tâche${restantes > 1 ? 's' : ''} à faire`}
          </Text>
          <Text style={styles.resumeCompteur}>
            {terminees}/{total}
          </Text>
        </View>
        <View style={styles.barreFond}>
          <View style={[styles.barreRemplie, { width: `${Math.round(progression * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.ligneSaisie}>
        <TextInput
          ref={entree}
          style={styles.champ}
          placeholder="Ajouter une tâche…"
          placeholderTextColor="#9CA3AF"
          value={brouillon}
          onChangeText={setBrouillon}
          onSubmitEditing={ajouter}
          returnKeyType="done"
          maxLength={LONGUEUR_MAX}
          blurOnSubmit={false}
          accessibilityLabel="Nouvelle tâche"
        />
        <Pressable
          onPress={ajouter}
          disabled={!brouillon.trim()}
          style={({ pressed }) => [
            styles.boutonAjouter,
            !brouillon.trim() && styles.boutonAjouterInactif,
            pressed && styles.presse,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Ajouter la tâche"
        >
          <Text style={styles.plus}>+</Text>
        </Pressable>
      </View>

      <View style={styles.filtres}>
        {FILTRES.map((option) => {
          const actif = filtre === option.cle;
          return (
            <Pressable
              key={option.cle}
              onPress={() => setFiltre(option.cle)}
              style={[styles.filtre, actif && styles.filtreActif]}
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
            >
              <Text style={[styles.filtreTexte, actif && styles.filtreTexteActif]}>
                {option.libelle}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (!pret) {
    return (
      <SafeAreaView style={styles.ecran}>
        <View style={styles.chargement}>
          <Text style={styles.nomApplication}>iTalya</Text>
          <Text style={styles.date}>Chargement de votre liste…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.ecran} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.conteneur}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={tachesAffichees}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Tache tache={item} onBasculer={basculer} onSupprimer={supprimer} />
          )}
          ListHeaderComponent={enTete}
          ListEmptyComponent={
            <View style={styles.vide}>
              <View style={styles.videIcone}>
                <Text style={styles.videIconeTexte}>✓</Text>
              </View>
              <Text style={styles.videTitre}>Rien à afficher</Text>
              <Text style={styles.videTexte}>{messageVide}</Text>
            </View>
          }
          ListFooterComponent={
            terminees > 0 ? (
              <Pressable
                onPress={effacerTerminees}
                style={({ pressed }) => [styles.effacer, pressed && styles.presse]}
                accessibilityRole="button"
              >
                <Text style={styles.effacerTexte}>
                  Effacer les tâches terminées ({terminees})
                </Text>
              </Pressable>
            ) : null
          }
          contentContainerStyle={styles.listeContenu}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FB" />
      <Contenu />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  ecran: {
    flex: 1,
    backgroundColor: '#F4F5FB',
  },
  conteneur: {
    flex: 1,
  },
  listeContenu: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    flexGrow: 1,
  },
  entete: {
    paddingTop: 12,
    paddingBottom: 18,
  },
  marque: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pastille: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4F46E5',
    marginRight: 10,
  },
  nomApplication: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: '#111827',
  },
  date: {
    marginTop: 6,
    fontSize: 15,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  resume: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  resumeHaut: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  resumeTitre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  resumeCompteur: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 12,
  },
  barreFond: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EEF0FF',
    overflow: 'hidden',
  },
  barreRemplie: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
  },
  ligneSaisie: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  champ: {
    flex: 1,
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  boutonAjouter: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  boutonAjouterInactif: {
    backgroundColor: '#C7C9F4',
    shadowOpacity: 0,
    elevation: 0,
  },
  plus: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '600',
    marginTop: -2,
  },
  filtres: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  filtre: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filtreActif: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filtreTexte: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filtreTexteActif: {
    color: '#FFFFFF',
  },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  zoneCase: {
    paddingRight: 12,
  },
  case: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#C7C9F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseCochee: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  coche: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  zoneTexte: {
    flex: 1,
    paddingVertical: 2,
  },
  texteTache: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 22,
  },
  texteTacheFaite: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  boutonSupprimer: {
    marginLeft: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  croix: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  presse: {
    opacity: 0.6,
  },
  vide: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 24,
  },
  videIcone: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  videIconeTexte: {
    fontSize: 24,
    color: '#4F46E5',
    fontWeight: '700',
  },
  videTitre: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  videTexte: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  effacer: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  effacerTexte: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  chargement: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
