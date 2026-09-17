# SolarShift Certainty Engine™ — Rulebook métier v1.1

## Objet

Le Certainty Engine mesure la **maturité et la certitude d'un projet**, pas une probabilité de succès ni un score de risque. Il garde séparés :

`Raw score (0–100, qualité intrinsèque) × Confidence (L0–L5, fiabilité de l'information) = Effective score`

Les coefficients L0–L5 restent à arbitrer : voir le conflit documenté dans AGENTS.md. Une inconnue diminue la certitude et peut produire une action ou une revue ; elle ne devient jamais automatiquement un score de qualité nul.

## Dimensions et formule

Le moteur produit :

- **Data Confidence (DC)** : couverture, qualité, fraîcheur, cohérence, traçabilité et validation des données ;
- **Project Quality (PQ)** : qualité intrinsèque Site, Énergie, Économie, Réglementation, Réseau, Client/contrat et Exécution ;
- **Investment Readiness (IR)** : préparation réelle du dossier pour une revue investissement ;
- **Certainty Score (CS)** : synthèse explicable.

`CS = 30 % × DC + 40 % × PQ + 30 % × IR`

Pondération de domaines :

| Domaine | Poids |
|---|---:|
| A — Site & solaire | 15 % |
| B — Consommation & énergie | 15 % |
| C — Économie | 20 % |
| D — Réglementation | 10 % |
| E — Réseau | 10 % |
| F — Client & contractualisation | 15 % |
| G — Technique & exécution | 10 % |
| H — Données & documentation | 5 % |

Les contributions sont enregistrées par paramètre : raw score, confidence, effective score, poids, contribution, reason code et explication. Les résultats ne peuvent donc pas être une boîte noire.

## Investment Readiness

| IR | Interprétation |
|---:|---|
| 0–39 | Non-investable à ce stade |
| 40–59 | Préqualification |
| 60–74 | Pré-finançable |
| 75–89 | Finançable |
| 90–100 | Dossier d'investissement complet |

Ces seuils sont internes SolarShift et doivent être lus depuis un RuleSet versionné.

## Critical Gates

Les gates sont indépendants des scores. Ils indiquent une revue humaine nécessaire, ne rejettent pas automatiquement le projet.

| Gate | Déclencheur métier |
|---|---|
| `STRUCTURAL_REVIEW_REQUIRED` | G01 absent, conditionnel ou incompatibilité à examiner |
| `REGULATORY_REVIEW_REQUIRED` | D06 non validé, rejeté ou contrainte à examiner |
| `GRID_FEASIBILITY_REVIEW` | E04 inconnu, conditionnel ou impossible à examiner |
| `SITE_RIGHTS_REQUIRED` | F02 ou droits/durée d'installation non établis |
| `CONTRACT_DURATION_REVIEW` | F07 incompatible ou insuffisamment établi |
| `ECONOMIC_VIABILITY_REVIEW` | KPI/économie ne satisfont pas les conditions versionnées |
| `EVIDENCE_COVERAGE_REQUIRED` | H07 insuffisant selon le RuleSet |

Un gate actif affiche `HUMAN_REVIEW_REQUIRED`. Une incompatibilité avérée est visible avec son statut et sa preuve ; elle n'est pas camouflée par un bon CS.

## Paramètres critiques et règles d'interprétation

Les paramètres critiques comprennent notamment B01, C01, C03, C09, D06, E01/E02/E04/E06, F01/F02/F03/F06/F07, G01/G02 et H04/H07. Les paramètres requis enrichissent un score complet ; les autres peuvent être acquis progressivement.

Exemple : `G01=UNKNOWN` signifie *structure non vérifiée*, donc confiance réduite et action « obtenir étude structure ». `G01=IMPOSSIBLE`, s'il est établi par preuve valide, alimente le risque technique et le gate ; le système ne transforme pas silencieusement une inconnue en impossibilité.

## Statut, audit et reproductibilité

Le moteur n'écrit pas directement une décision métier depuis le frontend. Toute exécution conserve les versions de framework, RuleSet et modèle, le snapshot de données, l'horodatage et les composants. Toute modification de règle ou de poids exige une version de RuleSet, tests de régression, approbation et audit.

## Responsabilités

L'IA aide à extraire et détecter ; elle ne valide pas seule. Le moteur déterministe applique les formules et gates. L'expert et SolarShift valident selon leurs compétences. Le frontend présente chaque contribution, preuve, incertitude, gate et action associée.
