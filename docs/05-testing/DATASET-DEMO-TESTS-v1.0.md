# SolarShift — Dataset Demo & Tests v1.0

## Objet

Ce dataset est le jeu de démonstration et de régression V1. Toute donnée et tout document sont marqués **`DEMO DATA — NOT REAL`**. Le but n'est pas de calibrer définitivement les scores, mais de vérifier que les moteurs réagissent de manière cohérente à la qualité des données, aux risques, aux gates et à la situation économique.

## Référentiel de démonstration

Organisations : SolarShift Demo, Mandataire Grand Ouest, Mandataire Atlantique.

Clients : Industrie Atlantique SAS, Logistique Armor SAS, Distribution Ouest SAS, Agro Bretagne SAS, Services Grand Ouest SAS.

Chaque projet reçoit 5 à 10 documents fictifs : facture, historique de consommation, plan toiture, photos, devis EPC, document urbanisme, document contractuel et, selon le cas, rapport technique. Ils doivent tous être explicitement identifiés comme démo.

## Les cinq projets

| Projet | Profil | Comportement attendu |
|---|---|---|
| A — Projet solide | Dossier complet, consommation documentée, toiture et raccordement confirmés, économie cohérente, engagement client mature | Scores élevés ; `FINANCEABLE` ; pas de gate critique non résolu |
| B — Projet incomplet | Potentiel plausible mais données/documentation incomplètes ou non validées | `PRE_FINANCEABLE` ou revue ; Certainty et couverture de preuves limités, sans conclure que le projet est mauvais |
| C — Problème raccordement | Réseau/étude de raccordement non confirmé, conditionnel ou défavorable | Gate `GRID_FEASIBILITY_REVIEW`, action prioritaire étude/confirmation de raccordement ; revue humaine |
| D — Problème structure | Étude ou preuve structurelle absente, conditionnelle ou incompatible | Gate `STRUCTURAL_REVIEW_REQUIRED`, action prioritaire étude structure/toiture ; revue humaine |
| E — Économie borderline | Données techniques disponibles mais CAPEX, sizing, production ou hypothèses de prix rendent l'économie limite | `PRE_FINANCEABLE — ECONOMICS`, gate `ECONOMIC_VIABILITY_REVIEW` si la règle le justifie ; actions optimisation CAPEX/dimensionnement |

## Tests fonctionnels obligatoires

| ID | Test | Attendu |
|---|---|---|
| T01 | Créer A avec preuves critiques validées | chaîne Parameters → Evidence → KPI → Scores traçable ; statut Finançable selon RuleSet |
| T02 | Créer B avec inconnues et pièces manquantes | `UNKNOWN` ne devient pas mauvais score ; insuffisance de preuve/revue est visible |
| T03 | Positionner E04 de C à `UNKNOWN`/`CONDITIONAL` | `GRID_FEASIBILITY_REVIEW` et action adéquate ; pas de rejet automatique |
| T04 | Positionner G01 de D à `UNKNOWN`/`CONDITIONAL` | `STRUCTURAL_REVIEW_REQUIRED` et action adéquate ; pas de rejet automatique |
| T05 | Configurer E avec économie insuffisante selon RuleSet | revue de viabilité ; actions optimisation visibles et calculs audités |
| T06 | Modifier C01 CAPEX | recalcul complet des KPI dépendants, Certainty/Risk/Actions/Status et audit |
| T07 | Modifier A05 productible | propagation A05 → C03 → B07 → C06/C07 → C09 → moteurs et actions |
| T08 | Ajouter deux preuves divergentes pour B01 | contradiction `DOCUMENT_CONFLICT`/équivalent ouverte ; aucune valeur choisie silencieusement ; H04 affecté selon RuleSet |
| T09 | Remplacer une valeur validée | nouvelle version, validation et audit avec ancienne/nouvelle valeur, auteur, date et motif |
| T10 | Vérifier une carte de score | chaque contribution remonte au paramètre, à la preuve, au document/source, à la date et à la méthode |
| T11 | Lancer BASE/DEGRADED/STRESS | hypothèses et sorties stockées ; étiquetage stress test, pas prédiction |
| T12 | Contrôler les droits | RLS bloque l'accès hors périmètre pour Mandataire, Client, Expert et Investor |

## Tests de non-régression

À chaque changement de moteur ou de RuleSet :

1. Recalculer les cinq projets.
2. Vérifier scores, contributions et versions.
3. Vérifier gates et absences de rejet automatique indu.
4. Vérifier actions et statuts attendus.
5. Vérifier la traçabilité des résultats et l'audit.
6. Comparer aux attentes de ce document et consigner toute différence intentionnelle avec une nouvelle version du RuleSet.

## Critère de réussite

Le dashboard doit rendre les cinq comportements immédiatement lisibles :

`A → FINANCEABLE ; B → PRE-FINANCEABLE ; C → HUMAN REVIEW — GRID ; D → HUMAN REVIEW — STRUCTURE ; E → PRE-FINANCEABLE — ECONOMICS`.

Le dataset ne valide pas une perfection de calibration ; il valide une logique explicable, reproductible et sans confusion entre information inconnue, risque prouvé et donnée validée.
