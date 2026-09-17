# SolarShift OS — Instructions de développement

SolarShift OS est une plateforme SaaS B2B modulaire de qualification, d'analyse, de sécurisation et d'orchestration de projets solaires B2B. Son premier module métier est le **Solar Project Qualification Engine**.

## Sources de vérité, dans cet ordre

1. `docs/02-data/DATA-DICTIONARY-v1.2.md`
2. `docs/03-architecture/ARCHITECTURE-TECHNIQUE-v1.0.md`
3. `docs/04-engines/CERTAINTY-ENGINE-v1.1.md`
4. `docs/04-engines/RISK-RESILIENCE-ENGINE-v1.0.md`
5. `docs/05-testing/DATASET-DEMO-TESTS-v1.0.md`
6. `docs/01-product/PRODUCT-SPECIFICATION-v1.0.md`

En cas de contradiction, ne pas choisir arbitrairement : isoler le conflit, le documenter et demander validation avant d'implémenter la règle concernée.

## Principes non négociables

- Ne jamais inventer une logique métier, un seuil, une formule, une donnée réglementaire ou un résultat financier.
- `UNKNOWN` n'est pas `BAD` : une inconnue diminue la certitude et déclenche éventuellement une revue humaine ; elle n'est pas une valeur défavorable.
- Un paramètre est une donnée ; un score est une interprétation. Ne pas les confondre ni écraser les valeurs sources.
- Toute donnée critique doit être traçable : `Parameter → Evidence → Document/Source → Date → Méthode → Validation`.
- Les calculs métier critiques sont côté serveur ; le frontend présente les résultats mais ne devient pas leur source de vérité.
- Les données, preuves, règles, calculs, scores, validations et décisions sont versionnés et auditables.
- Une donnée validée ne peut pas être silencieusement écrasée.
- Un gate signifie `HUMAN_REVIEW_REQUIRED`, jamais un rejet automatique sauf règle explicite et validée.

## Avant toute modification

1. Lire ce fichier et la documentation applicable.
2. Inspecter l'implémentation existante.
3. Proposer un plan, les impacts de données et les tests.

## Après toute modification

1. Exécuter les tests pertinents, le type checking et le linting.
2. Vérifier les migrations et les politiques RLS si elles sont concernées.
3. Rapporter les fichiers modifiés, les validations faites et les points non résolus.

## Ambiguïté à résoudre avant implémentation du score

Deux tables de confiance apparaissent dans le contexte : `L0=0, L1=.35, L2=.55, L3=.75, L4=.90, L5=1.00` et `L0=0, L1=.25, L2=.50, L3=.70, L4=.85, L5=1.00`. Aucune variante n'est arbitrée par ce pack. Ne pas implémenter les règles qui en dépendent avant validation métier explicite. L'ordre de lecture des sources ne permet pas de résoudre silencieusement une contradiction.

Ce pack est une synthèse documentaire incomplète, à rapprocher des textes sources intégraux avant de servir de spécification d'implémentation. Les seuils détaillés, déclencheurs de gates, formules manquantes et valeurs du dataset doivent être vérifiés ; ne pas les déduire des résumés.
