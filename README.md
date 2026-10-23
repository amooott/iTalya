# iTalya — Inspecteur Xtream (Talya)

Portage iPhone de l’**Inspecteur Xtream** (`main.py` / `xtream_inspector`) :
comptes **Xtream Codes** et **Stalker/Ministra**, lots TXT/M3U, catégories,
test de flux, portails, nettoyeur, doublons, générateur de MAC et registre
des comptes.

Logo : écran ambre sur carré arrondi ardoise (`assets/icon.png`).

Application **Expo SDK 52 / React Native 0.76**, compilée en `.ipa` par GitHub
Actions (aucun Mac requis). Version 1.2.0.

---

## 1. Fonctionnalités

### Vérifier (Xtream)
- URL M3U complète ou serveur + identifiant + mot de passe ;
- statut, expiration et jours restants, connexions max/actives, essai, formats ;
- nombre de catégories **Chaînes / Films / Séries** ;
- **scan des catégories** : choix du type, liste des catégories puis des éléments,
  test individuel ou par lot (1, 5, 10, 25, 50, 100 ou Tous), progression et
  partage du rapport ;
- test d’une URL de flux (lecture des premiers octets).

### Stalker / Ministra
- portail MAG + adresse MAC, portails récents mémorisés (50) ;
- poignée de main `portal.php`, profil, expiration, chaînes ;
- catégories Live / VOD / Séries ;
- **test des flux** : catégories, éléments via `get_ordered_list`, lien
  `create_link`, lecture des premiers octets ;
- mode **Liste** : une ligne par compte (`portail MAC` ou MAC seul), vérification
  parallèle, exports CSV et Excel ;
- en-tête client `MAG250`, cookies `mac=…`, `X-User-Agent`.

### Lot (TXT / M3U)
- collage ou import `.txt`, extraction des URL `get.php?username=…` ;
- dédoublonnage, vérification parallèle avec progression ;
- filtres Tous / Actifs / Inactifs / Erreurs, recherche ;
- export **TXT** (actifs), **CSV** et **Excel** (tous).

### Mes comptes
- registre local de tous les comptes vérifiés (Xtream et Stalker) ;
- recherche, filtre par type, étiquette libre (60 caractères) ;
- revérification, suppression, **suppression des doublons** (le plus récent est
  conservé) ;
- export CSV ; onglet **Historique** (30 dernières vérifications).

### Outils
- **Nettoyeur** : M3U, portail, expression régulière, exclusion, export `.txt` ;
- **Portail** : DNS, test HTTP `/c/`, géolocalisation ipinfo.io ;
- **MAC** : modèle `00:1A:79:**:**:**`, génération unique, export `.txt` ;
- **Doublons** : détection Xtream (serveur + identifiant) et Stalker
  (portail + MAC), liste nettoyée partageable.

### Réglages
- timeouts, parallélisme (1–10), alerte d’expiration, User-Agent ;
- stockage local uniquement (AsyncStorage), aucune donnée envoyée ailleurs
  qu’aux serveurs interrogés.

---

## 2. Compiler l’IPA

### GitHub Actions (recommandé)

1. Pousser le projet sur `main`.
2. **Actions → Build iOS IPA → Run workflow**.
3. Télécharger l’artefact **`iTalya-ipa`** (~15 min) : `iTalya.ipa` + SHA-256.

Le workflow : `npm install`, `expo prebuild`, `pod install`, `xcodebuild`
Release sans signature, empaquetage `Payload/iTalya.app` → `iTalya.ipa`.

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
│   ├── api.js                   # Xtream : player_api.php, catégories, flux
│   ├── stalker.js               # Stalker/Ministra : handshake, profil, catégories
│   ├── accounts.js              # registre des comptes + portails mémorisés
│   ├── storage.js               # réglages + historique
│   ├── excel.js                 # export .xlsx (SheetJS)
│   ├── theme.js / utils.js / components.js
│   └── screens/
│       ├── CheckScreen.js       # compte Xtream
│       ├── CategoryBrowser.js   # scan des catégories Xtream
│       ├── BulkScreen.js        # lots TXT / M3U
│       ├── StalkerScreen.js     # compte + liste Stalker
│       ├── StalkerBrowser.js    # catégories + flux Stalker (create_link)
│       ├── AccountsScreen.js    # mes comptes + historique
│       ├── ToolsScreen.js       # nettoyeur, portail, MAC, doublons
│       └── SettingsScreen.js
├── assets/                      # icône ambre 1024 × 1024 + splash
├── scripts/generer_assets.py
└── .github/workflows/ios.yml
```

---

## 5. Différences avec la version bureau

Portés : validation d’URL, `player_api.php`, statuts, expiration, connexions,
catégories, **scan des catégories et test par lot**, extraction M3U, Stalker
(handshake, profil, catégories, `get_ordered_list`, `create_link`), portails,
nettoyeur, doublons, MAC, registre, historique, exports **CSV/Excel**.

Pas encore portés : copie Telegram (nécessite un client MTProto), planification
quotidienne (iOS limite l’exécution en arrière-plan), traductions multiples et
thèmes clair/sombre. Les 75 réglages sont ramenés aux options utiles sur mobile.

Les exports passent par la feuille de partage iOS (TXT/CSV/XLSX), pas par un
dossier `résultats`.

## 6. Notes techniques

- `NSAllowsArbitraryLoads` est activé : Xtream et Stalker sont souvent en
  `http://`.
- Stalker utilise toujours `http://` (comme la version bureau) ; les portails
  HTTPS à certificat invalide ne sont pas contournables avec `fetch` sur iOS.
- Bundle id `com.amooott.italya`.
- Timeouts : 5 s connexion / 12 s lecture par défaut, réglables.
