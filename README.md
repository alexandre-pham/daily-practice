# Suivi

Petite page personnelle de suivi de pratique.

## Sécurité

- Synchronisation via un gist secret GitHub. Utilise un token _fine-grained_ limité à la permission **Gists (read & write)**, avec une date d'expiration.
- Le token et le contenu du gist sont chiffrés (AES-GCM, clé dérivée de ta phrase secrète par PBKDF2-SHA256, 600 000 itérations). La phrase secrète n'est jamais stockée. Après déverrouillage, seule la clé dérivée est gardée dans le `sessionStorage` de l'onglet (survit au rechargement, effacée à la fermeture de l'onglet, 12 h maximum) ; bouton « Verrouiller » pour l'effacer.
- Migration depuis un gist non chiffré : comme GitHub garde l'historique des révisions, les données sont déplacées dans un nouveau gist chiffré et l'ancien est supprimé.
- Phrase secrète oubliée : « Déconnecter cet appareil », supprime le gist `suivi-piano.json` sur GitHub, puis reconnecte-toi avec une nouvelle phrase. Les données locales de l'appareil sont renvoyées dans un nouveau gist.
