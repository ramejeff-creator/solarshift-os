# SolarShift OS — Product Specification v1.0

## Mission

Construire une infrastructure de décision B2B qui transforme une opportunité solaire en projet :

`qualifié → documenté → vérifié → calculé → scoré → analysé → sécurisé → potentiellement finançable`

SolarShift OS est une plateforme durable et modulaire, non un prototype jetable. Le **Solar Project Qualification Engine** est le premier module. Le socle doit pouvoir accueillir ultérieurement Marketplace, Investor Portal, CRM/contacts/organisations, réseau de mandataires, intelligence territoriale, module institutionnel et API publique, sans les développer maintenant.

## Valeur et principe de décision

La valeur centrale est :

`Données + preuves + calcul + certitude + risque + résilience + actions = projet maîtrisé`

La chaîne de traitement est `Project → Parameters → Evidences → Calculations → Scores → Risks → Actions`. Le moteur métier prime sur l'interface.

## Utilisateurs et rôles

| Rôle | Finalité d'accès |
|---|---|
| ADMIN | Administration globale |
| SOLARSHIFT | Gestion et validation métier des projets SolarShift |
| MANDATAIRE | Ses projets, clients et documents autorisés |
| EXPERT | Projets explicitement attribués, validation spécialisée |
| CLIENT | Ses projets et documents autorisés |
| INVESTOR | Dossiers explicitement autorisés |
| INSTITUTION | Architecture prévue pour données/dossiers autorisés |

Les permissions sont appliquées par RLS, jamais seulement par masquage d'interface.

## Workflow projet

`LEAD → QUALIFICATION → DATA_COLLECTION → ANALYSIS → VALIDATION → PRE_FINANCEABLE → FINANCEABLE → CONTRACTING → EXECUTION → OPERATING → ARCHIVED`

Le statut est calculé ou validé par la logique serveur ; l'interface ne le décide pas seule.

## Cockpit et interfaces à prévoir

Navigation : Dashboard, Projets, Clients, Contacts, Organisations, Mandataires, Documents, Actions, Investisseurs, Analytics, Integrations, Settings.

Dans un projet : Overview, Data, Documents, Evidence, Economics, Certainty, Risk, Resilience, Actions, Scenarios, Investor Memo, Activity.

Le cockpit expose immédiatement Certainty, Project Quality, Data Confidence, Investment Readiness, Risk, Resilience, issues critiques et Next Best Actions. Chaque résultat ouvre son explication et ses preuves.

## Document Engine

Pipeline cible : `Upload → Classification → Extraction → Parameter mapping → Evidence creation → Contradiction check → Human validation`.

Une future IA peut extraire, classer, rapprocher et proposer, mais ne doit jamais prétendre à une extraction réelle lorsqu'elle est absente. Les connectors MVP peuvent être simulés : Enedis, Cadastre, Solar, Weather et Company. Les données externes suivent toujours `Connector → Normalization → Validation → Evidence → Parameter`.

## Périmètre et séquence

Ne pas développer l'application avec ce pack. Pour une future construction :

1. Foundation : dépôt, configuration, tests, lint, types, Supabase de base.
2. Core Data : Auth, rôles, organisations, contacts, clients, projets, paramètres, documents, preuves, validations et audit.
3. Economics et KPI.
4. Certainty.
5. Risk et Resilience.
6. Decision/Actions et Cockpit.
7. Investor Memo, Analytics, puis dataset de régression.

Le MVP est validé uniquement lorsque le parcours de création de projet jusqu'au memo est traçable et reproductible, avec recalcul et audit après modification d'une donnée.
