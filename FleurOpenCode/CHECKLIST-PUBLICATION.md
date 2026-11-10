# Checklist — Publication de Jardin de Verdance

Hébergement choisi : **Cloudflare Pages** (URL `*.pages.dev`, déploiement par upload de dossier, gratuit, 100 % client-side).

## Phase 1 — Préparer le fichier final
- [ ] Renommer `FleurJ11.html` → `index.html`
- [ ] Mettre à jour `README.md` (nom du fichier courant, lien de jeu)
- [ ] Archiver les `.backup.html` dans `archive/` (ou les retirer du dépôt public)
- [ ] Ajouter favicon (`favicon.ico` ou `.svg`)
- [ ] Ajouter `<title>Jardin de Verdance</title>`
- [ ] Ajouter meta description + Open Graph (image 1200×630 pour le partage Reddit)
- [ ] Vérifier viewport meta pour mobile

## Phase 2 — Sauvegarde & compatibilité
- [ ] Bouton "Exporter la sauvegarde" (copie code base64 + affichage)
- [ ] Bouton "Importer la sauvegarde" (validation + confirmation avant écrasement)
- [ ] (Optionnel) Téléchargement fichier `.sav`
- [ ] Conserver la compatibilité des saves entre versions (check `version`)
- [ ] Documenter la politique offline (50 % / plafond 1 h)

## Phase 3 — Qualité & QA
- [ ] Corriger les tests (chemin `FleurJ10v3.html` → `index.html`) et les faire passer
- [ ] Tester sur Chrome / Firefox / Safari (desktop + mobile)
- [ ] Vérifier : pas de `NaN`, pas d'erreur console, pas de freeze
- [ ] Mobile : pas de débordement horizontal, boutons ≥ 44 px, touch OK
- [ ] Accessibilité de base (contraste, navigation clavier)

## Phase 4 — Internationalisation (avant Reddit)
- [ ] Extraire les textes dans un objet `i18n = { fr, en }`
- [ ] Fonction `t(key)` + attribut `data-i18n`
- [ ] Sélecteur de langue dans l'entête, persistance localStorage
- [ ] Traduire UI, descriptions, messages de reset
- [ ] Adapter `formaterGain` à la locale (virgule vs point)

## Phase 5 — Déploiement Cloudflare Pages
- [ ] Créer un compte Cloudflare
- [ ] Workers & Pages → Create → Pages → Upload assets
- [ ] Glisser le dossier contenant `index.html` (+ favicon/assets)
- [ ] Vérifier l'URL `*.pages.dev`
- [ ] (Optionnel) Domaine personnalisé
- [ ] Tester le lien en navigation privée

## Phase 6 — Présentation & communauté
- [ ] Page Cloudflare/itch.io : description, durée (~30 j), mécaniques, lien feedback
- [ ] Cover image + tags (`incremental`, `idle`, `flowers`)
- [ ] GIF de gameplay (10–15 s)
- [ ] Changelog / devlog
- [ ] Licence (`LICENSE`, ex. MIT)
- [ ] Ajouter un lien "Feedback" dans le jeu

## Phase 7 — Lancement
- [ ] Post Reddit (r/incremental_games, r/galaxyclick) avec lien + GIF
- [ ] Répondre aux retours les premiers jours
- [ ] Planifier la v1.1 (nouvelles fleurs/couleurs, équilibrage)

## Règle d'or
Ne jamais casser les sauvegardes existantes entre versions. Garder le check `version` et migrer si besoin.
