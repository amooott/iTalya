# iTalya — application iOS (IPA)

Application de liste de tâches en français, construite avec **Expo SDK 52 /
React Native 0.76** et empaquetée pour iPhone sous forme de fichier `.ipa`.

Ce dossier contient le projet complet, une interface retravaillée et un
pipeline GitHub Actions qui compile l'IPA **sans avoir besoin d'un Mac**.

---

## 1. En bref

| Élément | Détail |
| --- | --- |
| Nom affiché | iTalya |
| Identifiant | `com.amooott.italya` |
| Version | 1.0.0 (build 1) |
| Plateforme | iOS 15.1 et plus, arm64 |
| Écran | Portrait, clair |
| Stockage | Tâches enregistrées sur l'appareil (AsyncStorage) |
| IPA fourni | `../iTalya.ipa` (4,77 Mo, non signé) |

L'IPA fourni à la racine du dossier de travail correspond au build publié du
dépôt [amooott/iTalya](https://github.com/amooott/iTalya). Le projet de ce
dossier est une version améliorée (interface, persistance, filtres) qu'il faut
recompiler pour obtenir un nouvel IPA.

---

## 2. Pourquoi l'IPA ne peut pas être compilé sous Windows

Un `.ipa` contient un exécutable Mach-O pour processeur ARM64, compilé avec la
chaîne d'outils d'Apple (Xcode, SDK iPhoneOS, `xcodebuild`, `codesign`). Cette
chaîne n'existe que sous macOS. Sous Windows, on peut :

- écrire et valider le code JavaScript (c'est fait : le bundle iOS se compile
  avec Metro) ;
- préparer le projet Xcode et le pipeline de compilation ;
- mais **pas** produire l'exécutable iOS ni signer l'application.

La compilation se fait donc sur un runner macOS (GitHub Actions), sur un Mac,
ou via EAS Build (service cloud d'Expo).

---

## 3. Obtenir un nouvel IPA

### Option A — GitHub Actions (recommandée, sans Mac)

1. Copier le contenu de ce dossier à la racine du dépôt GitHub (remplacer
   `App.js`, `app.json`, `package.json`, ajouter `assets/`, `eas.json`,
   `babel.config.js`, `package-lock.json` et `.github/workflows/ios.yml`).
2. Pousser sur `main`.
3. Ouvrir **Actions → Build iOS IPA → Run workflow**.
4. À la fin (environ 15 minutes), télécharger l'artefact **`iTalya-ipa`** :
   il contient `iTalya.ipa` et son empreinte SHA-256.

Le workflow :

- installe Node 20 et les dépendances npm ;
- génère le projet Xcode avec `expo prebuild` ;
- installe les pods CocoaPods ;
- compile en Release avec `CODE_SIGNING_ALLOWED=NO` ;
- empaquette `Payload/iTalya.app` dans `iTalya.ipa` ;
- publie l'artefact (conservé 90 jours) et le journal en cas d'échec.

> Le runner `macos-14` est gratuit pour les dépôts publics. Pour un dépôt privé,
> les minutes macOS sont facturées.

### Option B — EAS Build (compte Expo + compte Apple)

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile preview
```

EAS produit un IPA **signé** (distribution ad hoc) installable directement via
le lien fourni, à condition d'avoir enregistré l'UDID de l'iPhone et un profil
de provisionnement dans le compte Apple Developer (99 $/an).

### Option C — Mac + Xcode

```bash
npm install
npx expo prebuild --platform ios
cd ios && pod install && cd ..
open ios/iTalya.xcworkspace
```

Puis dans Xcode : sélectionner l'équipe de signature, brancher l'iPhone et
lancer, ou **Product → Archive** pour exporter un IPA.

---

## 4. Installer l'IPA sur un iPhone

L'IPA fourni **n'est pas signé** : iOS refuse de l'installer tel quel. Il faut
le re-signer avec un certificat Apple, ce que font les outils de sideloading :

- **Sideloadly** (Windows/macOS) — le plus simple : glisser l'IPA, saisir son
  identifiant Apple, installer.
- **AltStore / SideStore** — installation et re-signature automatique.

Avec un **compte Apple gratuit** : l'application fonctionne 7 jours, puis il
faut la re-signer ; 3 applications maximum et 10 identifiants par semaine.
Avec un **compte Apple Developer** (99 $/an) : signature valable un an,
distribution ad hoc ou TestFlight.

Autres cas : **TrollStore** (installation permanente) sur les versions d'iOS
compatibles, ou appareil jailbreaké.

---

## 5. Structure du projet

```
.
├── App.js                      # interface et logique de la liste de tâches
├── app.json                    # configuration Expo (nom, bundle id, icône…)
├── package.json                # dépendances
├── package-lock.json           # versions verrouillées
├── babel.config.js
├── eas.json                    # profils EAS Build
├── assets/
│   ├── icon.png                # icône 1024 × 1024 (sans transparence)
│   └── splash.png              # écran de démarrage 1284 × 2778
├── scripts/generer_assets.py   # régénère l'icône et le splash
└── .github/workflows/ios.yml   # compilation de l'IPA sur macOS
```

Fonctionnalités de l'application :

- ajout, suppression et validation d'une tâche ;
- filtres **Toutes / À faire / Terminées** ;
- barre de progression et compteur ;
- suppression groupée des tâches terminées ;
- sauvegarde locale automatique (AsyncStorage) ;
- interface en français, adaptée aux encoches (Safe Area) et au clavier.

---

## 6. Personnalisation

- **Nom** : `expo.name` dans `app.json`.
- **Identifiant** : `expo.ios.bundleIdentifier` — doit être unique et
  correspondre à celui utilisé pour la signature.
- **Version** : `expo.version` et `expo.ios.buildNumber`.
- **Icône** : remplacer `assets/icon.png` (1024 × 1024, PNG **sans** canal
  alpha) ou lancer `python scripts/generer_assets.py`.
- **Couleurs** : constantes en haut de `App.js` (`#4F46E5`, `#F4F5FB`, etc.).

---

## 7. Vérifications effectuées

- Bundle JavaScript iOS compilé avec Metro : **559 modules**, 984 ko, sans
  erreur (commande `npm run export:ios`).
- `app.json` validé par Expo.
- IPA existant contrôlé : archive ZIP valide, `Payload/iTalya.app`, binaire
  Mach-O **arm64**, `Info.plist` (iOS 15.1 minimum), `main.jsbundle` Hermes
  0.12.0 (bytecode HBC 96), absence de signature et de profil de
  provisionnement.
- SHA-256 de l'IPA fourni :
  `b5b94e849d27602bfc6b9f512b0f6f7d32e48ce891ba9bd3fadca527e76b8d50`.

---

## 8. Dépannage

| Problème | Piste |
| --- | --- |
| `pod install` échoue | `pod repo update`, vérifier Xcode 16 et CocoaPods à jour |
| `xcodebuild: scheme iTalya not found` | vérifier `ios/iTalya.xcodeproj` après `expo prebuild` |
| L'app se ferme au démarrage | vérifier que le bundle id et le profil de signature correspondent |
| IPA refusé à l'installation | l'IPA est non signé : le re-signer avec Sideloadly/AltStore |
| `expo prebuild` sous Windows | normal : la génération iOS nécessite macOS ou Linux |
