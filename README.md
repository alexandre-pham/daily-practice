# Suivi

Page de suivi de séances pour plusieurs activités (piano, guitare…), en un seul fichier HTML, hébergée sur GitHub Pages et synchronisée entre appareils via un gist GitHub secret.

## Mise en place

### 1. Héberger la page sur GitHub Pages

1. Crée un dépôt, par exemple `suivi-piano` (public, ou privé si ton plan GitHub permet Pages sur les dépôts privés).
2. Ajoute `index.html` à la racine et pousse sur `main`.
3. Dans le dépôt : **Settings → Pages → Build and deployment**, source **Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Après une minute environ, la page est disponible sur `https://<ton-user>.github.io/suivi-piano/`.

### 2. Créer un token limité aux gists

Option recommandée, un token fine-grained :

1. **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Repository access : **Public repositories** (aucun accès aux dépôts n'est nécessaire).
3. Account permissions → **Gists : Read and write**. Rien d'autre.
4. Choisis une date d'expiration, puis copie le token.

Alternative : un token classic avec uniquement le scope `gist`.

### 3. Connecter chaque appareil

Ouvre la page, colle le token dans **Synchronisation GitHub**, puis **Connecter**.

- Sur le premier appareil, la page crée un gist secret contenant `suivi-piano.json`.
- Sur les appareils suivants, elle retrouve ce gist automatiquement.

Sur iPhone : Safari → Partager → **Sur l'écran d'accueil** pour l'avoir comme une appli.

## Fonctionnement

- Chaque activité a ses propres onglet, série, calendrier, historique et objectif hebdomadaire (réglable dans « Réglages »). « + Ajouter une activité » en crée une nouvelle. Toutes les activités sont stockées dans le même fichier `suivi-piano.json`.
- Les données d'une ancienne version (piano seul) sont reprises automatiquement dans l'activité Piano.

- Les séances sont enregistrées immédiatement dans le navigateur (`localStorage`), puis envoyées au gist environ une seconde après chaque modification.
- La page resynchronise à chaque retour au premier plan et au retour du réseau. Hors ligne, rien n'est perdu.
- Fusion par jour : pour chaque date, la modification la plus récente gagne. Les suppressions sont conservées sous forme de marqueur (`deleted: true`) pour se propager aux autres appareils.

## Sécurité

- Le token est stocké en clair dans le `localStorage` du navigateur de chaque appareil. Limite-le aux gists, avec une expiration.
- Toutes tes pages `*.github.io` partagent la même origine, donc le même `localStorage`. N'héberge pas sous ce domaine de code tiers en qui tu n'as pas confiance.
- Un gist « secret » n'apparaît pas dans ton profil, mais il est lisible par toute personne qui en a l'URL. Ici il ne contient que des noms d'activités, des durées et des notes.
- **Déconnecter cet appareil** efface le token de l'appareil. Pour le révoquer complètement, supprime-le dans les paramètres GitHub.
