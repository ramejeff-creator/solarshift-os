# SolarShift — Architecture technique v1.0

## Principe directeur

`UI → API authentifiée → Supabase (Auth, DB, Storage) → Edge Functions → moteurs métier`

L'interface rend les formulaires, tableaux, graphiques et résultats. Supabase conserve la vérité métier. Les Edge Functions exécutent Document Engine, Calculation Engine, Rule Engine, Certainty, Risk, Resilience et Decision Engine. Aucun calcul critique n'est uniquement côté frontend.

## Modèle logique

| Entité | Responsabilité et champs structurants |
|---|---|
| PROJECTS | UUID, référence auto `SOL-YYYY-#####`, nom, statut/stage, adresse, client/propriétaire/occupant/mandataire, bâtiment, activité, surfaces, durée cible, dates |
| ORGANISATIONS / CLIENTS / CONTACTS | identité légale, SIREN/SIRET, forme, activité, coordonnées ; un client peut avoir plusieurs projets |
| PROJECT_PARAMETERS | valeur typée (numérique/texte/bool/date/JSON), code, unité, source, confiance, validation, calcul, version, dates |
| DOCUMENTS | projet, type, fichier/stockage, auteur/date, date documentaire, statut de traitement/extraction, checksum, version |
| EVIDENCES | projet, paramètre, document/source, type, valeur extraite, confiance, date, page, extrait, méthode, validation |
| CALCULATED_KPIS | code, valeur, unité, formule/version, paramètres sources, horodatage |
| CERTAINTY_SCORES / SCORE_COMPONENTS | résultat et explication : raw, confidence, effective, poids, contribution, reason code |
| RISK_ASSESSMENTS / RISK_FACTORS | score global/par domaine, exposition, sévérité, preuve, mitigation, statut |
| RESILIENCE_ASSESSMENTS | score global et composants (production, autoconsommation, réseau, autonomie, stockage, backup, charges critiques, diversification) |
| ACTIONS | code, priorité, coût/délai, impact Risk/Certainty/Resilience, statut, attribution |
| SCENARIOS | `BASE`, `DEGRADED`, `STRESS`, hypothèses, KPI et scores |
| CONTRADICTIONS | deux preuves et valeurs, sévérité, explication, statut/résolution |
| VALIDATIONS / AUDIT_LOG | transitions, auteur, commentaire ; entité, ancien/nouveau, motif, utilisateur, date |
| RULESETS | code, version, statut, validité, règles JSON, auteur/dates |
| API_CONNECTIONS / API_REQUEST_LOGS / API_DATA_MAPPINGS | connecteurs, normalisation, logs sans secret |

Documents initiaux : `INVOICE`, `CONSUMPTION_HISTORY`, `LOAD_PROFILE`, `ROOF_PLAN`, `CADASTRAL_PLAN`, `PHOTOS`, `STRUCTURAL_REPORT`, `ELECTRICAL_REPORT`, `URBANISM_DOCUMENT`, `EPC_QUOTE`, `CONTRACT`, `LEASE`, `COMPANY_DOCUMENT`, `OTHER`.

## Fonctions serveur prévues

`create-project`, `upload-document`, `process-document`, `extract-parameters`, `validate-parameters`, `calculate-kpis`, `calculate-certainty`, `calculate-risk`, `calculate-resilience`, `generate-actions`, `calculate-scenarios`, `generate-investor-memo` et `recalculate-project`.

`recalculate-project` réexécute toutes les dépendances après modification significative, sans ne mettre à jour que le score final.

## Pipeline de recalcul et dépendances

`Parameter updated → Evidence check → Contradiction check → KPI → Certainty → Risk → Resilience → Actions → Project status → Audit log`

Les dépendances forment un graphe. Exemple : `A05 → C03 Production → B07 autoconsommation → C06 économies → C07 revenus → C09 TRI → PQ / IR / CS → Risk → Actions`.

## Rule Engine et versioning

Les seuils, formules, poids, reason codes et gates résident dans des RuleSets versionnés, pas dans le frontend ou des constantes définitives. Tout résultat garde version de framework, RuleSet, modèle, paramètres sources et horodatage. Une valeur validée ne disparaît jamais : correction = nouvelle version + validation + audit.

## Evidence, IA et connecteurs

Le chemin de preuve est `PROJECT → PARAMETER → EVIDENCE → DOCUMENT/API/MEASUREMENT/SOURCE`. L'IA peut classifier, extraire, rapprocher et signaler des contradictions ; le moteur déterministe calcule, score, applique les gates et conserve l'audit. Les connecteurs externes passent par normalisation, validation et Evidence avant d'alimenter un paramètre. Les premiers connecteurs peuvent être des mocks remplaçables.

## Sécurité

Auth, stockage et RLS sont côté Supabase. ADMIN a l'accès global ; SOLARSHIFT gère les projets SolarShift ; MANDATAIRE accède à ses projets/clients/documents ; EXPERT aux projets attribués ; CLIENT à ses projets autorisés ; INVESTOR à ses dossiers explicitement autorisés. Aucune clé, secret ni token privé n'est exposé dans le client ni journalisé.

## Séparation des responsabilités

| Acteur | Responsabilité |
|---|---|
| IA | extraction, classification, rapprochement, contradiction, proposition/explication |
| Moteur déterministe | calcul, score, pondération, gate, versioning, audit |
| Mandataire | collecte, terrain, relation client |
| Expert | validations techniques, structure, électrique, urbanisme selon compétence |
| SolarShift | validation métier, règles, arbitrage |
| Client | documents et données d'activité/contractuelles |

## Critères d'architecture

La plateforme est extensible : organisations, contacts, documents, preuves, projets et permissions sont des services communs aux futurs modules. Cela n'autorise pas la construction anticipée de Marketplace, Investor Portal ou CRM complet dans le MVP.
