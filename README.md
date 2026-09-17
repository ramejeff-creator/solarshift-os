# SolarShift OS

Première synthèse documentaire pour le dépôt `solarshift-os`, à compléter et à valider. Elle présente le socle produit et technique du **Solar Project Qualification Engine** sans livrer d'application.

## Contenu

- `AGENTS.md` — règles de travail pour les agents de développement ;
- `docs/01-product/PRODUCT-SPECIFICATION-v1.0.md` — vision, périmètre et workflow ;
- `docs/02-data/DATA-DICTIONARY-v1.2.md` — les 60 paramètres de référence ;
- `docs/03-architecture/ARCHITECTURE-TECHNIQUE-v1.0.md` — architecture cible et modèle logique ;
- `docs/04-engines/CERTAINTY-ENGINE-v1.1.md` — maturité, certitude, gates et décision ;
- `docs/04-engines/RISK-RESILIENCE-ENGINE-v1.0.md` — risque, résilience, scénarios et actions ;
- `docs/05-testing/DATASET-DEMO-TESTS-v1.0.md` — cinq projets fictifs et tests de régression.

## Chaîne de vérité

`Projet → paramètres → preuves → calculs → scores → risques → actions → décision`

Les paramètres, preuves et résultats calculés restent distincts. Un score n'écrase jamais une donnée source.

## Démarrage recommandé

1. Lire `AGENTS.md`, puis le Data Dictionary.
2. Mener une analyse architecturale sans coder.
3. Faire valider les ambiguïtés documentées.
4. Construire ensuite le socle, puis les moteurs par phases et avec tests.

## État du pack

Documentation uniquement. Aucun code applicatif, schéma SQL exécutable ni secret n'est inclus.

Cette livraison n'est pas une reproduction intégrale des documents sources. Les 60 codes et leur répartition sont présents, mais le détail des règles, les formules, les déclencheurs de gates et les valeurs du dataset doivent encore être rapprochés de la conversation source. Les deux tables de coefficients de confiance sont en conflit et restent à arbitrer. Les formulations des autres fichiers ne valent pas résolution de ce conflit. Ne pas lancer l'implémentation métier avant cette vérification.
