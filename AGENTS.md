# SolarShift OS â€” Instructions de dÃ©veloppement

SolarShift OS est une plateforme SaaS B2B de qualification, dâ€™analyse, de sÃ©curisation et dâ€™orchestration de projets solaires B2B. Son premier module est le Solar Project Qualification Engine.

## Lecture obligatoire

1. `docs/02-data/DATA-DICTIONARY-v1.2.md`
2. `docs/04-engines/CERTAINTY-ENGINE-v1.1.md`
3. `docs/04-engines/RISK-RESILIENCE-ENGINE-v1.0.md`
4. `docs/03-architecture/ARCHITECTURE-TECHNIQUE-v1.0.md`
5. `docs/05-testing/DATASET-DEMO-TESTS-v1.0.md`
6. `docs/01-product/PRODUCT-SPECIFICATION-v1.0.md`
7. `docs/source/README.md`

Les originaux sont conservÃ©s dans `docs/source/`. Les spÃ©cifications Markdown sont les documents de travail ; elles doivent rester traÃ§ables aux originaux.

## RÃ¨gles non nÃ©gociables

- Ne pas inventer de rÃ¨gle, seuil, formule, donnÃ©e rÃ©glementaire, rÃ©sultat financier ni donnÃ©e de dÃ©monstration.
- `UNKNOWN` nâ€™est pas `BAD`. Une inconnue diminue la certitude, peut crÃ©er une action ou exiger une revue humaine, mais nâ€™est pas une donnÃ©e dÃ©favorable.
- Un paramÃ¨tre, une preuve, un KPI et un score sont des objets diffÃ©rents. Une donnÃ©e source validÃ©e nâ€™est jamais Ã©crasÃ©e par un calcul.
- Toute donnÃ©e critique suit `Parameter â†’ Evidence â†’ Document/Source â†’ Date â†’ MÃ©thode â†’ Validation`.
- Les calculs mÃ©tier critiques sâ€™exÃ©cutent cÃ´tÃ© serveur. Le frontend les prÃ©sente ; il ne les dÃ©finit pas.
- DonnÃ©es, preuves, RuleSets, calculs, scores, validations et dÃ©cisions sont versionnÃ©s et auditables.
- Un gate actif demande une revue humaine et bloque le statut lorsque la rÃ¨gle lâ€™exige ; il ne supprime jamais silencieusement un projet.

## AmbiguÃ¯tÃ© bloquante pour le scoring

Deux Ã©chelles de confiance sont prÃ©sentes dans les sources : `.35/.55/.75/.90` et `.25/.50/.70/.85` pour L1â€“L4. Cette contradiction est intentionnellement conservÃ©e. Ne pas implÃ©menter le calcul du score effectif, ni dÃ©clarer un projet finanÃ§able, avant une dÃ©cision mÃ©tier versionnÃ©e dans un ADR et un RuleSet.

## ProcÃ©dure de travail

Avant toute modification : lire les documents concernÃ©s, inspecter le code, identifier les dÃ©pendances, puis proposer un plan. AprÃ¨s toute modification : exÃ©cuter tests, type checking et linting applicables ; vÃ©rifier migrations et RLS ; rapporter fichiers, validations, risques et questions restantes.
