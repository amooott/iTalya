# iTalya — Inspecteur Xtream (iOS)

Portage iPhone de l’**Inspecteur Xtream** (`main.py` / `xtream_inspector`) :
vérification de comptes Xtream Codes, lots TXT/M3U, catégories, test de flux,
portails, nettoyeur de listes et générateur de MAC.

Application **Expo SDK 52 / React Native 0.76**, compilée en `.ipa` par GitHub
Actions (aucun Mac requis).

---

## 1. Fonctionnalités

### Vérifier
- URL M3U complète ou serveur + identifiant + mot de passe ;
- statut du compte (`Active`, `Expired`, `Banned`…), expiration et jours restants ;
- connexions maximum / actives, essai, formats autorisés ;
- nombre de catégories **Chaînes / Films / Séries** ;
- test d’une URL de flux (lecture des premiers octets).

### Lot (TXT / M3U)
- collage direct ou import d’un fichier `.txt` ;
- extraction des URL `get.php?username=…`, dédoublonnage ;
- vérification avec parallélisme réglable et barre de progression ;
- filtres Tous / Actifs / Inactifs / Erreurs, recherche ;
- détail d’un compte + catégories à la demande ;
- export **TXT** (URL actives) et **CSV** (tous les résultats) via la feuille de
  partage iOS.

### Outils
- **Nettoyeur** : modes M3U, portail et expression régulière, exclusion,
  dédoublonnage, export `.txt` ;
- **Portail** : résolution DNS, test HTTP `/c/`, géolocalisation ipinfo.io ;
- **MAC** : modèle `00:1A:79:**:**:**`, génération unique, export `.txt`.

### Historique et réglages
- 30 dernières vérifications stockées localement ;
- timeouts, parallélisme, alerte d’expiration, User-Agent ;
- aucune donnée envoyée ailleurs qu’aux serveurs interrogés.

---

## 2. Compiler l’IPA

### GitHub Actions (recommandé)

1. Pousser le projet sur `main`.
2. **Actions → Build iOS IPA → Run workflow**.
3. Télécharger l’artefact **`iTalya-ipa`** (~15 min) : `iTalya.ipa` + SHA-256.

Le workflow :

- `npm install`, `expo prebuild`, `pod install` ;
- `xcodebuild` Release avec `CODE_SIGNING_ALLOWED=NO` ;
- empaquetage `Payload/iTalya.app` → `iTalya.ipa` ;
- publication de l’artefact (90 jours).

### Mac + Xcode

```bash
npm install
npx expo prebuild --platform ios
cd ios && pod install && cd ..
open ios/iTalya.xcworkspace
```

### EAS Build

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile preview
```

---

## 3. Installer sur l’iPhone

L’IPA produit est **non signé** : iOS refuse de l’installer tel quel.

1. **Sideloadly** (Windows/macOS) ou **AltStore** : glisser l’IPA, saisir son
   identifiant Apple, installer.
2. Compte Apple gratuit : valable 7 jours, 3 applications maximum.
3. Compte Apple Developer (99 $/an) : signature un an, ad hoc ou TestFlight.

---

## 4. Structure

```
.
├── App.js                       # navigation, en-tête, onglets
├── src/
│   ├── api.js                   # player_api.php, catégories, test de flux
│   ├── storage.js               # réglages + historique (AsyncStorage)
│   ├── theme.js
│   ├── utils.js
│   ├── components.js
│   └── screens/
│       ├── CheckScreen.js       # vérification d’un compte
│       ├── BulkScreen.js        # lots TXT / M3U
│       ├── ToolsScreen.js       # nettoyeur, portail, MAC
│       ├── HistoryScreen.js
│       └── SettingsScreen.js
├── assets/                      # icône 1024 × 1024 + splash
├── scripts/generer_assets.py
└── .github/workflows/ios.yml
```

---

## 5. Différences avec la version bureau

Le cœur Xtream est repris : validation d’URL, `player_api.php`, statuts,
expiration, connexions, catégories, extraction M3U, dédoublonnage, portails,
MAC. Ne sont pas encore portés : scan complet d’une catégorie (chaque chaîne,
film, série), portails Stalker, exports Excel natifs et copie Telegram.

Les exports se font en TXT/CSV via la feuille de partage iOS (pas de disque
`résultats`).

## 6. Notes techniques

- `NSAllowsArbitraryLoads` est activé : les serveurs Xtream sont souvent en
  `http://` sans TLS.
- Le bundle id est `com.amooott.italya` (aligné sur la release existante).
- Timeouts : 5 s connexion / 12 s lecture par défaut, réglables.
